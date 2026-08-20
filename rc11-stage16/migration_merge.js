(function(global){
"use strict";

const MERGE_VERSION="1.0.0";
const MERGE_OPERATION_TYPE="legacy_migration_merge";
const previewRegistry=new Map();
const PREVIEW_REGISTRY_LIMIT=8;

function mergeError(code,details){const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function trimRegistry(){while(previewRegistry.size>PREVIEW_REGISTRY_LIMIT)previewRegistry.delete(previewRegistry.keys().next().value);}
function same(a,b,storageApi){return storageApi.canonicalJSONStringify(a)===storageApi.canonicalJSONStringify(b);}
function sourceSlotKey(ref){
  if(!isObject(ref)||ref.source!=="legacy_rc10"||typeof ref.storage_key!=="string"||typeof ref.field!=="string")return null;
  return `${ref.source}\u0000${ref.storage_key}\u0000${ref.field}`;
}
function sameCandidateRecord(existing,candidate,storageApi){
  if(existing.status!=="active")return false;
  const a={memory_type:existing.memory_type,provenance:existing.provenance,content:existing.content,subtype:existing.subtype||null};
  const b={memory_type:candidate.memory_type,provenance:candidate.provenance,content:candidate.content,subtype:candidate.subtype||null};
  return same(a,b,storageApi);
}
function appliedFingerprints(payload){
  const out=[];
  const m=isObject(payload&&payload.migration_state)?payload.migration_state:{};
  if(typeof m.source_fingerprint==="string"&&m.source_fingerprint)out.push(m.source_fingerprint);
  if(Array.isArray(m.applied_source_fingerprints))for(const f of m.applied_source_fingerprints)if(typeof f==="string"&&f&&!out.includes(f))out.push(f);
  return out;
}
function conflict(kind,extra={}){return {kind,...extra};}
function conflictPublicText(kind){
  const map={
    purge_epoch_conflict:"삭제(PURGE) 이후의 과거 데이터는 자동으로 되살리지 않습니다.",
    controller_projection_conflict:"현재 설정과 이전 버전 설정이 달라 자동으로 덮어쓰지 않습니다.",
    memory_id_collision:"같은 내부 기억 ID에 서로 다른 내용이 있어 자동 병합하지 않습니다.",
    legacy_slot_changed:"같은 이전 버전 항목 위치의 내용 또는 상태가 달라 사용자 확인이 필요합니다.",
    legacy_slot_duplicate:"같은 이전 버전 항목 위치가 현재 데이터에 여러 번 존재해 자동 병합하지 않습니다.",
    legacy_slot_removed:"현재 기억의 근거가 된 이전 버전 항목이 새 원본에서 사라져 자동 삭제하지 않습니다."
  };
  return map[kind]||"자동 판단할 수 없는 충돌이 있어 사용자 확인이 필요합니다.";
}
function planMerge(currentPayload,envelope,{storageApi,purgeEpoch=0}={}){
  if(!storageApi||typeof storageApi.canonicalJSONStringify!=="function")throw mergeError("storage_api_unavailable");
  const userStateApi=global.InooUserState;
  if(!userStateApi)throw mergeError("user_state_api_unavailable");
  userStateApi.validateCanonicalState(currentPayload);
  userStateApi.validateMigrationEnvelope(envelope);

  const conflicts=[];
  if(Number.isInteger(purgeEpoch)&&purgeEpoch>0)conflicts.push(conflict("purge_epoch_conflict",{purge_epoch:purgeEpoch}));
  if(!same(currentPayload.controller_projection,envelope.controller_projection,storageApi))conflicts.push(conflict("controller_projection_conflict"));

  const existingById=new Map(currentPayload.memory_records.map(r=>[r.memory_id,r]));
  const existingBySlot=new Map();
  for(const r of currentPayload.memory_records){
    const key=sourceSlotKey(r.source_ref);
    if(!key)continue;
    if(!existingBySlot.has(key))existingBySlot.set(key,[]);
    existingBySlot.get(key).push(r);
  }

  const candidateSlots=new Set();
  const additions=[];
  let exactMatches=0;
  for(const c of envelope.user_memory_records){
    const slot=sourceSlotKey(c.source_ref);
    if(slot)candidateSlots.add(slot);
    const byId=existingById.get(c.memory_id);
    if(byId){
      if(sameCandidateRecord(byId,c,storageApi))exactMatches++;
      else conflicts.push(conflict("memory_id_collision",{memory_id:c.memory_id}));
      continue;
    }
    if(slot&&existingBySlot.has(slot)){
      const rows=existingBySlot.get(slot);
      if(rows.length!==1){conflicts.push(conflict("legacy_slot_duplicate",{slot}));continue;}
      if(sameCandidateRecord(rows[0],c,storageApi))exactMatches++;
      else conflicts.push(conflict("legacy_slot_changed",{memory_id:rows[0].memory_id,slot}));
      continue;
    }
    additions.push({
      memory_id:c.memory_id,memory_type:c.memory_type,provenance:c.provenance,content:clone(c.content),status:"active",memory_revision:1,sensitivity:"normal",
      ...(c.source_ref?{source_ref:clone(c.source_ref)}:{}),...(c.subtype?{subtype:c.subtype}:{})
    });
  }

  for(const [slot,rows] of existingBySlot){
    if(candidateSlots.has(slot))continue;
    for(const r of rows){
      if(r.status==="active")conflicts.push(conflict("legacy_slot_removed",{memory_id:r.memory_id,slot}));
    }
  }

  const next=clone(currentPayload);
  next.memory_records.push(...additions);
  const prior=isObject(next.migration_state)?next.migration_state:{};
  const applied=appliedFingerprints(next);
  if(!applied.includes(envelope.source_fingerprint))applied.push(envelope.source_fingerprint);
  next.migration_state={
    ...prior,
    applied_source_fingerprints:applied,
    latest_merge:{
      merge_version:MERGE_VERSION,
      detected_source:envelope.detected_source,
      source_fingerprint:envelope.source_fingerprint,
      added_memory_count:additions.length,
      exact_match_count:exactMatches,
      manual_review_count:envelope.manual_review_summary&&Number.isInteger(envelope.manual_review_summary.count)?envelope.manual_review_summary.count:0,
      sensitive_review_count:envelope.sensitive_review_summary&&Number.isInteger(envelope.sensitive_review_summary.count)?envelope.sensitive_review_summary.count:0,
      controller_projection_changed:false,
      legacy_source_preserved:true
    }
  };
  userStateApi.validateCanonicalState(next);
  return {payload:next,additions,exactMatches,conflicts};
}

async function verifiedCanonical(storageApi,db,userStateApi){
  const v=await storageApi.verifyHead(db);
  if(!v||!v.ok)throw mergeError("migration_merge_recovery_required",{verify_code:v&&v.code||null});
  if(!v.head||!v.snapshot)throw mergeError("migration_merge_canonical_head_required");
  try{userStateApi.validateCanonicalState(v.snapshot.payload);}catch(e){throw mergeError("migration_merge_canonical_head_required",{cause:e&&e.code||String(e)});}
  return v;
}
async function deterministicOperationId(sourceFingerprint,storageApi){
  const digest=await storageApi.sha256Hex({kind:MERGE_OPERATION_TYPE,merge_version:MERGE_VERSION,source_fingerprint:sourceFingerprint});
  return "op_migration_merge_"+digest;
}
function publicSections(plan,candidate){
  const conflictKinds=[...new Set(plan.conflicts.map(x=>x.kind))];
  return [
    {kind:"auto_merge",title:"자동으로 합칠 수 있는 항목",items:[
      plan.additions.length?`새로 확인된 장기기억 ${plan.additions.length}개`:"새로 추가할 장기기억 없음",
      plan.exactMatches?`이미 같은 내용으로 보존된 항목 ${plan.exactMatches}개 — 중복 추가하지 않음`:"중복으로 확인된 항목 없음"
    ]},
    {kind:"needs_review",title:"사용자 확인이 필요한 충돌",items:conflictKinds.length?conflictKinds.map(conflictPublicText):["자동 병합을 막는 충돌 없음"]},
    {kind:"review_only",title:"자동으로 저장하지 않는 항목",items:[
      candidate.review_summary.manual_review_count?`이전 버전 참고자료 ${candidate.review_summary.manual_review_count}개 — 자동 승격하지 않음`:"자동 승격하지 않는 참고자료 없음",
      candidate.review_summary.sensitive_review_count?`민감/옵트인 검토 항목 ${candidate.review_summary.sensitive_review_count}개 — 자동 저장하지 않음`:"민감 검토 항목 없음"
    ]},
    {kind:"preservation",title:"보존",items:["현재 canonical USER 데이터는 덮어쓰지 않음","기존 legacy localStorage는 성공 후에도 삭제하지 않음"]}
  ];
}

async function prepareMigrationMergePreview(storage,db,{logic=global.InooWebLogic,storageApi=global.InooStorage,migrationApi=global.InooMigration,userStateApi=global.InooUserState}={}){
  if(!storageApi||!migrationApi||!userStateApi)throw mergeError("migration_merge_dependency_unavailable");
  const v=await verifiedCanonical(storageApi,db,userStateApi);
  const candidate=await migrationApi.buildMigrationCandidate(storage,{logic,storageApi});
  userStateApi.validateMigrationEnvelope(candidate.envelope);
  if(appliedFingerprints(v.snapshot.payload).includes(candidate.source_fingerprint)){
    return {already_applied:true,can_apply:false,notices:["이 legacy 원본은 현재 USER 데이터에 이미 반영되어 있습니다.","기존 legacy localStorage는 삭제하지 않습니다."]};
  }
  const plan=planMerge(v.snapshot.payload,candidate.envelope,{storageApi,purgeEpoch:v.head.purge_epoch});
  const operationId=await deterministicOperationId(candidate.source_fingerprint,storageApi);
  const planFingerprint=await storageApi.sha256Hex({base_snapshot_id:v.head.snapshot_id,base_snapshot_hash:v.head.snapshot_hash,source_fingerprint:candidate.source_fingerprint,payload:plan.payload,conflicts:plan.conflicts.map(x=>x.kind)});
  const previewId="merge_preview_"+storageApi.newOperationId().replace(/^op_/,"");
  previewRegistry.set(previewId,{operationId,baseHead:clone(v.head),sourceFingerprint:candidate.source_fingerprint,planFingerprint,plan,candidate,logic,storageApi,migrationApi,userStateApi});
  trimRegistry();
  return {
    preview_id:previewId,
    already_applied:false,
    can_apply:plan.conflicts.length===0,
    conflict_count:plan.conflicts.length,
    sections:publicSections(plan,candidate),
    notices:["자동 병합은 명확히 안전한 추가/동일 항목만 처리합니다.",...(plan.conflicts.length?["충돌이 있어 적용이 잠겨 있습니다. 의미를 추측해 자동 수정하지 않습니다."]:[])]
  };
}

async function commitMigrationMergePreview(storage,db,previewId,{approved=false}={}){
  const entry=previewRegistry.get(previewId);
  if(!entry)throw mergeError("migration_merge_preview_missing_or_expired");
  if(approved!==true)throw mergeError("human_approval_required");
  if(entry.plan.conflicts.length)throw mergeError("migration_merge_conflicts_require_review",{conflict_count:entry.plan.conflicts.length});
  const {storageApi,migrationApi,userStateApi,logic}=entry;
  const fresh=await migrationApi.buildMigrationCandidate(storage,{logic,storageApi});
  if(fresh.source_fingerprint!==entry.sourceFingerprint)throw mergeError("stale_migration",{reason:"legacy_source_changed_since_preview"});

  // Reconcile the deterministic operation before declaring a retry stale. This covers
  // a lost response / second same-source preview after the first transaction committed.
  const prior=await storageApi.inspectOperation(db,entry.operationId);
  if(prior.receipt){previewRegistry.delete(previewId);return {status:"SUCCESS",outcome:"already_merged",operation_id:entry.operationId,receipt:prior.receipt};}

  const v=await verifiedCanonical(storageApi,db,userStateApi);
  if(appliedFingerprints(v.snapshot.payload).includes(fresh.source_fingerprint)){previewRegistry.delete(previewId);return {status:"SUCCESS",outcome:"already_applied",operation_id:entry.operationId,receipt:null};}
  if(v.head.snapshot_id!==entry.baseHead.snapshot_id||v.head.snapshot_hash!==entry.baseHead.snapshot_hash||v.head.lineage_id!==entry.baseHead.lineage_id||v.head.purge_epoch!==entry.baseHead.purge_epoch)throw mergeError("stale_candidate",{reason:"canonical_head_changed_since_preview"});

  const freshPlan=planMerge(v.snapshot.payload,fresh.envelope,{storageApi,purgeEpoch:v.head.purge_epoch});
  if(freshPlan.conflicts.length)throw mergeError("migration_merge_conflicts_require_review",{conflict_count:freshPlan.conflicts.length});
  const freshPlanFingerprint=await storageApi.sha256Hex({base_snapshot_id:v.head.snapshot_id,base_snapshot_hash:v.head.snapshot_hash,source_fingerprint:fresh.source_fingerprint,payload:freshPlan.payload,conflicts:[]});
  if(freshPlanFingerprint!==entry.planFingerprint)throw mergeError("stale_migration",{reason:"merge_plan_changed_since_preview"});

  let committed;
  try{
    committed=await storageApi.commitSnapshot(db,{operationId:entry.operationId,userSchemaVersion:userStateApi.USER_SCHEMA_VERSION,operationType:MERGE_OPERATION_TYPE,purgeEpoch:v.head.purge_epoch,payload:freshPlan.payload,expectedHeadSnapshotId:v.head.snapshot_id,expectedHeadHash:v.head.snapshot_hash});
  }catch(e){
    try{const inspected=await storageApi.inspectOperation(db,entry.operationId);if(inspected.receipt)return {status:"COMMIT_UNKNOWN",outcome:"receipt_found_after_commit_exception",operation_id:entry.operationId,receipt:inspected.receipt,error_code:e&&e.code||null};}
    catch(reconcileError){throw mergeError("migration_merge_commit_unknown",{commit_error:e&&e.code||String(e),reconcile_error:reconcileError&&reconcileError.code||String(reconcileError)});}
    throw mergeError("migration_merge_commit_failed",{cause:e&&e.code||String(e)});
  }

  let verified;
  try{verified=await storageApi.verifyHead(db);}catch(e){return {status:"COMMIT_UNKNOWN",outcome:"readback_unavailable",operation_id:entry.operationId,receipt:committed.receipt||null,error_code:e&&e.code||null};}
  if(!verified||!verified.ok||!verified.snapshot||verified.snapshot.operation_id!==entry.operationId||verified.snapshot.operation_type!==MERGE_OPERATION_TYPE||verified.snapshot.user_schema_version!==userStateApi.USER_SCHEMA_VERSION){
    return {status:"COMMIT_UNKNOWN",outcome:"readback_mismatch",operation_id:entry.operationId,receipt:committed.receipt||null,verify_code:verified&&verified.code||null};
  }
  userStateApi.validateCanonicalState(verified.snapshot.payload);

  let post;
  try{post=await migrationApi.buildMigrationCandidate(storage,{logic,storageApi});}catch(e){
    previewRegistry.delete(previewId);
    return {status:"SUCCESS",outcome:"merged_source_postcheck_unknown",operation_id:entry.operationId,receipt:committed.receipt||null,revision:verified.head.revision,requires_source_review:true,source_postcheck_error:e&&e.code||null};
  }
  previewRegistry.delete(previewId);
  if(post.source_fingerprint!==fresh.source_fingerprint)return {status:"SUCCESS",outcome:"merged_source_changed_after_capture",operation_id:entry.operationId,receipt:committed.receipt||null,revision:verified.head.revision,requires_merge:true};
  return {status:"SUCCESS",outcome:committed.status==="already_committed"?"already_merged":"merged",operation_id:entry.operationId,receipt:committed.receipt||null,revision:verified.head.revision,added_memory_count:freshPlan.additions.length};
}

function discardMigrationMergePreview(previewId){return previewRegistry.delete(previewId);}

const api=Object.freeze({
  MERGE_VERSION,MERGE_OPERATION_TYPE,
  prepareMigrationMergePreview,commitMigrationMergePreview,discardMigrationMergePreview,
  _test:{planMerge,sourceSlotKey,appliedFingerprints,deterministicOperationId,conflictPublicText}
});
global.InooMigrationMerge=api;
})(typeof window!=="undefined"?window:globalThis);
