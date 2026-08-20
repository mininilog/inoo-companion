(function(global){
"use strict";

const RECOVERY_VERSION="stage17-h06-recovery-1";
const BACKUP_FORMAT_VERSION="inoo-standard-recovery-1";
const RAW_EXPORT_FORMAT_VERSION="inoo-raw-recovery-1";
const PORTABLE_STATE_POLICY_VERSION="h06-portable-state-none-approved-1";
const ROLLBACK_POLICY_VERSION="h06-bounded-rollback-1";
const RESTORE_OPERATION_TYPE="canonical_recovery_restore";
const MAX_STANDARD_FILE_BYTES=8*1024*1024;
const MAX_ROLLBACK_ANCESTORS=2;
const PREVIEW_LIMIT=4;
const USER_SCHEMA_RESTORE_ADAPTERS=Object.freeze([]);
const previewRegistry=new Map();

const RECOVERY_FEATURE_DESCRIPTOR=Object.freeze({
  feature_id:"canonical_recovery",
  feature_schema_version:"1",
  read_capabilities:["canonical_user:read","recovery:raw_read"],
  write_capabilities:["canonical_user:restore_gate"],
  migration_owner:"canonical_recovery",
  state_namespace:"feature.canonical_recovery"
});

function recoveryError(code,details){
  const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;
}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function exactKeys(obj,allowed,code){
  if(!isObject(obj))throw recoveryError(code||"object_required");
  for(const k of Object.keys(obj))if(!allowed.has(k))throw recoveryError(code||"unknown_field",{field:k});
}
function nonEmptyString(v){return typeof v==="string"&&v.length>0;}
function validIso(v){return nonEmptyString(v)&&Number.isFinite(Date.parse(v));}
function sameJson(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch(_){return false;}}
function requestResult(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||recoveryError("idb_request_failed"));
  });
}
function transactionDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||recoveryError("idb_transaction_aborted"));
    tx.onerror=()=>{};
  });
}
function trimPreviewRegistry(){while(previewRegistry.size>PREVIEW_LIMIT)previewRegistry.delete(previewRegistry.keys().next().value);}

function ensureRecoveryFeature(foundation=global.InooIntegrityFoundation){
  if(!foundation||!foundation.defaultRegistry)throw recoveryError("recovery_foundation_unavailable");
  const registry=foundation.defaultRegistry;
  try{
    const existing=registry.getFeature(RECOVERY_FEATURE_DESCRIPTOR.feature_id);
    if(!sameJson(existing,RECOVERY_FEATURE_DESCRIPTOR))throw recoveryError("recovery_feature_descriptor_conflict");
    return existing;
  }catch(e){
    if(e&&e.code!=="feature_not_registered")throw e;
    return registry.registerFeature(RECOVERY_FEATURE_DESCRIPTOR);
  }
}

function personaDependencyEqual(a,b){
  if(!isObject(a)||!isObject(b))return false;
  return a.persona_package_id===b.persona_package_id&&
    a.persona_package_version===b.persona_package_version&&
    a.persona_package_hash_algorithm===b.persona_package_hash_algorithm&&
    a.persona_package_hash===b.persona_package_hash;
}
function assertPersonaDependency(dep){
  exactKeys(dep,new Set(["persona_package_id","persona_package_version","persona_package_hash_algorithm","persona_package_hash"]),"backup_persona_dependency_invalid");
  if(!nonEmptyString(dep.persona_package_id)||!nonEmptyString(dep.persona_package_version)||dep.persona_package_hash_algorithm!=="SHA-256"||!/^[0-9a-f]{64}$/.test(dep.persona_package_hash||"")){
    throw recoveryError("backup_persona_dependency_invalid");
  }
  return dep;
}

