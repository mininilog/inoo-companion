(function(global){
"use strict";

const TRANSFER_VERSION="stage17-h08-transfer-1";
const TRANSFER_OPERATION_TYPE="canonical_replica_transfer";
const MERGE_OPERATION_TYPE="canonical_replica_merge";
const PURGE_ADOPT_OPERATION_TYPE="canonical_replica_purge_adopt";
const MAX_LOCAL_ANCESTORS=2;
const PREVIEW_LIMIT=4;
const previewRegistry=new Map();

const TRANSFER_FEATURE_DESCRIPTOR=Object.freeze({
  feature_id:"canonical_replica_transfer",
  feature_schema_version:"1",
  read_capabilities:["canonical_user:read","recovery:standard_backup_read","replica:identity_read"],
  write_capabilities:["canonical_user:transfer_gate","canonical_user:merge_gate"],
  migration_owner:"canonical_replica_transfer",
  state_namespace:"feature.canonical_replica_transfer"
});

function transferError(code,details){const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function sameJson(a,b,storageApi=global.InooStorage){
  if(a===undefined||b===undefined)return a===b;
  if(!storageApi||typeof storageApi.canonicalJSONStringify!=="function")return JSON.stringify(a)===JSON.stringify(b);
  try{return storageApi.canonicalJSONStringify(a)===storageApi.canonicalJSONStringify(b);}catch(_){return false;}
}
function sameHead(a,b){return (a?a.snapshot_id:null)===(b?b.snapshot_id:null)&&(a?a.snapshot_hash:null)===(b?b.snapshot_hash:null);}
function trimPreviews(){while(previewRegistry.size>PREVIEW_LIMIT)previewRegistry.delete(previewRegistry.keys().next().value);}
function nonEmptyString(v){return typeof v==="string"&&v.length>0;}
function sameDescriptor(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch(_){return false;}}

function ensureTransferFeature(foundation=global.InooIntegrityFoundation){
  if(!foundation||!foundation.defaultRegistry)throw transferError("transfer_foundation_unavailable");
  const registry=foundation.defaultRegistry;
  try{
    const existing=registry.getFeature(TRANSFER_FEATURE_DESCRIPTOR.feature_id);
    if(!sameDescriptor(existing,TRANSFER_FEATURE_DESCRIPTOR))throw transferError("transfer_feature_descriptor_conflict");
    return existing;
  }catch(e){
    if(e&&e.code!=="feature_not_registered")throw e;
    return registry.registerFeature(TRANSFER_FEATURE_DESCRIPTOR);
  }
}

function runtimePersonaDependency(){
  const runtime=global.__InooWebApp;if(!runtime||typeof runtime.getPersonaState!=="function")return null;
  try{
    const state=runtime.getPersonaState();
    if(!state||state.status!=="persona_ready"||!state.descriptor)return null;
    const d=state.descriptor;
    return {persona_package_id:d.persona_package_id,persona_package_version:d.persona_package_version,persona_package_hash_algorithm:d.persona_package_hash_algorithm,persona_package_hash:d.persona_package_hash};
  }catch(_){return null;}
}

function runtimeConfig(){
  const runtime=global.__InooWebApp;if(!runtime||typeof runtime.getConfig!=="function")return null;
  try{return runtime.getConfig();}catch(_){return null;}
}

async function verifiedCurrent(db,{storageApi=global.InooStorage,userStateApi=global.InooUserState}={}){
  if(!storageApi||!userStateApi)throw transferError("transfer_api_unavailable");
  let verified;try{verified=await storageApi.verifyHead(db);}catch(e){throw transferError("transfer_recovery_required",{cause:e&&e.code||String(e)});}
  if(!verified||!verified.ok)throw transferError("transfer_recovery_required",{verify_code:verified&&verified.code||null});
  if(verified.snapshot)userStateApi.validateCanonicalState(verified.snapshot.payload);
  let identity=null;try{identity=await storageApi.getIdentity(db);}catch(e){throw transferError("transfer_identity_unreadable",{cause:e&&e.code||String(e)});}
  if(verified.head&&!identity)throw transferError("transfer_identity_missing");
  return {head:verified.head||null,snapshot:verified.snapshot||null,identity};
}

async function verifyBundle(bundle,{recoveryApi=global.InooCanonicalRecovery,storageApi=global.InooStorage,userStateApi=global.InooUserState,personaDependency=null}={}){
  if(!recoveryApi||typeof recoveryApi.verifyStandardBackupObject!=="function")throw transferError("transfer_recovery_api_unavailable");
  if(!personaDependency)throw transferError("transfer_persona_dependency_unavailable");
  const check=await recoveryApi.verifyStandardBackupObject(bundle,{storageApi,userStateApi,expectedPersonaDependency:personaDependency,requireVerified:true});
  return {check,source:bundle.recovery_payload.canonical_user.snapshot};
}

async function parseTransferFile(file,options={}){
  const recoveryApi=options.recoveryApi||global.InooCanonicalRecovery;
  if(!recoveryApi||typeof recoveryApi.parseStandardBackupFile!=="function")throw transferError("transfer_recovery_api_unavailable");
  return recoveryApi.parseStandardBackupFile(file,{storageApi:options.storageApi||global.InooStorage,userStateApi:options.userStateApi||global.InooUserState,expectedPersonaDependency:options.personaDependency||null,requireVerified:true});
}

async function collectLocalWindow(db,currentSnapshot,{storageApi=global.InooStorage,recoveryApi=global.InooCanonicalRecovery,userStateApi=global.InooUserState,maxAncestors=MAX_LOCAL_ANCESTORS}={}){
  if(!currentSnapshot)return [];
  const out=[clone(currentSnapshot)];let parent=currentSnapshot.parent_snapshot_id;
  while(parent&&out.length<maxAncestors+1){
    const row=await storageApi.readSnapshot(db,parent);if(!row)break;
    try{await recoveryApi.verifySnapshotRecord(row,{storageApi,userStateApi,requireCanonical:true});}catch(_){break;}
    out.push(clone(row));parent=row.parent_snapshot_id;
  }
  return out;
}
function incomingWindow(bundle){return [bundle.recovery_payload.canonical_user.snapshot,...bundle.recovery_payload.rollback_window.ancestors].map(clone);}
function snapshotKey(s){return s&&nonEmptyString(s.snapshot_id)&&nonEmptyString(s.snapshot_hash)?`${s.snapshot_id}|${s.snapshot_hash}`:"";}
function findCommonBase(localWindow,incoming){
  const remote=new Map(incoming.map(x=>[snapshotKey(x),x]));
  for(const local of localWindow){const key=snapshotKey(local);if(key&&remote.has(key))return {local,remote:remote.get(key)};}
  return null;
}
function containsSnapshot(window,snapshot){const key=snapshotKey(snapshot);return !!key&&window.some(x=>snapshotKey(x)===key);}

function mergeThreeWayValue(base,local,incoming,label,storageApi){
  if(sameJson(local,incoming,storageApi))return {value:clone(local),conflicts:[]};
  if(sameJson(local,base,storageApi))return {value:clone(incoming),conflicts:[]};
  if(sameJson(incoming,base,storageApi))return {value:clone(local),conflicts:[]};
  return {value:null,conflicts:[{kind:"field_conflict",field:label}]};
}
function mapRecords(records){const m=new Map();for(const r of records||[])m.set(r.memory_id,r);return m;}
function mergeMemoryRecords(baseRecords,localRecords,incomingRecords,storageApi){
  const base=mapRecords(baseRecords),local=mapRecords(localRecords),incoming=mapRecords(incomingRecords);
  const ids=new Set([...base.keys(),...local.keys(),...incoming.keys()]);
  const resolved=new Map(),conflicts=[];
  for(const id of ids){
    const b=base.has(id)?base.get(id):undefined,l=local.has(id)?local.get(id):undefined,r=incoming.has(id)?incoming.get(id):undefined;
    if(sameJson(l,r,storageApi)){if(l!==undefined)resolved.set(id,clone(l));continue;}
    if(sameJson(l,b,storageApi)){if(r!==undefined)resolved.set(id,clone(r));continue;}
    if(sameJson(r,b,storageApi)){if(l!==undefined)resolved.set(id,clone(l));continue;}
    conflicts.push({kind:"memory_conflict",memory_id:id,local_present:l!==undefined,incoming_present:r!==undefined});
  }
  const ordered=[];
  for(const r of baseRecords||[]){if(resolved.has(r.memory_id)){ordered.push(resolved.get(r.memory_id));resolved.delete(r.memory_id);}}
  for(const id of Array.from(resolved.keys()).sort())ordered.push(resolved.get(id));
  return {value:ordered,conflicts};
}
function threeWayMergePayload(basePayload,localPayload,incomingPayload,{storageApi=global.InooStorage,userStateApi=global.InooUserState}={}){
  userStateApi.validateCanonicalState(basePayload);userStateApi.validateCanonicalState(localPayload);userStateApi.validateCanonicalState(incomingPayload);
  const cp=mergeThreeWayValue(basePayload.controller_projection,localPayload.controller_projection,incomingPayload.controller_projection,"controller_projection",storageApi);
  const ms=mergeThreeWayValue(basePayload.migration_state,localPayload.migration_state,incomingPayload.migration_state,"migration_state",storageApi);
  const mm=mergeMemoryRecords(basePayload.memory_records,localPayload.memory_records,incomingPayload.memory_records,storageApi);
  const conflicts=[...cp.conflicts,...ms.conflicts,...mm.conflicts];
  if(conflicts.length)return {ok:false,payload:null,conflicts};
  const payload={schema_version:localPayload.schema_version,state_kind:localPayload.state_kind,controller_projection:cp.value,memory_records:mm.value,migration_state:ms.value};
  try{userStateApi.validateCanonicalState(payload);}catch(e){return {ok:false,payload:null,conflicts:[{kind:"merged_payload_invalid",code:e&&e.code||"canonical_invalid"}]};}
  return {ok:true,payload,conflicts:[]};
}

function sensitiveCount(payload){return payload&&Array.isArray(payload.memory_records)?payload.memory_records.filter(x=>x&&x.sensitivity==="sensitive").length:0;}
function sourceSummary(source){return Object.freeze({lineage_id:source.lineage_id,replica_id:source.replica_id,snapshot_id:source.snapshot_id,snapshot_hash:source.snapshot_hash,revision:source.revision,purge_epoch:source.purge_epoch,operation_type:source.operation_type});}
function conflictText(c){
  if(c.kind==="memory_conflict")return `기억 ${c.memory_id}: 두 replica에서 같은 항목을 서로 다르게 변경했습니다.`;
  if(c.kind==="field_conflict")return `${c.field}: 두 replica에서 서로 다르게 변경했습니다.`;
  if(c.kind==="merged_payload_invalid")return `자동 merge 결과가 canonical 검증을 통과하지 못했습니다 (${c.code}).`;
  if(c.kind==="different_lineage")return "서로 다른 lineage의 canonical USER입니다. revision 숫자로 우열을 결정할 수 없습니다.";
  if(c.kind==="no_common_base")return "bounded history 안에서 공통 ancestor를 확인할 수 없어 자동 merge하지 않습니다.";
  if(c.kind==="higher_purge_epoch")return "가져온 replica의 purge_epoch가 더 높습니다. 삭제 이력 우선 규칙 때문에 명시적 확인이 필요합니다.";
  return "자동으로 안전하게 합칠 수 없는 충돌입니다.";
}

async function prepareTransferPreview(db,bundle,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,recoveryApi=global.InooCanonicalRecovery,historyApi=global.InooCanonicalHistory,
  personaDependency=null,sensitiveOptIn=false
}={}){
  ensureTransferFeature();
  const {check,source}=await verifyBundle(bundle,{recoveryApi,storageApi,userStateApi,personaDependency});
  const current=await verifiedCurrent(db,{storageApi,userStateApi});
  let requiresSensitive=check.sensitive_count>0;
  const operationId=storageApi.newOperationId(),previewId="transfer_preview_"+String(operationId).replace(/^op_/,"");
  let mode="",candidatePayload=null,conflicts=[],commonBase=null,committable=true,requiresConflict=false,rootAdoption=false,notices=[];

  if(!current.head){
    if(current.identity&&current.identity.lineage_id!==source.lineage_id)throw transferError("transfer_empty_identity_lineage_conflict");
    mode="fresh_transfer";candidatePayload=clone(source.payload);notices.push("현재 canonical HEAD가 없어 가져온 lineage를 유지하고 이 저장 컨테이너의 새 replica_id로 revision 1을 생성합니다.");
  }else if(current.snapshot.user_payload_hash===source.user_payload_hash&&current.snapshot.purge_epoch===source.purge_epoch){
    return Object.freeze({preview_id:null,mode:"already_equivalent",already_current:true,can_apply:false,requires_conflict_confirmation:false,requires_sensitive_opt_in:false,sensitive_count:check.sensitive_count,current:sourceSummary(current.snapshot),incoming:sourceSummary(source),conflicts:Object.freeze([]),notices:Object.freeze(["현재 canonical USER 내용과 가져온 백업 내용이 이미 동일합니다. revision 숫자와 관계없이 저장하지 않습니다."])});
  }else if(current.head.lineage_id!==source.lineage_id){
    mode="cross_lineage_conflict";requiresConflict=true;conflicts=[{kind:"different_lineage"}];notices.push("lineage가 다르므로 purge_epoch와 revision을 서로 비교해 우열을 결정하지 않습니다. 사용자가 local 유지 또는 incoming 선택을 명시해야 합니다.");
  }else if(source.purge_epoch<current.head.purge_epoch){
    throw transferError("transfer_purge_epoch_regression_blocked",{current:current.head.purge_epoch,incoming:source.purge_epoch});
  }else if(source.purge_epoch>current.head.purge_epoch){
    mode="higher_purge_epoch_conflict";requiresConflict=true;rootAdoption=true;conflicts=[{kind:"higher_purge_epoch"}];notices.push("같은 lineage에서 더 높은 purge_epoch가 확인되었습니다. incoming을 선택하면 parent=null의 transfer root로 채택하여 낮은 epoch ancestry를 연결하지 않습니다.");
  }else{
    const localWindow=await collectLocalWindow(db,current.snapshot,{storageApi,recoveryApi,userStateApi});
    const remoteWindow=incomingWindow(bundle);
    if(containsSnapshot(remoteWindow,current.snapshot)){
      mode="deterministic_fast_forward";candidatePayload=clone(source.payload);commonBase=current.snapshot;notices.push("현재 HEAD가 incoming bounded history의 ancestor로 확인되어 deterministic fast-forward transfer가 가능합니다.");
    }else if(containsSnapshot(localWindow,source)){
      return Object.freeze({preview_id:null,mode:"local_ahead",already_current:true,can_apply:false,requires_conflict_confirmation:false,requires_sensitive_opt_in:false,sensitive_count:check.sensitive_count,current:sourceSummary(current.snapshot),incoming:sourceSummary(source),conflicts:Object.freeze([]),notices:Object.freeze(["가져온 snapshot이 현재 local bounded history의 ancestor입니다. local이 이미 해당 내용을 포함한 이후 상태이므로 저장하지 않습니다."])});
    }else{
      const common=findCommonBase(localWindow,remoteWindow);
      if(common){
        commonBase=common.local;
        const merged=threeWayMergePayload(common.local.payload,current.snapshot.payload,source.payload,{storageApi,userStateApi});
        if(merged.ok){
          if(sameJson(merged.payload,current.snapshot.payload,storageApi))return Object.freeze({preview_id:null,mode:"merge_no_change",already_current:true,can_apply:false,requires_conflict_confirmation:false,requires_sensitive_opt_in:false,sensitive_count:check.sensitive_count,current:sourceSummary(current.snapshot),incoming:sourceSummary(source),conflicts:Object.freeze([]),notices:Object.freeze(["공통 ancestor 기준 deterministic merge 결과가 현재 local과 동일해 저장하지 않습니다."])});
          mode="deterministic_three_way_merge";candidatePayload=merged.payload;notices.push("bounded common ancestor를 기준으로 서로 겹치지 않는 변경만 deterministic three-way merge했습니다.");
        }else{
          mode="divergent_conflict";requiresConflict=true;conflicts=merged.conflicts;notices.push("공통 ancestor는 확인했지만 같은 항목의 상충 변경이 있어 자동 merge하지 않습니다.");
        }
      }else{
        mode="no_common_base_conflict";requiresConflict=true;conflicts=[{kind:"no_common_base"}];notices.push("bounded history 안에서 공통 ancestor를 증명할 수 없어 자동 merge하지 않습니다.");
      }
    }
  }

  if(requiresConflict)candidatePayload=null;
  else if(candidatePayload)requiresSensitive=sensitiveCount(candidatePayload)>0;
  const entry={operationId,bundle:clone(bundle),baseHead:clone(current.head),baseIdentity:clone(current.identity),source:clone(source),mode,candidatePayload:clone(candidatePayload),conflicts:clone(conflicts),commonBase:clone(commonBase),requiresSensitive,requiresConflict,rootAdoption};
  previewRegistry.set(previewId,entry);trimPreviews();
  return Object.freeze({
    preview_id:previewId,mode,already_current:false,
    can_apply:committable&&!requiresConflict&&(!requiresSensitive||sensitiveOptIn===true),
    requires_conflict_confirmation:requiresConflict,requires_sensitive_opt_in:requiresSensitive,sensitive_count:requiresConflict?check.sensitive_count:(candidatePayload?sensitiveCount(candidatePayload):check.sensitive_count),
    current:current.snapshot?sourceSummary(current.snapshot):null,incoming:sourceSummary(source),
    common_base:commonBase?sourceSummary(commonBase):null,
    conflicts:Object.freeze(conflicts.map(c=>Object.freeze({...c,text:conflictText(c)}))),notices:Object.freeze(notices)
  });
}

async function inspectTransferFile(db,file,options={}){
  const bundle=await parseTransferFile(file,options);
  return prepareTransferPreview(db,bundle,options);
}

function transferMetadata(entry,resolution,currentHead,historyApi){
  const priority=historyApi&&typeof historyApi.operationPriority==="function"?historyApi.operationPriority(entry.source.operation_type):0;
  return Object.freeze({
    kind:"cross_replica_transfer",
    merge_mode:entry.mode,
    resolution,
    source_lineage_id:entry.source.lineage_id,
    source_replica_id:entry.source.replica_id,
    source_snapshot_id:entry.source.snapshot_id,
    source_snapshot_hash:entry.source.snapshot_hash,
    source_revision:entry.source.revision,
    source_purge_epoch:entry.source.purge_epoch,
    source_operation_type:entry.source.operation_type,
    source_operation_priority:priority,
    target_base_snapshot_id:currentHead?currentHead.snapshot_id:null,
    target_base_snapshot_hash:currentHead?currentHead.snapshot_hash:null,
    target_base_revision:currentHead?currentHead.revision:0,
    target_base_purge_epoch:currentHead?currentHead.purge_epoch:null,
    common_base_snapshot_id:entry.commonBase?entry.commonBase.snapshot_id:null,
    common_base_snapshot_hash:entry.commonBase?entry.commonBase.snapshot_hash:null
  });
}

async function reconcile(db,operationId,storageApi){
  try{const inspected=await storageApi.inspectOperation(db,operationId);return inspected&&inspected.receipt?inspected:null;}catch(_){return null;}
}

async function commitTransferPreview(db,previewId,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,recoveryApi=global.InooCanonicalRecovery,historyApi=global.InooCanonicalHistory,
  personaDependency=null,approved=false,sensitiveOptIn=false,conflictResolution=null
}={}){
  if(approved!==true)throw transferError("transfer_human_approval_required");
  const entry=previewRegistry.get(previewId);if(!entry)throw transferError("transfer_preview_missing_or_expired");
  await verifyBundle(entry.bundle,{recoveryApi,storageApi,userStateApi,personaDependency});
  const current=await verifiedCurrent(db,{storageApi,userStateApi});
  if(!sameHead(current.head,entry.baseHead))throw transferError("stale_candidate",{reason:"transfer_head_changed_since_preview"});

  let payload=clone(entry.candidatePayload),resolution=entry.requiresConflict?conflictResolution:"deterministic";
  if(entry.requiresConflict){
    if(conflictResolution!=="keep_local"&&conflictResolution!=="use_incoming")throw transferError("transfer_conflict_resolution_required");
    if(conflictResolution==="keep_local"){
      previewRegistry.delete(previewId);
      return Object.freeze({status:"NO_CHANGE",outcome:"kept_local",operation_id:null,revision:current.head?current.head.revision:0});
    }
    payload=clone(entry.source.payload);
  }
  if(entry.requiresSensitive&&sensitiveOptIn!==true)throw transferError("transfer_sensitive_opt_in_required");
  if(!payload)throw transferError("transfer_candidate_payload_missing");
  userStateApi.validateCanonicalState(payload);

  let operationType=TRANSFER_OPERATION_TYPE,purgeEpoch=entry.source.purge_epoch,lineageId=entry.source.lineage_id,useRoot=false;
  if(current.head){
    lineageId=current.head.lineage_id;
    if(entry.mode==="higher_purge_epoch_conflict"){
      if(entry.source.lineage_id!==current.head.lineage_id||entry.source.purge_epoch<=current.head.purge_epoch)throw transferError("transfer_purge_adopt_invalid");
      operationType=PURGE_ADOPT_OPERATION_TYPE;purgeEpoch=entry.source.purge_epoch;useRoot=true;
    }else{
      purgeEpoch=current.head.purge_epoch;
      operationType=entry.mode==="cross_lineage_conflict"?TRANSFER_OPERATION_TYPE:MERGE_OPERATION_TYPE;
    }
  }
  const metadata=transferMetadata(entry,resolution,current.head,historyApi);
  let committed;
  try{
    const input={operationId:entry.operationId,userSchemaVersion:userStateApi.USER_SCHEMA_VERSION,operationType,purgeEpoch,payload,operationMetadata:metadata,expectedHeadSnapshotId:current.head?current.head.snapshot_id:null,expectedHeadHash:current.head?current.head.snapshot_hash:null,lineageId};
    committed=useRoot?await storageApi.commitTransferRoot(db,input):await storageApi.commitSnapshot(db,input);
  }catch(e){
    if(e&&e.code==="stale_candidate")throw transferError("stale_candidate",e.details);
    const inspected=await reconcile(db,entry.operationId,storageApi);
    if(!inspected)throw transferError("transfer_commit_unknown",{operation_id:entry.operationId,cause:e&&e.code||String(e)});
    committed={status:"already_committed",receipt:inspected.receipt};
  }
  let verified;try{verified=await storageApi.verifyHead(db);}catch(e){throw transferError("transfer_commit_unknown",{operation_id:entry.operationId,cause:e&&e.code||String(e)});}
  if(!verified||!verified.ok||!verified.snapshot||verified.snapshot.operation_id!==entry.operationId||verified.snapshot.user_payload_hash!==await storageApi.sha256Hex(payload)||verified.snapshot.lineage_id!==lineageId||verified.snapshot.purge_epoch!==purgeEpoch){
    throw transferError("transfer_readback_mismatch");
  }
  if(useRoot&&verified.snapshot.parent_snapshot_id!==null)throw transferError("transfer_purge_root_parent_mismatch");
  if(!useRoot&&verified.snapshot.parent_snapshot_id!==(entry.baseHead?entry.baseHead.snapshot_id:null))throw transferError("transfer_parent_mismatch");
  userStateApi.validateCanonicalState(verified.snapshot.payload);
  previewRegistry.delete(previewId);
  return Object.freeze({status:"SUCCESS",outcome:committed&&committed.status==="already_committed"?"already_committed":entry.mode,operation_id:entry.operationId,revision:verified.head.revision,purge_epoch:verified.head.purge_epoch});
}

function discardTransferPreview(previewId){return previewRegistry.delete(previewId);}

function humanError(code){
  const map={
    transfer_recovery_required:"canonical USER 검증이 실패해 Transfer/Merge 쓰기를 중지했습니다. Raw Recovery Export를 먼저 사용하세요.",
    transfer_identity_unreadable:"현재 replica identity를 읽지 못해 Transfer를 중지했습니다.",
    transfer_identity_missing:"canonical HEAD는 있지만 replica identity가 없어 Transfer를 중지했습니다.",
    transfer_persona_dependency_unavailable:"현재 Persona 무결성이 준비되지 않아 Standard Backup 기반 Transfer를 검사할 수 없습니다.",
    transfer_purge_epoch_regression_blocked:"현재 같은 lineage의 purge_epoch보다 오래된 백업입니다. 삭제 데이터 resurrection 위험 때문에 차단했습니다.",
    transfer_empty_identity_lineage_conflict:"HEAD가 없지만 기존 lineage identity가 다른 비정상 상태입니다. 자동으로 identity를 바꾸지 않습니다.",
    transfer_human_approval_required:"Transfer/Merge는 Preview 확인 후 명시적 승인이 필요합니다.",
    transfer_sensitive_opt_in_required:"민감 기억이 포함되어 있습니다. 민감 데이터 포함 허용을 켠 뒤 다시 승인하세요.",
    transfer_conflict_resolution_required:"충돌이 있어 local 유지 또는 incoming 선택을 명시해야 합니다.",
    transfer_preview_missing_or_expired:"Transfer Preview가 만료되었습니다. 파일을 다시 검사하세요.",
    stale_candidate:"Transfer Preview 이후 현재 HEAD가 바뀌었습니다. 파일을 다시 선택해 새 Preview부터 진행하세요.",
    transfer_commit_unknown:"Transfer commit 결과를 확정할 수 없습니다. 현재 HEAD/receipt를 다시 확인하기 전에는 같은 작업을 반복하지 마세요."
  };
  return map[code]||"Transfer / Conflict 검증에 실패했습니다. canonical USER는 변경하지 않았습니다.";
}

function shortId(v){const s=String(v||"");return s.length>18?s.slice(0,9)+"…"+s.slice(-6):s||"없음";}
function renderTransferPreview(preview,el){
  if(!el)return;
  const lines=[`판정: ${preview.mode}`];
  if(preview.current)lines.push(`local · lineage ${shortId(preview.current.lineage_id)} · replica ${shortId(preview.current.replica_id)} · rev ${preview.current.revision} · purge ${preview.current.purge_epoch}`);
  else lines.push("local · canonical HEAD 없음");
  lines.push(`incoming · lineage ${shortId(preview.incoming.lineage_id)} · replica ${shortId(preview.incoming.replica_id)} · rev ${preview.incoming.revision} · purge ${preview.incoming.purge_epoch}`);
  if(preview.common_base)lines.push(`공통 ancestor · rev ${preview.common_base.revision} · ${shortId(preview.common_base.snapshot_id)}`);
  if(preview.sensitive_count)lines.push(`민감 기억: ${preview.sensitive_count}개`);
  for(const conflict of preview.conflicts||[])lines.push("⚠ "+conflict.text);
  for(const notice of preview.notices||[])lines.push("• "+notice);
  el.textContent=lines.join("\n");el.hidden=false;
}

async function initTransferUI(){
  ensureTransferFeature();
  const root=global.document;if(!root)return null;
  const area=root.getElementById("replicaTransfer");if(!area)return null;
  const fileInput=root.getElementById("replicaTransferFile"),previewEl=root.getElementById("replicaTransferPreview"),status=root.getElementById("replicaTransferStatus"),
    applyBtn=root.getElementById("btnReplicaTransferApply"),keepBtn=root.getElementById("btnReplicaKeepLocal"),incomingBtn=root.getElementById("btnReplicaUseIncoming"),
    identityEl=root.getElementById("replicaIdentityStatus"),sensitive=root.getElementById("recoverySensitiveOptIn");
  let db=null,pending=null;
  function setStatus(text,tone="info"){if(status){status.textContent=text;status.dataset.state=tone;}}
  function clearPending(){if(pending&&pending.preview_id)discardTransferPreview(pending.preview_id);pending=null;if(previewEl){previewEl.hidden=true;previewEl.textContent="";}if(applyBtn)applyBtn.hidden=true;if(keepBtn)keepBtn.hidden=true;if(incomingBtn)incomingBtn.hidden=true;}
  async function refreshIdentity(){
    if(!db)return;
    try{
      const c=await verifiedCurrent(db);if(identityEl)identityEl.textContent=c.identity?`현재 storage container replica: ${shortId(c.identity.replica_id)} · lineage: ${shortId(c.identity.lineage_id)}`:"현재 canonical replica identity 없음";
      if(fileInput)fileInput.disabled=!!(c.head&&!c.snapshot);
    }catch(e){if(identityEl)identityEl.textContent="현재 replica identity를 안전하게 확인할 수 없습니다.";if(fileInput)fileInput.disabled=true;}
  }
  try{db=await global.InooStorage.openDatabase();await refreshIdentity();}
  catch(e){setStatus("IndexedDB를 열 수 없어 Transfer/Conflict를 사용할 수 없습니다.","error");if(fileInput)fileInput.disabled=true;return null;}

  if(fileInput)fileInput.addEventListener("change",async()=>{
    const file=fileInput.files&&fileInput.files[0];fileInput.value="";clearPending();if(!file)return;
    try{
      pending=await inspectTransferFile(db,file,{personaDependency:runtimePersonaDependency(),sensitiveOptIn:!!(sensitive&&sensitive.checked)});
      renderTransferPreview(pending,previewEl);
      if(pending.already_current){setStatus("저장할 변경이 없습니다. revision 숫자만으로 덮어쓰지 않습니다.","ready");return;}
      if(pending.requires_conflict_confirmation){if(keepBtn)keepBtn.hidden=false;if(incomingBtn)incomingBtn.hidden=false;setStatus("충돌을 자동으로 해결하지 않았습니다. Preview를 읽고 local 유지 또는 incoming 선택을 명시하세요.","warn");}
      else{if(applyBtn){applyBtn.hidden=false;applyBtn.disabled=!pending.can_apply;}setStatus("deterministic Transfer/Merge Preview입니다. 명시적으로 승인하기 전에는 canonical USER가 변경되지 않습니다.","warn");}
    }catch(e){setStatus(humanError(e&&e.code),"error");}
  });

  if(sensitive)sensitive.addEventListener("change",()=>{if(pending&&!pending.requires_conflict_confirmation&&applyBtn&&!applyBtn.hidden)applyBtn.disabled=!!pending.requires_sensitive_opt_in&&!sensitive.checked;});

  async function apply(resolution){
    if(!pending||!pending.preview_id)return;
    if(applyBtn)applyBtn.disabled=true;if(keepBtn)keepBtn.disabled=true;if(incomingBtn)incomingBtn.disabled=true;
    try{
      const result=await commitTransferPreview(db,pending.preview_id,{personaDependency:runtimePersonaDependency(),approved:true,sensitiveOptIn:!!(sensitive&&sensitive.checked),conflictResolution:resolution});
      if(result.status==="NO_CHANGE"){setStatus("local canonical USER를 유지했습니다. 저장 작업은 없었습니다.","ready");}
      else{setStatus(`Transfer/Merge 완료: 새 canonical revision ${result.revision}, purge_epoch ${result.purge_epoch}.`,"ready");global.dispatchEvent(new CustomEvent("inoo:canonical-transfer-committed",{detail:{revision:result.revision,purge_epoch:result.purge_epoch,outcome:result.outcome}}));}
      pending=null;if(previewEl){previewEl.hidden=true;previewEl.textContent="";}if(applyBtn)applyBtn.hidden=true;if(keepBtn)keepBtn.hidden=true;if(incomingBtn)incomingBtn.hidden=true;await refreshIdentity();
    }catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{if(applyBtn&&!applyBtn.hidden)applyBtn.disabled=!!(pending&&pending.requires_sensitive_opt_in)&&!(sensitive&&sensitive.checked);if(keepBtn)keepBtn.disabled=false;if(incomingBtn)incomingBtn.disabled=false;}
  }
  if(applyBtn)applyBtn.addEventListener("click",()=>apply(null));
  if(keepBtn)keepBtn.addEventListener("click",()=>apply("keep_local"));
  if(incomingBtn)incomingBtn.addEventListener("click",()=>apply("use_incoming"));
  if(global.addEventListener){
    global.addEventListener("inoo:canonical-recovery-committed",()=>{clearPending();refreshIdentity().catch(()=>{});});
    global.addEventListener("inoo:canonical-history-committed",()=>{clearPending();refreshIdentity().catch(()=>{});});
  }
  return {db,refreshIdentity,getPending:()=>pending};
}

const api=Object.freeze({
  TRANSFER_VERSION,TRANSFER_OPERATION_TYPE,MERGE_OPERATION_TYPE,PURGE_ADOPT_OPERATION_TYPE,MAX_LOCAL_ANCESTORS,TRANSFER_FEATURE_DESCRIPTOR,
  ensureTransferFeature,collectLocalWindow,findCommonBase,threeWayMergePayload,prepareTransferPreview,inspectTransferFile,commitTransferPreview,discardTransferPreview,renderTransferPreview,initTransferUI,
  _test:Object.freeze({mergeThreeWayValue,mergeMemoryRecords,incomingWindow,containsSnapshot,conflictText,transferMetadata,verifiedCurrent,sensitiveCount})
});
global.InooReplicaTransfer=api;
if(global.document){if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",()=>{initTransferUI().catch(()=>{});},{once:true});else initTransferUI().catch(()=>{});}
})(typeof window!=="undefined"?window:globalThis);