function snapshotBasis(snapshot){
  return {
    snapshot_id:snapshot.snapshot_id,
    lineage_id:snapshot.lineage_id,
    replica_id:snapshot.replica_id,
    parent_snapshot_id:snapshot.parent_snapshot_id,
    revision:snapshot.revision,
    user_schema_version:snapshot.user_schema_version,
    user_payload_hash:snapshot.user_payload_hash,
    operation_id:snapshot.operation_id,
    operation_type:snapshot.operation_type,
    purge_epoch:snapshot.purge_epoch,
    created_at:snapshot.created_at,
    ...(snapshot.operation_metadata!==undefined?{operation_metadata:snapshot.operation_metadata}:{})
  };
}
function assertSnapshotShape(snapshot){
  exactKeys(snapshot,new Set([
    "snapshot_id","lineage_id","replica_id","parent_snapshot_id","revision","user_schema_version","user_payload_hash",
    "operation_id","operation_type","purge_epoch","created_at","operation_metadata","snapshot_hash","payload"
  ]),"backup_snapshot_shape_invalid");
  if(!nonEmptyString(snapshot.snapshot_id)||!nonEmptyString(snapshot.lineage_id)||!nonEmptyString(snapshot.replica_id)||
    (snapshot.parent_snapshot_id!==null&&!nonEmptyString(snapshot.parent_snapshot_id))||!Number.isInteger(snapshot.revision)||snapshot.revision<1||
    !nonEmptyString(snapshot.user_schema_version)||!/^[0-9a-f]{64}$/.test(snapshot.user_payload_hash||"")||!nonEmptyString(snapshot.operation_id)||
    !nonEmptyString(snapshot.operation_type)||!Number.isInteger(snapshot.purge_epoch)||snapshot.purge_epoch<0||!validIso(snapshot.created_at)||
    !/^[0-9a-f]{64}$/.test(snapshot.snapshot_hash||"")||(snapshot.operation_metadata!==undefined&&!isObject(snapshot.operation_metadata)))throw recoveryError("backup_snapshot_shape_invalid");
  return snapshot;
}
function assertHeadShape(head){
  exactKeys(head,new Set(["name","lineage_id","snapshot_id","snapshot_hash","revision","purge_epoch","updated_at"]),"backup_head_shape_invalid");
  if(head.name!=="canonical"||!nonEmptyString(head.lineage_id)||!nonEmptyString(head.snapshot_id)||!/^[0-9a-f]{64}$/.test(head.snapshot_hash||"")||
    !Number.isInteger(head.revision)||head.revision<1||!Number.isInteger(head.purge_epoch)||head.purge_epoch<0||!validIso(head.updated_at)){
    throw recoveryError("backup_head_shape_invalid");
  }
  return head;
}
async function verifySnapshotRecord(snapshot,{storageApi=global.InooStorage,userStateApi=global.InooUserState,requireCanonical=true}={}){
  if(!storageApi||typeof storageApi.sha256Hex!=="function")throw recoveryError("recovery_storage_api_unavailable");
  assertSnapshotShape(snapshot);
  const payloadHash=await storageApi.sha256Hex(snapshot.payload);
  if(payloadHash!==snapshot.user_payload_hash)throw recoveryError("backup_snapshot_payload_hash_mismatch");
  const hash=await storageApi.sha256Hex(snapshotBasis(snapshot));
  if(hash!==snapshot.snapshot_hash)throw recoveryError("backup_snapshot_hash_mismatch");
  if(requireCanonical){
    if(!userStateApi||typeof userStateApi.validateCanonicalState!=="function")throw recoveryError("recovery_user_state_api_unavailable");
    resolveUserSchemaRestorePath(snapshot.user_schema_version,userStateApi.USER_SCHEMA_VERSION);
    userStateApi.validateCanonicalState(snapshot.payload);
  }
  return true;
}
function resolveUserSchemaRestorePath(sourceVersion,targetVersion){
  if(!nonEmptyString(sourceVersion)||!nonEmptyString(targetVersion))throw recoveryError("backup_user_schema_unsupported");
  if(sourceVersion===targetVersion)return Object.freeze([]);
  // No USER schema bump is approved in H-06. A future path must be explicitly registered before import is allowed.
  const path=USER_SCHEMA_RESTORE_ADAPTERS.find(x=>x&&x.from_version===sourceVersion&&x.to_version===targetVersion);
  if(!path)throw recoveryError("backup_user_schema_unsupported",{source:sourceVersion,target:targetVersion,reason:"explicit_adapter_path_missing"});
  return Object.freeze([path]);
}
function assertHeadMatchesSnapshot(head,snapshot){
  assertHeadShape(head);assertSnapshotShape(snapshot);
  if(head.lineage_id!==snapshot.lineage_id||head.snapshot_id!==snapshot.snapshot_id||head.snapshot_hash!==snapshot.snapshot_hash||
    head.revision!==snapshot.revision||head.purge_epoch!==snapshot.purge_epoch||head.updated_at!==snapshot.created_at){
    throw recoveryError("backup_head_snapshot_mismatch");
  }
}

function sensitiveMemoryCount(payload){
  if(!isObject(payload)||!Array.isArray(payload.memory_records))return 0;
  return payload.memory_records.filter(x=>x&&x.sensitivity==="sensitive").length;
}
function rollbackSensitiveCount(rollbackWindow){
  return (rollbackWindow&&Array.isArray(rollbackWindow.ancestors)?rollbackWindow.ancestors:[])
    .reduce((n,s)=>n+sensitiveMemoryCount(s&&s.payload),0);
}
function backupSensitiveCount(bundle){
  if(!bundle||!bundle.recovery_payload)return 0;
  return sensitiveMemoryCount(bundle.recovery_payload.canonical_user&&bundle.recovery_payload.canonical_user.snapshot&&bundle.recovery_payload.canonical_user.snapshot.payload)+
    rollbackSensitiveCount(bundle.recovery_payload.rollback_window);
}

async function collectRollbackWindow(db,currentSnapshot,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,maxAncestors=MAX_ROLLBACK_ANCESTORS
}={}){
  const ancestors=[];
  let parentId=currentSnapshot.parent_snapshot_id,complete=true,truncatedReason=null;
  while(parentId&&ancestors.length<maxAncestors){
    const row=await storageApi.readSnapshot(db,parentId);
    if(!row){complete=false;truncatedReason="ancestor_missing";break;}
    try{
      await verifySnapshotRecord(row,{storageApi,userStateApi,requireCanonical:true});
    }catch(e){complete=false;truncatedReason=e&&e.code||"ancestor_invalid";break;}
    ancestors.push(clone(row));
    parentId=row.parent_snapshot_id;
  }
  if(parentId&&ancestors.length>=maxAncestors){complete=false;truncatedReason="window_limit";}
  return Object.freeze({
    policy_version:ROLLBACK_POLICY_VERSION,
    max_ancestor_snapshots:maxAncestors,
    ancestors:Object.freeze(ancestors),
    complete,
    truncated_reason:truncatedReason
  });
}

function sourceMetadata(runtimeConfig,snapshot,storageApi){
  const config=isObject(runtimeConfig)?runtimeConfig:{};
  return Object.freeze({
    app_version:nonEmptyString(config.app_version)?config.app_version:"unknown",
    runtime_version:nonEmptyString(config.runtime_version)?config.runtime_version:"unknown",
    config_schema_version:nonEmptyString(config.schema_version)?config.schema_version:"unknown",
    user_schema_version:snapshot.user_schema_version,
    db_layout_version:storageApi.DB_LAYOUT_VERSION
  });
}
function emptyPortableState(){
  return Object.freeze({policy_version:PORTABLE_STATE_POLICY_VERSION,feature_state:Object.freeze([]),lifecycle:Object.freeze([])});
}
function assertPortableState(value){
  exactKeys(value,new Set(["policy_version","feature_state","lifecycle"]),"backup_portable_state_invalid");
  if(value.policy_version!==PORTABLE_STATE_POLICY_VERSION||!Array.isArray(value.feature_state)||!Array.isArray(value.lifecycle))throw recoveryError("backup_portable_state_invalid");
  // H-06 intentionally has no approved portable feature/lifecycle records yet. Future additions require an explicit contract + migration path.
  if(value.feature_state.length||value.lifecycle.length)throw recoveryError("backup_portable_state_unsupported");
  return value;
}
function assertRollbackWindow(value){
  exactKeys(value,new Set(["policy_version","max_ancestor_snapshots","ancestors","complete","truncated_reason"]),"backup_rollback_window_invalid");
  if(value.policy_version!==ROLLBACK_POLICY_VERSION||value.max_ancestor_snapshots!==MAX_ROLLBACK_ANCESTORS||!Array.isArray(value.ancestors)||
    value.ancestors.length>MAX_ROLLBACK_ANCESTORS||typeof value.complete!=="boolean"||(value.truncated_reason!==null&&!nonEmptyString(value.truncated_reason))){
    throw recoveryError("backup_rollback_window_invalid");
  }
  return value;
}
function assertSourceMetadata(value){
  exactKeys(value,new Set(["app_version","runtime_version","config_schema_version","user_schema_version","db_layout_version"]),"backup_source_metadata_invalid");
  if(!nonEmptyString(value.app_version)||!nonEmptyString(value.runtime_version)||!nonEmptyString(value.config_schema_version)||!nonEmptyString(value.user_schema_version)||
    !Number.isInteger(value.db_layout_version)||value.db_layout_version<1)throw recoveryError("backup_source_metadata_invalid");
  return value;
}

async function backupPayloadHash(bundle,{storageApi=global.InooStorage}={}){
  return storageApi.sha256Hex({
    backup_format_version:bundle.backup_format_version,
    created_at:bundle.created_at,
    verified_at:bundle.verified_at,
    recovery_payload:bundle.recovery_payload
  });
}
async function verifyStandardBackupObject(bundle,{
  storageApi=global.InooStorage,
  userStateApi=global.InooUserState,
  expectedPersonaDependency=null,
  requireVerified=true
}={}){
  if(!isObject(bundle))throw recoveryError("backup_object_required");
  exactKeys(bundle,new Set(["backup_format_version","created_at","verified_at","recovery_payload","integrity"]),"backup_unknown_field");
  if(bundle.backup_format_version!==BACKUP_FORMAT_VERSION)throw recoveryError("backup_format_unsupported",{format:bundle.backup_format_version});
  if(!validIso(bundle.created_at))throw recoveryError("backup_created_at_invalid");
  if(requireVerified&&!validIso(bundle.verified_at))throw recoveryError("backup_not_verified");
  if(!requireVerified&&bundle.verified_at!==null&&!validIso(bundle.verified_at))throw recoveryError("backup_verified_at_invalid");
  if(bundle.verified_at!==null&&Date.parse(bundle.verified_at)<Date.parse(bundle.created_at))throw recoveryError("backup_verified_before_created");

  const payload=bundle.recovery_payload;
  exactKeys(payload,new Set(["source","persona_dependency","canonical_user","portable_state","rollback_window"]),"backup_payload_unknown_field");
  assertSourceMetadata(payload.source);
  assertPersonaDependency(payload.persona_dependency);
  if(expectedPersonaDependency&&!personaDependencyEqual(payload.persona_dependency,expectedPersonaDependency))throw recoveryError("restore_persona_dependency_mismatch");
  assertPortableState(payload.portable_state);
  assertRollbackWindow(payload.rollback_window);

  exactKeys(payload.canonical_user,new Set(["head","snapshot"]),"backup_canonical_user_invalid");
  assertHeadMatchesSnapshot(payload.canonical_user.head,payload.canonical_user.snapshot);
  await verifySnapshotRecord(payload.canonical_user.snapshot,{storageApi,userStateApi,requireCanonical:true});
  if(payload.source.user_schema_version!==payload.canonical_user.snapshot.user_schema_version)throw recoveryError("backup_source_schema_mismatch");

  for(const ancestor of payload.rollback_window.ancestors){
    await verifySnapshotRecord(ancestor,{storageApi,userStateApi,requireCanonical:true});
    if(ancestor.lineage_id!==payload.canonical_user.snapshot.lineage_id)throw recoveryError("backup_rollback_lineage_mismatch");
  }

  exactKeys(bundle.integrity,new Set(["algorithm","backup_payload_hash","canonical_user_payload_hash","canonical_snapshot_hash"]),"backup_integrity_invalid");
  if(bundle.integrity.algorithm!=="SHA-256")throw recoveryError("backup_integrity_algorithm_invalid");
  const expectedHash=await backupPayloadHash(bundle,{storageApi});
  if(bundle.integrity.backup_payload_hash!==expectedHash)throw recoveryError("backup_payload_hash_mismatch");
  if(bundle.integrity.canonical_user_payload_hash!==payload.canonical_user.snapshot.user_payload_hash)throw recoveryError("backup_integrity_user_hash_mismatch");
  if(bundle.integrity.canonical_snapshot_hash!==payload.canonical_user.snapshot.snapshot_hash)throw recoveryError("backup_integrity_snapshot_hash_mismatch");
  return Object.freeze({ok:true,sensitive_count:backupSensitiveCount(bundle),backup_payload_hash:expectedHash});
}

async function createStandardBackup(db,{
  storageApi=global.InooStorage,
  userStateApi=global.InooUserState,
  personaDependency=null,
  runtimeConfig=null,
  allowSensitive=false,
  now=()=>new Date().toISOString()
}={}){
  ensureRecoveryFeature();
  if(!storageApi||!userStateApi)throw recoveryError("recovery_api_unavailable");
  if(!personaDependency)throw recoveryError("backup_persona_dependency_unavailable");
  assertPersonaDependency(personaDependency);
  const verified=await storageApi.verifyHead(db);
  if(!verified||!verified.ok)throw recoveryError("backup_canonical_recovery_required",{verify_code:verified&&verified.code||null});
  if(!verified.head||!verified.snapshot)throw recoveryError("backup_canonical_missing");
  await verifySnapshotRecord(verified.snapshot,{storageApi,userStateApi,requireCanonical:true});
  assertHeadMatchesSnapshot(verified.head,verified.snapshot);
  const rollbackWindow=await collectRollbackWindow(db,verified.snapshot,{storageApi,userStateApi});
  const sensitiveCount=sensitiveMemoryCount(verified.snapshot.payload)+rollbackSensitiveCount(rollbackWindow);
  if(sensitiveCount>0&&allowSensitive!==true)throw recoveryError("backup_sensitive_opt_in_required",{sensitive_count:sensitiveCount});

  const createdAt=now();
  const recoveryPayload={
    source:sourceMetadata(runtimeConfig,verified.snapshot,storageApi),
    persona_dependency:clone(personaDependency),
    canonical_user:{head:clone(verified.head),snapshot:clone(verified.snapshot)},
    portable_state:clone(emptyPortableState()),
    rollback_window:clone(rollbackWindow)
  };
  const bundle={
    backup_format_version:BACKUP_FORMAT_VERSION,
    created_at:createdAt,
    verified_at:null,
    recovery_payload:recoveryPayload,
    integrity:{
      algorithm:"SHA-256",
      backup_payload_hash:"",
      canonical_user_payload_hash:verified.snapshot.user_payload_hash,
      canonical_snapshot_hash:verified.snapshot.snapshot_hash
    }
  };
  bundle.integrity.backup_payload_hash=await backupPayloadHash(bundle,{storageApi});
  await verifyStandardBackupObject(bundle,{storageApi,userStateApi,expectedPersonaDependency:personaDependency,requireVerified:false});
  bundle.verified_at=now();
  bundle.integrity.backup_payload_hash=await backupPayloadHash(bundle,{storageApi});
  await verifyStandardBackupObject(bundle,{storageApi,userStateApi,expectedPersonaDependency:personaDependency,requireVerified:true});
  return Object.freeze(clone(bundle));
}

function bytesOfText(text){return new TextEncoder().encode(String(text)).byteLength;}
async function parseStandardBackupFile(file,options={}){
  if(!file||typeof file.text!=="function"||!Number.isFinite(file.size))throw recoveryError("restore_file_invalid");
  if(file.size>MAX_STANDARD_FILE_BYTES)throw recoveryError("restore_file_too_large",{max_bytes:MAX_STANDARD_FILE_BYTES});
  const text=await file.text();
  if(bytesOfText(text)>MAX_STANDARD_FILE_BYTES)throw recoveryError("restore_file_too_large",{max_bytes:MAX_STANDARD_FILE_BYTES});
  return parseStandardBackupText(text,options);
}
async function parseStandardBackupText(text,options={}){
  if(bytesOfText(text)>MAX_STANDARD_FILE_BYTES)throw recoveryError("restore_file_too_large",{max_bytes:MAX_STANDARD_FILE_BYTES});
  let bundle;
  try{bundle=JSON.parse(String(text));}catch(_){throw recoveryError("restore_json_invalid");}
  await verifyStandardBackupObject(bundle,options);
  return Object.freeze(clone(bundle));
}

async function readCurrentRestoreBase(db,storageApi){
  let head=null,identity=null,verified=null;
  try{head=await storageApi.readHead(db);}catch(e){throw recoveryError("restore_head_unreadable",{cause:e&&e.code||String(e)});}
  try{identity=await storageApi.getIdentity(db);}catch(e){throw recoveryError("restore_identity_unreadable",{cause:e&&e.code||String(e)});}
  try{verified=await storageApi.verifyHead(db);}catch(e){verified={ok:false,code:e&&e.code||"verify_failed",head,snapshot:null};}
  return {head,identity,verified};
}
function compareBaseHead(actual,expected){
  return (actual?actual.snapshot_id:null)===(expected?expected.snapshot_id:null)&&
    (actual?actual.snapshot_hash:null)===(expected?expected.snapshot_hash:null);
}

async function prepareRestorePreview(db,bundle,{
  storageApi=global.InooStorage,
  userStateApi=global.InooUserState,
  personaDependency=null,
  sensitiveOptIn=false
}={}){
  ensureRecoveryFeature();
  if(!personaDependency)throw recoveryError("restore_persona_dependency_unavailable");
  const check=await verifyStandardBackupObject(bundle,{storageApi,userStateApi,expectedPersonaDependency:personaDependency,requireVerified:true});
  const sourceSnapshot=bundle.recovery_payload.canonical_user.snapshot;
  const base=await readCurrentRestoreBase(db,storageApi);
  if(base.identity&&base.identity.lineage_id!==sourceSnapshot.lineage_id)throw recoveryError("restore_cross_lineage_requires_transfer",{current_lineage_id:base.identity.lineage_id,backup_lineage_id:sourceSnapshot.lineage_id});
  if(base.head&&!base.identity)throw recoveryError("restore_identity_missing");
  if(base.head&&base.head.purge_epoch>sourceSnapshot.purge_epoch)throw recoveryError("restore_purge_epoch_regression_blocked",{current:base.head.purge_epoch,backup:sourceSnapshot.purge_epoch});

  if(base.verified&&base.verified.ok&&base.verified.snapshot&&base.verified.snapshot.user_payload_hash===sourceSnapshot.user_payload_hash){
    return Object.freeze({
      already_current:true,can_apply:false,preview_id:null,mode:"already_current",requires_sensitive_opt_in:false,
      sensitive_count:check.sensitive_count,current_revision:base.head&&base.head.revision||0,source_revision:sourceSnapshot.revision,
      notices:Object.freeze(["현재 canonical USER 내용이 이 백업과 이미 동일합니다. 저장 작업은 실행하지 않습니다."])
    });
  }
  if(base.head&&base.identity&&base.identity.replica_id!==sourceSnapshot.replica_id){
    throw recoveryError("restore_existing_cross_replica_requires_conflict",{current_replica_id:base.identity.replica_id,backup_replica_id:sourceSnapshot.replica_id});
  }

  const operationId=storageApi.newOperationId(),previewId="restore_preview_"+String(operationId).replace(/^op_/,"");
  const requiresSensitive=check.sensitive_count>0;
  const mode=!base.head?"fresh_restore":base.verified&&base.verified.ok?"same_lineage_restore":"same_lineage_repair";
  previewRegistry.set(previewId,Object.freeze({
    operationId,
    bundle:clone(bundle),
    baseHead:clone(base.head),
    lineageId:sourceSnapshot.lineage_id,
    purgeEpoch:sourceSnapshot.purge_epoch,
    requiresSensitive
  }));
  trimPreviewRegistry();
  return Object.freeze({
    already_current:false,
    can_apply:!requiresSensitive||sensitiveOptIn===true,
    preview_id:previewId,
    mode,
    requires_sensitive_opt_in:requiresSensitive,
    sensitive_count:check.sensitive_count,
    current_revision:base.head&&base.head.revision||0,
    source_revision:sourceSnapshot.revision,
    source_created_at:bundle.created_at,
    source_verified_at:bundle.verified_at,
    rollback_entries:bundle.recovery_payload.rollback_window.ancestors.length,
    notices:Object.freeze([
      "파일 검증과 Persona dependency 확인이 끝났지만 아직 canonical USER는 변경되지 않았습니다.",
      "명시적 승인 후 새 revision으로 복원하고 read-back/hash 검증을 통과해야 완료됩니다."
    ])
  });
}

async function inspectRestoreFile(db,file,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,personaDependency=null,sensitiveOptIn=false
}={}){
  const bundle=await parseStandardBackupFile(file,{storageApi,userStateApi,expectedPersonaDependency:personaDependency,requireVerified:true});
  return prepareRestorePreview(db,bundle,{storageApi,userStateApi,personaDependency,sensitiveOptIn});
}

async function commitRestorePreview(db,previewId,{
  storageApi=global.InooStorage,
  userStateApi=global.InooUserState,
  personaDependency=null,
  approved=false,
  sensitiveOptIn=false
}={}){
  if(approved!==true)throw recoveryError("restore_human_approval_required");
  const entry=previewRegistry.get(previewId);
  if(!entry)throw recoveryError("restore_preview_missing_or_expired");
  if(entry.requiresSensitive&&sensitiveOptIn!==true)throw recoveryError("restore_sensitive_opt_in_required");
  if(!personaDependency)throw recoveryError("restore_persona_dependency_unavailable");
  await verifyStandardBackupObject(entry.bundle,{storageApi,userStateApi,expectedPersonaDependency:personaDependency,requireVerified:true});
  const sourceSnapshot=entry.bundle.recovery_payload.canonical_user.snapshot;
  const current=await readCurrentRestoreBase(db,storageApi);
  if(!compareBaseHead(current.head,entry.baseHead))throw recoveryError("stale_candidate",{reason:"restore_head_changed_since_preview"});
  if(current.identity&&current.identity.lineage_id!==entry.lineageId)throw recoveryError("restore_cross_lineage_requires_transfer");
  if(current.head&&current.head.purge_epoch>entry.purgeEpoch)throw recoveryError("restore_purge_epoch_regression_blocked");
  if(current.head&&current.identity&&current.identity.replica_id!==sourceSnapshot.replica_id)throw recoveryError("restore_existing_cross_replica_requires_conflict");

  let committed;
  try{
    committed=await storageApi.commitSnapshot(db,{
      operationId:entry.operationId,
      userSchemaVersion:userStateApi.USER_SCHEMA_VERSION,
      operationType:RESTORE_OPERATION_TYPE,
      purgeEpoch:entry.purgeEpoch,
      payload:clone(sourceSnapshot.payload),
      expectedHeadSnapshotId:entry.baseHead?entry.baseHead.snapshot_id:null,
      expectedHeadHash:entry.baseHead?entry.baseHead.snapshot_hash:null,
      lineageId:entry.lineageId
    });
  }catch(e){
    if(e&&e.code==="stale_candidate")throw recoveryError("stale_candidate",e.details);
    try{
      const inspected=await storageApi.inspectOperation(db,entry.operationId);
      if(!inspected.receipt)throw e;
    }catch(reconcileError){
      if(reconcileError===e)throw recoveryError("restore_commit_failed",{cause:e&&e.code||String(e)});
      return Object.freeze({status:"COMMIT_UNKNOWN",outcome:"reconcile_failed",operation_id:entry.operationId,error_code:e&&e.code||String(e)});
    }
  }

  let verified;
  try{verified=await storageApi.verifyHead(db);}catch(e){return Object.freeze({status:"COMMIT_UNKNOWN",outcome:"readback_unavailable",operation_id:entry.operationId,error_code:e&&e.code||String(e)});}
  if(!verified||!verified.ok||!verified.snapshot||verified.snapshot.operation_id!==entry.operationId||
    verified.snapshot.user_schema_version!==userStateApi.USER_SCHEMA_VERSION||verified.snapshot.user_payload_hash!==sourceSnapshot.user_payload_hash||
    verified.snapshot.lineage_id!==entry.lineageId){
    return Object.freeze({status:"COMMIT_UNKNOWN",outcome:"readback_mismatch",operation_id:entry.operationId,verify_code:verified&&verified.code||null});
  }
  userStateApi.validateCanonicalState(verified.snapshot.payload);
  previewRegistry.delete(previewId);
  return Object.freeze({status:"SUCCESS",outcome:committed&&committed.status==="already_committed"?"already_committed":"restored",operation_id:entry.operationId,revision:verified.head.revision});
}
function discardRestorePreview(previewId){return previewRegistry.delete(previewId);}

function luhnCandidate(text){
  const groups=String(text).match(/(?:\d[ -]?){13,19}/g)||[];
  for(const raw of groups){
    const digits=raw.replace(/\D/g,"");if(digits.length<13||digits.length>19||/^0+$/.test(digits))continue;
    let sum=0,alt=false;for(let i=digits.length-1;i>=0;i--){let n=Number(digits[i]);if(alt){n*=2;if(n>9)n-=9;}sum+=n;alt=!alt;}
    if(sum%10===0)return true;
  }
  return false;
}
function neverStoreString(text){
  const s=String(text||"");
  return /\bsk-[A-Za-z0-9_-]{16,}\b/.test(s)||/\bAIza[0-9A-Za-z_-]{20,}\b/.test(s)||/\bghp_[A-Za-z0-9]{20,}\b/.test(s)||
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(s)||/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i.test(s)||
    /(?:password|passwd|비밀번호|패스워드|access[_ -]?token|api[_ -]?key|secret)\s*[:=]\s*\S{6,}/i.test(s)||
    /\b\d{6}-[1-8]\d{6}\b/.test(s)||/(?:집\s*주소|home\s*address|exact\s*address)\s*[:=]\s*\S.+/i.test(s)||luhnCandidate(s);
}
function secretKeyName(key){return /^(?:password|passwd|access[_ -]?token|api[_ -]?key|secret|authorization)$/i.test(String(key||""));}
function sanitizeRawValue(value,keyName="",stats={redactions:0}){
  if(secretKeyName(keyName)){stats.redactions++;return "[REDACTED_NEVER_STORE]";}
  if(value===null||typeof value==="boolean")return value;
  if(typeof value==="string"){
    if(neverStoreString(value)){stats.redactions++;return "[REDACTED_NEVER_STORE]";}
    return value;
  }
  if(typeof value==="number")return Number.isFinite(value)?value:"[NON_FINITE_NUMBER]";
  if(Array.isArray(value))return value.map(v=>sanitizeRawValue(v,"",stats));
  if(value instanceof Date)return {__raw_type__:"Date",value:value.toISOString()};
  if(value instanceof ArrayBuffer)return {__raw_type__:"ArrayBuffer",byte_length:value.byteLength};
  if(ArrayBuffer.isView(value))return {__raw_type__:value.constructor&&value.constructor.name||"TypedArray",byte_length:value.byteLength};
  if(isObject(value)){
    const out={};for(const [k,v] of Object.entries(value))out[k]=sanitizeRawValue(v,k,stats);return out;
  }
  return {__raw_type__:Object.prototype.toString.call(value)};
}
async function readStoreRows(db,storeName){
  const tx=db.transaction([storeName],"readonly");
  const rows=await requestResult(tx.objectStore(storeName).getAll());
  await transactionDone(tx);
  return rows||[];
}
async function buildRawRecoveryExport(db,{
  storageApi=global.InooStorage,
  now=()=>new Date().toISOString()
}={}){
  ensureRecoveryFeature();
  if(!db||!storageApi||!storageApi.STORES)throw recoveryError("raw_recovery_storage_unavailable");
  const createdAt=now(),stores={},stats={redactions:0};
  let errors=0,readable=0;
  const names=Object.values(storageApi.STORES);
  for(const storeName of names){
    try{
      const rows=await readStoreRows(db,storeName);
      stores[storeName]={status:"readable",rows:sanitizeRawValue(rows,"",stats)};readable++;
    }catch(e){stores[storeName]={status:"unreadable",error_code:e&&e.code||e&&e.name||"read_failed",rows:[]};errors++;}
  }
  if(readable===0)throw recoveryError("raw_recovery_no_readable_store");
  const source={db_name:storageApi.DB_NAME,db_layout_version:storageApi.DB_LAYOUT_VERSION};
  const basis={raw_export_format_version:RAW_EXPORT_FORMAT_VERSION,created_at:createdAt,source,stores};
  const rawPayloadHash=await storageApi.sha256Hex(JSON.stringify(basis));
  return Object.freeze({
    raw_export_format_version:RAW_EXPORT_FORMAT_VERSION,
    created_at:createdAt,
    source:Object.freeze(source),
    stores:Object.freeze(stores),
    security:Object.freeze({never_store_redactions:stats.redactions,unreadable_store_count:errors}),
    integrity:Object.freeze({algorithm:"SHA-256",raw_payload_hash:rawPayloadHash}),
    warning:"Raw Recovery Export is a security-filtered diagnostic recovery artifact, not a verified Standard Recovery Backup."
  });
}

function fileStamp(iso){return String(iso||new Date().toISOString()).replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
function downloadJson(obj,filename,documentObj=global.document,urlApi=global.URL){
  if(!documentObj||typeof Blob==="undefined"||!urlApi||typeof urlApi.createObjectURL!=="function")throw recoveryError("download_unavailable");
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
  const a=documentObj.createElement("a");a.href=urlApi.createObjectURL(blob);a.download=filename;a.click();
  global.setTimeout(()=>urlApi.revokeObjectURL(a.href),1000);
}
function runtimePersonaDependency(){
  const runtime=global.__InooWebApp;
  if(!runtime||typeof runtime.getPersonaDependency!=="function")return null;
  try{return runtime.getPersonaDependency();}catch(_){return null;}
}
function runtimeConfig(){return global.__InooWebApp&&isObject(global.__InooWebApp.config)?global.__InooWebApp.config:null;}
function humanError(code){
  const map={
    backup_persona_dependency_unavailable:"Persona 무결성이 확인되지 않아 Standard Recovery Backup은 만들 수 없습니다. Raw Recovery Export는 계속 사용할 수 있습니다.",
    backup_canonical_missing:"아직 canonical USER 상태가 없어 Standard Recovery Backup을 만들 수 없습니다.",
    backup_canonical_recovery_required:"canonical 저장소 검증에 실패했습니다. 쓰기는 중지하고 Raw Recovery Export 또는 검증된 Restore를 사용하세요.",
    backup_sensitive_opt_in_required:"민감 기억이 포함되어 있습니다. 아래 민감 데이터 포함 허용을 명시적으로 켜야 Standard Backup을 만들 수 있습니다.",
    restore_file_too_large:"복원 파일이 허용 크기를 초과했습니다. 파일 내용은 파싱하지 않았습니다.",
    restore_json_invalid:"복원 파일이 유효한 JSON이 아닙니다. 저장된 데이터는 변경하지 않았습니다.",
    backup_format_unsupported:"Standard Recovery Backup 형식이 아니거나 지원하지 않는 버전입니다.",
    backup_not_verified:"생성만 되고 검증되지 않은 백업은 복원할 수 없습니다.",
    backup_payload_hash_mismatch:"백업 무결성 해시가 맞지 않습니다. 복원하지 않았습니다.",
    backup_snapshot_payload_hash_mismatch:"백업 USER payload 해시가 맞지 않습니다. 복원하지 않았습니다.",
    backup_snapshot_hash_mismatch:"백업 snapshot 해시가 맞지 않습니다. 복원하지 않았습니다.",
    restore_persona_dependency_mismatch:"현재 Persona package가 이 백업의 dependency와 다릅니다. 복원하지 않았습니다.",
    restore_persona_dependency_unavailable:"현재 Persona 무결성이 확인되지 않아 Standard Restore를 진행할 수 없습니다. Raw Recovery Export는 사용할 수 있습니다.",
    restore_cross_lineage_requires_transfer:"다른 lineage의 백업입니다. H-08 Transfer/Conflict 단계 전에는 자동 덮어쓰지 않습니다.",
    restore_existing_cross_replica_requires_conflict:"현재 데이터가 있는 다른 replica의 백업입니다. H-08 Conflict 확인 경로 전에는 기존 canonical USER를 덮어쓰지 않습니다.",
    restore_purge_epoch_regression_blocked:"현재 PURGE epoch보다 오래된 백업이라 삭제된 데이터를 되살릴 위험이 있어 복원을 차단했습니다.",
    backup_user_schema_unsupported:"현재 runtime이 이 USER schema를 자동 변환할 명시적 adapter를 갖고 있지 않아 복원을 차단했습니다.",
    backup_portable_state_unsupported:"현재 H-06에서 승인되지 않은 portable feature/lifecycle 상태가 포함되어 있어 자동 복원을 차단했습니다.",
    stale_candidate:"복원 Preview 이후 현재 HEAD가 바뀌었습니다. 파일을 다시 선택해 새 Preview부터 진행하세요.",
    restore_sensitive_opt_in_required:"민감 기억이 포함된 백업입니다. 민감 데이터 포함 허용을 켠 뒤 다시 승인하세요."
  };
  return map[code]||"Backup / Recovery 검증에 실패했습니다. canonical USER는 변경하지 않았습니다.";
}
function renderRestorePreview(preview,el){
  if(!el)return;
  const lines=[];
  if(preview.already_current)lines.push("현재 canonical USER가 선택한 백업과 이미 동일합니다.");
  else{
    lines.push(`복원 모드: ${preview.mode}`);
    lines.push(`현재 revision: ${preview.current_revision} → 백업 기준 revision: ${preview.source_revision}`);
    lines.push(`백업 생성: ${preview.source_created_at}`);
    lines.push(`백업 검증: ${preview.source_verified_at}`);
    lines.push(`민감 기억: ${preview.sensitive_count}개`);
    lines.push(`포함된 bounded rollback ancestor: ${preview.rollback_entries}개`);
  }
  for(const notice of preview.notices||[])lines.push("• "+notice);
  el.textContent=lines.join("\n");el.hidden=false;
}

async function initRecoveryUI(){
  ensureRecoveryFeature();
  const root=global.document;if(!root)return null;
  const card=root.getElementById("dataSafety");if(!card)return null;
  const status=root.getElementById("dataSafetyStatus"),backupBtn=root.getElementById("btnCanonicalBackup"),rawBtn=root.getElementById("btnRawRecovery"),
    restoreFile=root.getElementById("canonicalRestoreFile"),restorePreview=root.getElementById("canonicalRestorePreview"),restoreApply=root.getElementById("btnCanonicalRestoreApply"),
    sensitive=root.getElementById("recoverySensitiveOptIn"),createdEl=root.getElementById("backupGeneratedAt"),verifiedEl=root.getElementById("backupVerifiedAt"),
    tools=root.getElementById("recoveryTools"),sessionStatus=root.getElementById("sessionStatus"),memoryController=root.getElementById("memoryController");
  let db=null,pendingRestore=null;

  function setStatus(text,tone="info"){if(status){status.textContent=text;status.dataset.state=tone;}}
  function elevate(value){
    card.classList.toggle("data-safety-degraded",!!value);
    if(value&&sessionStatus&&sessionStatus.parentNode)sessionStatus.insertAdjacentElement("afterend",card);
    else if(!value&&memoryController&&memoryController.parentNode)memoryController.insertAdjacentElement("afterend",card);
    if(value&&tools)tools.open=true;
  }
  async function refresh(){
    if(!db)return;
    let verified;
    try{verified=await global.InooStorage.verifyHead(db);}catch(e){verified={ok:false,code:e&&e.code||"verify_failed",head:null,snapshot:null};}
    let canonicalReady=false;
    if(verified&&verified.ok&&verified.snapshot){
      try{global.InooUserState.validateCanonicalState(verified.snapshot.payload);canonicalReady=true;}catch(_){canonicalReady=false;}
    }
    const degraded=!!(verified&&!verified.ok)||(verified&&verified.snapshot&&!canonicalReady);
    elevate(degraded);
    const personaDep=runtimePersonaDependency();
    if(backupBtn)backupBtn.disabled=!canonicalReady||!personaDep;
    if(rawBtn)rawBtn.disabled=false;
    if(restoreFile)restoreFile.disabled=false;
    if(degraded)setStatus("canonical USER 검증에 실패했습니다. 쓰기 경로는 중지된 상태이며 Raw Recovery Export가 우선입니다. 검증된 Restore만 명시 승인 후 사용할 수 있습니다.","error");
    else if(!verified||!verified.head)setStatus("canonical USER가 아직 없습니다. 검증된 Standard Backup을 Restore하거나 Raw Recovery 상태를 내보낼 수 있습니다.","warn");
    else if(!personaDep)setStatus("Persona 무결성이 준비되지 않아 Standard Backup/Restore는 제한됩니다. USER Raw Recovery Export는 계속 사용할 수 있습니다.","warn");
    else setStatus("canonical USER와 Persona dependency가 확인되었습니다. Standard Recovery Backup을 생성하거나 검증된 백업을 Restore할 수 있습니다.","ready");
  }

  try{db=await global.InooStorage.openDatabase();await refresh();}
  catch(e){
    setStatus("IndexedDB를 열 수 없어 이 브라우저의 recovery 데이터를 읽을 수 없습니다.","error");
    if(backupBtn)backupBtn.disabled=true;if(rawBtn)rawBtn.disabled=true;if(restoreFile)restoreFile.disabled=true;
    return null;
  }

  if(global.addEventListener){
    global.addEventListener("inoo:foundation-ready",()=>refresh().catch(()=>{}),{once:true});
    global.addEventListener("inoo:canonical-history-committed",()=>{pendingRestore=null;if(restoreApply)restoreApply.hidden=true;if(restorePreview){restorePreview.hidden=true;restorePreview.textContent="";}refresh().catch(()=>{});});
  }

  if(backupBtn)backupBtn.addEventListener("click",async()=>{
    backupBtn.disabled=true;
    try{
      const bundle=await createStandardBackup(db,{
        personaDependency:runtimePersonaDependency(),runtimeConfig:runtimeConfig(),allowSensitive:!!(sensitive&&sensitive.checked)
      });
      downloadJson(bundle,`inoo_companion_standard_recovery_${fileStamp(bundle.created_at)}.json`);
      if(createdEl)createdEl.textContent=bundle.created_at;if(verifiedEl)verifiedEl.textContent=bundle.verified_at;
      setStatus("Standard Recovery Backup을 생성한 뒤 메모리 내 재검증까지 통과했습니다. 생성 시각과 검증 시각을 별도로 기록했습니다.","ready");
    }catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{await refresh();}
  });

  if(rawBtn)rawBtn.addEventListener("click",async()=>{
    rawBtn.disabled=true;
    try{
      const raw=await buildRawRecoveryExport(db);
      downloadJson(raw,`inoo_companion_raw_recovery_${fileStamp(raw.created_at)}.json`);
      setStatus(raw.security.never_store_redactions?`Raw Recovery Export를 만들었습니다. NEVER STORE 패턴 ${raw.security.never_store_redactions}건은 보안상 제거했습니다.`:"Raw Recovery Export를 만들었습니다. 이 파일은 Standard Recovery Backup 검증본과는 다른 진단용 복구 자료입니다.","ready");
    }catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{rawBtn.disabled=false;}
  });

  if(restoreFile)restoreFile.addEventListener("change",async()=>{
    const file=restoreFile.files&&restoreFile.files[0];restoreFile.value="";
    if(pendingRestore&&pendingRestore.preview_id)discardRestorePreview(pendingRestore.preview_id);
    pendingRestore=null;if(restoreApply)restoreApply.hidden=true;if(restorePreview){restorePreview.hidden=true;restorePreview.textContent="";}
    if(!file)return;
    try{
      pendingRestore=await inspectRestoreFile(db,file,{personaDependency:runtimePersonaDependency(),sensitiveOptIn:!!(sensitive&&sensitive.checked)});
      renderRestorePreview(pendingRestore,restorePreview);
      if(restoreApply){restoreApply.hidden=!!pendingRestore.already_current;restoreApply.disabled=!pendingRestore.can_apply;}
      setStatus(pendingRestore.already_current?"현재 데이터와 동일한 백업이라 저장 작업은 없습니다.":"복원 Preview를 확인하세요. 아직 canonical USER는 변경되지 않았습니다.",pendingRestore.already_current?"ready":"warn");
    }catch(e){setStatus(humanError(e&&e.code),"error");}
  });

  if(sensitive)sensitive.addEventListener("change",()=>{
    if(pendingRestore&&!pendingRestore.already_current&&restoreApply){
      restoreApply.disabled=!!pendingRestore.requires_sensitive_opt_in&&!sensitive.checked;
    }
  });

  if(restoreApply)restoreApply.addEventListener("click",async()=>{
    if(!pendingRestore||!pendingRestore.preview_id)return;
    restoreApply.disabled=true;
    try{
      const result=await commitRestorePreview(db,pendingRestore.preview_id,{
        personaDependency:runtimePersonaDependency(),approved:true,sensitiveOptIn:!!(sensitive&&sensitive.checked)
      });
      if(result.status!=="SUCCESS"){
        setStatus("복원 commit 결과를 확정할 수 없습니다. 현재 HEAD를 다시 검증하기 전에는 같은 작업을 반복하지 마세요.","error");
        return;
      }
      pendingRestore=null;if(restorePreview){restorePreview.hidden=true;restorePreview.textContent="";}restoreApply.hidden=true;
      setStatus(`복원과 read-back/hash 검증이 완료되었습니다. 새 canonical revision ${result.revision}이 생성되었습니다.`,"ready");
      global.dispatchEvent(new CustomEvent("inoo:canonical-recovery-committed",{detail:{revision:result.revision}}));
      await refresh();
    }catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{if(!restoreApply.hidden)restoreApply.disabled=!!(pendingRestore&&pendingRestore.requires_sensitive_opt_in)&&!(sensitive&&sensitive.checked);}
  });

  return {db,refresh,getPendingRestore:()=>pendingRestore};
}

const api=Object.freeze({
  RECOVERY_VERSION,BACKUP_FORMAT_VERSION,RAW_EXPORT_FORMAT_VERSION,PORTABLE_STATE_POLICY_VERSION,ROLLBACK_POLICY_VERSION,
  RESTORE_OPERATION_TYPE,MAX_STANDARD_FILE_BYTES,MAX_ROLLBACK_ANCESTORS,USER_SCHEMA_RESTORE_ADAPTERS,RECOVERY_FEATURE_DESCRIPTOR,
  ensureRecoveryFeature,personaDependencyEqual,snapshotBasis,resolveUserSchemaRestorePath,verifySnapshotRecord,collectRollbackWindow,
  verifyStandardBackupObject,createStandardBackup,parseStandardBackupFile,parseStandardBackupText,prepareRestorePreview,inspectRestoreFile,
  commitRestorePreview,discardRestorePreview,buildRawRecoveryExport,initRecoveryUI,
  _test:Object.freeze({sensitiveMemoryCount,backupSensitiveCount,neverStoreString,secretKeyName,sanitizeRawValue,backupPayloadHash,readCurrentRestoreBase})
});
global.InooCanonicalRecovery=api;
if(global.document){
  if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",()=>{initRecoveryUI().catch(()=>{});},{once:true});
  else initRecoveryUI().catch(()=>{});
}
})(typeof window!=="undefined"?window:globalThis);
