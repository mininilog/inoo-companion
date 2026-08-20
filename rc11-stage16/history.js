(function(global){
"use strict";

const HISTORY_VERSION="stage17-h07-history-1";
const ROLLBACK_OPERATION_TYPE="canonical_forward_rollback";
const PURGE_OPERATION_TYPE="canonical_purge";
const PURGE_POLICY_VERSION="h07-sanitized-user-root-1";
const MAX_ROLLBACK_CANDIDATES=2;
const PREVIEW_LIMIT=4;
const previewRegistry=new Map();

const HISTORY_FEATURE_DESCRIPTOR=Object.freeze({
  feature_id:"canonical_history",
  feature_schema_version:"1",
  read_capabilities:["canonical_user:read","recovery:rollback_read"],
  write_capabilities:["canonical_user:rollback_gate","canonical_user:purge_gate"],
  migration_owner:"canonical_history",
  state_namespace:"feature.canonical_history"
});

const OPERATION_PRIORITY=Object.freeze({NORMAL:1,MERGE:2,PURGE:3});
const MERGE_OPERATION_TYPES=Object.freeze(new Set(["legacy_migration_merge","canonical_replica_merge"]));

function historyError(code,details){const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function sameJson(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch(_){return false;}}
function trimPreviewRegistry(){while(previewRegistry.size>PREVIEW_LIMIT)previewRegistry.delete(previewRegistry.keys().next().value);}
function compareHead(a,b){
  if(!a&&!b)return true;if(!a||!b)return false;
  return a.snapshot_id===b.snapshot_id&&a.snapshot_hash===b.snapshot_hash&&a.revision===b.revision&&a.purge_epoch===b.purge_epoch&&a.lineage_id===b.lineage_id;
}
function operationPriority(operationType){
  if(operationType===PURGE_OPERATION_TYPE||operationType==="canonical_replica_purge_adopt")return OPERATION_PRIORITY.PURGE;
  if(MERGE_OPERATION_TYPES.has(operationType))return OPERATION_PRIORITY.MERGE;
  return OPERATION_PRIORITY.NORMAL;
}
function compareOperationPriority(a,b){return operationPriority(a)-operationPriority(b);}

function ensureHistoryFeature(foundation=global.InooIntegrityFoundation){
  if(!foundation||!foundation.defaultRegistry)throw historyError("history_foundation_unavailable");
  const registry=foundation.defaultRegistry;
  try{
    const existing=registry.getFeature(HISTORY_FEATURE_DESCRIPTOR.feature_id);
    if(!sameJson(existing,HISTORY_FEATURE_DESCRIPTOR))throw historyError("history_feature_descriptor_conflict");
    return existing;
  }catch(e){
    if(e&&e.code!=="feature_not_registered")throw e;
    return registry.registerFeature(HISTORY_FEATURE_DESCRIPTOR);
  }
}

async function verifiedCanonical(db,{storageApi=global.InooStorage,userStateApi=global.InooUserState}={}){
  if(!storageApi||typeof storageApi.verifyHead!=="function")throw historyError("history_storage_api_unavailable");
  if(!userStateApi||typeof userStateApi.validateCanonicalState!=="function")throw historyError("history_user_state_api_unavailable");
  const verified=await storageApi.verifyHead(db);
  if(!verified||!verified.ok)throw historyError("history_recovery_required",{verify_code:verified&&verified.code||null});
  if(!verified.head||!verified.snapshot)throw historyError("history_head_missing");
  userStateApi.validateCanonicalState(verified.snapshot.payload);
  return verified;
}

async function verifyHistorySnapshot(snapshot,{storageApi=global.InooStorage,userStateApi=global.InooUserState,recoveryApi=global.InooCanonicalRecovery}={}){
  if(recoveryApi&&typeof recoveryApi.verifySnapshotRecord==="function"){
    await recoveryApi.verifySnapshotRecord(snapshot,{storageApi,userStateApi,requireCanonical:true});
    return true;
  }
  if(!snapshot||!isObject(snapshot))throw historyError("history_snapshot_invalid");
  const payloadHash=await storageApi.sha256Hex(snapshot.payload);
  if(payloadHash!==snapshot.user_payload_hash)throw historyError("history_snapshot_payload_hash_mismatch");
  userStateApi.validateCanonicalState(snapshot.payload);
  return true;
}

async function collectRollbackCandidates(db,currentSnapshot,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,recoveryApi=global.InooCanonicalRecovery,maxCandidates=MAX_ROLLBACK_CANDIDATES
}={}){
  if(!currentSnapshot||!isObject(currentSnapshot))throw historyError("history_current_snapshot_required");
  const out=[];
  let parentId=currentSnapshot.parent_snapshot_id;
  while(parentId&&out.length<maxCandidates){
    const row=await storageApi.readSnapshot(db,parentId);
    if(!row)break;
    await verifyHistorySnapshot(row,{storageApi,userStateApi,recoveryApi});
    if(row.lineage_id!==currentSnapshot.lineage_id)break;
    if(row.purge_epoch!==currentSnapshot.purge_epoch)break;
    out.push(Object.freeze({
      snapshot_id:row.snapshot_id,
      snapshot_hash:row.snapshot_hash,
      revision:row.revision,
      created_at:row.created_at,
      operation_type:row.operation_type,
      purge_epoch:row.purge_epoch,
      memory_count:Array.isArray(row.payload&&row.payload.memory_records)?row.payload.memory_records.length:0
    }));
    parentId=row.parent_snapshot_id;
  }
  return Object.freeze(out);
}

function rollbackMetadata(baseHead,target){
  return Object.freeze({
    kind:"forward_rollback",
    metadata_version:"1",
    lineage_id:baseHead.lineage_id,
    source_head_snapshot_id:baseHead.snapshot_id,
    source_head_snapshot_hash:baseHead.snapshot_hash,
    source_head_revision:baseHead.revision,
    rollback_target_snapshot_id:target.snapshot_id,
    rollback_target_snapshot_hash:target.snapshot_hash,
    rollback_target_revision:target.revision,
    purge_epoch:baseHead.purge_epoch
  });
}
function purgeMetadata(baseHead,newEpoch){
  return Object.freeze({
    kind:"purge",
    metadata_version:"1",
    policy_version:PURGE_POLICY_VERSION,
    lineage_id:baseHead.lineage_id,
    previous_head_snapshot_id:baseHead.snapshot_id,
    previous_head_snapshot_hash:baseHead.snapshot_hash,
    previous_revision:baseHead.revision,
    previous_purge_epoch:baseHead.purge_epoch,
    new_purge_epoch:newEpoch
  });
}
function sanitizedRootPayload(userStateApi=global.InooUserState){
  if(!userStateApi||!userStateApi.USER_SCHEMA_VERSION)throw historyError("history_user_state_api_unavailable");
  const payload={
    schema_version:userStateApi.USER_SCHEMA_VERSION,
    state_kind:"canonical_user_state",
    controller_projection:{},
    memory_records:[],
    migration_state:null
  };
  userStateApi.validateCanonicalState(payload);
  return payload;
}

async function prepareRollbackPreview(db,targetSnapshotId,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,recoveryApi=global.InooCanonicalRecovery
}={}){
  const current=await verifiedCanonical(db,{storageApi,userStateApi});
  const candidates=await collectRollbackCandidates(db,current.snapshot,{storageApi,userStateApi,recoveryApi});
  const candidate=candidates.find(x=>x.snapshot_id===targetSnapshotId);
  if(!candidate)throw historyError("rollback_target_not_in_bounded_history");
  const target=await storageApi.readSnapshot(db,candidate.snapshot_id);
  await verifyHistorySnapshot(target,{storageApi,userStateApi,recoveryApi});
  if(target.lineage_id!==current.head.lineage_id)throw historyError("rollback_lineage_mismatch");
  if(target.purge_epoch!==current.head.purge_epoch)throw historyError("rollback_purge_epoch_mismatch");
  const operationId=storageApi.newOperationId();
  const previewId="history_preview_"+String(operationId).replace(/^op_/,"");
  const entry={kind:"rollback",operationId,baseHead:clone(current.head),targetSnapshot:clone(target),metadata:rollbackMetadata(current.head,target)};
  previewRegistry.set(previewId,entry);trimPreviewRegistry();
  return Object.freeze({
    preview_id:previewId,
    kind:"rollback",
    can_apply:true,
    current_revision:current.head.revision,
    target_revision:target.revision,
    new_revision:current.head.revision+1,
    target_snapshot_id:target.snapshot_id,
    target_created_at:target.created_at,
    target_memory_count:Array.isArray(target.payload.memory_records)?target.payload.memory_records.length:0,
    purge_epoch:current.head.purge_epoch,
    notices:Object.freeze([
      "HEAD를 과거 revision으로 이동하지 않습니다. 선택한 payload를 복사한 새 forward revision을 생성합니다.",
      "Preview 이후 HEAD가 바뀌면 stale candidate로 저장을 차단합니다."
    ])
  });
}

async function reconcileCommittedOperation(db,operationId,{storageApi=global.InooStorage}={}){
  if(!storageApi||typeof storageApi.inspectOperation!=="function")return null;
  try{const inspected=await storageApi.inspectOperation(db,operationId);return inspected&&inspected.receipt?inspected:null;}catch(_){return null;}
}

async function commitRollbackPreview(db,previewId,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,recoveryApi=global.InooCanonicalRecovery,approved=false
}={}){
  if(approved!==true)throw historyError("rollback_human_approval_required");
  const entry=previewRegistry.get(previewId);
  if(!entry||entry.kind!=="rollback")throw historyError("rollback_preview_missing_or_expired");
  const current=await verifiedCanonical(db,{storageApi,userStateApi});
  if(!compareHead(current.head,entry.baseHead))throw historyError("stale_candidate",{reason:"rollback_head_changed_since_preview"});
  const candidates=await collectRollbackCandidates(db,current.snapshot,{storageApi,userStateApi,recoveryApi});
  if(!candidates.some(x=>x.snapshot_id===entry.targetSnapshot.snapshot_id&&x.snapshot_hash===entry.targetSnapshot.snapshot_hash))throw historyError("rollback_target_no_longer_eligible");
  const target=await storageApi.readSnapshot(db,entry.targetSnapshot.snapshot_id);
  await verifyHistorySnapshot(target,{storageApi,userStateApi,recoveryApi});
  if(target.lineage_id!==current.head.lineage_id||target.purge_epoch!==current.head.purge_epoch)throw historyError("rollback_lineage_or_epoch_changed");
  let committed;
  try{
    committed=await storageApi.commitSnapshot(db,{
      operationId:entry.operationId,
      userSchemaVersion:userStateApi.USER_SCHEMA_VERSION,
      operationType:ROLLBACK_OPERATION_TYPE,
      purgeEpoch:current.head.purge_epoch,
      payload:clone(target.payload),
      operationMetadata:entry.metadata,
      expectedHeadSnapshotId:entry.baseHead.snapshot_id,
      expectedHeadHash:entry.baseHead.snapshot_hash,
      lineageId:entry.baseHead.lineage_id
    });
  }catch(e){
    if(e&&e.code==="stale_candidate")throw historyError("stale_candidate",{reason:"rollback_commit_head_changed"});
    const inspected=await reconcileCommittedOperation(db,entry.operationId,{storageApi});
    if(!inspected)throw historyError("history_commit_unknown",{operation_id:entry.operationId,cause:e&&e.code||String(e)});
    committed={status:"already_committed",receipt:inspected.receipt};
  }
  const verified=await storageApi.verifyHead(db);
  if(!verified||!verified.ok||!verified.snapshot)throw historyError("rollback_readback_failed");
  const snapshot=verified.snapshot;
  if(snapshot.operation_id!==entry.operationId||snapshot.operation_type!==ROLLBACK_OPERATION_TYPE||snapshot.parent_snapshot_id!==entry.baseHead.snapshot_id||
    snapshot.revision!==entry.baseHead.revision+1||snapshot.revision<=target.revision||snapshot.purge_epoch!==entry.baseHead.purge_epoch||
    snapshot.user_payload_hash!==target.user_payload_hash||!snapshot.operation_metadata||snapshot.operation_metadata.rollback_target_snapshot_id!==target.snapshot_id){
    throw historyError("rollback_readback_mismatch");
  }
  userStateApi.validateCanonicalState(snapshot.payload);
  previewRegistry.delete(previewId);
  return Object.freeze({status:"SUCCESS",outcome:committed&&committed.status==="already_committed"?"already_committed":"rolled_back_forward",operation_id:entry.operationId,revision:verified.head.revision,target_revision:target.revision});
}

async function preparePurgePreview(db,{storageApi=global.InooStorage,userStateApi=global.InooUserState}={}){
  const current=await verifiedCanonical(db,{storageApi,userStateApi});
  const operationId=storageApi.newOperationId();
  const previewId="history_preview_"+String(operationId).replace(/^op_/,"");
  const newEpoch=current.head.purge_epoch+1;
  const payload=sanitizedRootPayload(userStateApi);
  const metadata=purgeMetadata(current.head,newEpoch);
  previewRegistry.set(previewId,{kind:"purge",operationId,baseHead:clone(current.head),payload:clone(payload),metadata,newEpoch});trimPreviewRegistry();
  return Object.freeze({
    preview_id:previewId,
    kind:"purge",
    can_apply:true,
    current_revision:current.head.revision,
    new_revision:current.head.revision+1,
    current_purge_epoch:current.head.purge_epoch,
    new_purge_epoch:newEpoch,
    memory_count:Array.isArray(current.snapshot.payload.memory_records)?current.snapshot.payload.memory_records.length:0,
    parent_snapshot_id:null,
    notices:Object.freeze([
      "PURGE는 현재 canonical USER memory와 canonical controller projection을 비운 sanitized NEW ROOT를 생성합니다.",
      "새 root의 parent는 null이며 purge_epoch가 1 증가합니다.",
      "이미 내려받은 옛 백업이나 오프라인 replica는 서버리스 구조에서 원격 폐기할 수 없습니다. 이 replica는 낮은 purge_epoch 복원을 차단합니다."
    ])
  });
}

async function commitPurgePreview(db,previewId,{
  storageApi=global.InooStorage,userStateApi=global.InooUserState,approved=false,oldBackupWarningAcknowledged=false
}={}){
  if(approved!==true)throw historyError("purge_human_approval_required");
  if(oldBackupWarningAcknowledged!==true)throw historyError("purge_old_backup_warning_ack_required");
  const entry=previewRegistry.get(previewId);
  if(!entry||entry.kind!=="purge")throw historyError("purge_preview_missing_or_expired");
  const current=await verifiedCanonical(db,{storageApi,userStateApi});
  if(!compareHead(current.head,entry.baseHead))throw historyError("stale_candidate",{reason:"purge_head_changed_since_preview"});
  if(entry.newEpoch!==current.head.purge_epoch+1)throw historyError("purge_epoch_increment_required");
  if(!storageApi||typeof storageApi.commitNewRoot!=="function")throw historyError("purge_storage_root_api_unavailable");
  let committed;
  try{
    committed=await storageApi.commitNewRoot(db,{
      operationId:entry.operationId,
      userSchemaVersion:userStateApi.USER_SCHEMA_VERSION,
      operationType:PURGE_OPERATION_TYPE,
      purgeEpoch:entry.newEpoch,
      payload:clone(entry.payload),
      operationMetadata:entry.metadata,
      expectedHeadSnapshotId:entry.baseHead.snapshot_id,
      expectedHeadHash:entry.baseHead.snapshot_hash,
      lineageId:entry.baseHead.lineage_id
    });
  }catch(e){
    if(e&&e.code==="stale_candidate")throw historyError("stale_candidate",{reason:"purge_commit_head_changed"});
    const inspected=await reconcileCommittedOperation(db,entry.operationId,{storageApi});
    if(!inspected)throw historyError("history_commit_unknown",{operation_id:entry.operationId,cause:e&&e.code||String(e)});
    committed={status:"already_committed",receipt:inspected.receipt};
  }
  const verified=await storageApi.verifyHead(db);
  if(!verified||!verified.ok||!verified.snapshot)throw historyError("purge_readback_failed");
  const snapshot=verified.snapshot;
  if(snapshot.operation_id!==entry.operationId||snapshot.operation_type!==PURGE_OPERATION_TYPE||snapshot.parent_snapshot_id!==null||
    snapshot.revision!==entry.baseHead.revision+1||snapshot.purge_epoch!==entry.newEpoch||snapshot.lineage_id!==entry.baseHead.lineage_id||
    !snapshot.operation_metadata||snapshot.operation_metadata.new_purge_epoch!==entry.newEpoch){
    throw historyError("purge_readback_mismatch");
  }
  userStateApi.validateCanonicalState(snapshot.payload);
  if(snapshot.payload.memory_records.length!==0||Object.keys(snapshot.payload.controller_projection).length!==0||snapshot.payload.migration_state!==null)throw historyError("purge_sanitization_failed");
  previewRegistry.delete(previewId);
  return Object.freeze({status:"SUCCESS",outcome:committed&&committed.status==="already_committed"?"already_committed":"purged",operation_id:entry.operationId,revision:verified.head.revision,purge_epoch:verified.head.purge_epoch});
}

function discardHistoryPreview(previewId){return previewRegistry.delete(previewId);}

function evaluateIncomingSnapshot(currentSnapshot,incomingSnapshot){
  if(!currentSnapshot||!incomingSnapshot)return Object.freeze({action:"insufficient_data",auto_apply:false});
  if(currentSnapshot.lineage_id!==incomingSnapshot.lineage_id)return Object.freeze({action:"requires_transfer",auto_apply:false});
  if(incomingSnapshot.purge_epoch<currentSnapshot.purge_epoch)return Object.freeze({action:"block_purge_epoch_regression",auto_apply:false});
  if(incomingSnapshot.purge_epoch>currentSnapshot.purge_epoch)return Object.freeze({action:"requires_cross_replica_conflict_review",auto_apply:false,priority:operationPriority(incomingSnapshot.operation_type)});
  if(incomingSnapshot.replica_id!==undefined&&currentSnapshot.replica_id!==undefined&&incomingSnapshot.replica_id!==currentSnapshot.replica_id)return Object.freeze({action:"requires_cross_replica_conflict_review",auto_apply:false,priority:operationPriority(incomingSnapshot.operation_type)});
  return Object.freeze({action:"same_epoch_local_evaluation",auto_apply:false,priority:operationPriority(incomingSnapshot.operation_type)});
}

function humanError(code){
  const map={
    history_recovery_required:"canonical USER 검증이 실패해 Rollback/PURGE 쓰기를 중지했습니다. Raw Recovery Export를 먼저 사용하세요.",
    history_head_missing:"canonical USER가 없어 Rollback/PURGE를 실행할 수 없습니다.",
    rollback_target_not_in_bounded_history:"선택한 revision이 현재 bounded rollback history에 없습니다.",
    rollback_human_approval_required:"Rollback은 Preview 확인 후 명시적으로 승인해야 합니다.",
    rollback_preview_missing_or_expired:"Rollback Preview가 만료되었습니다. 다시 검사하세요.",
    rollback_target_no_longer_eligible:"Rollback 대상이 현재 HEAD의 허용된 ancestor가 아니어서 저장하지 않았습니다.",
    rollback_lineage_mismatch:"Rollback 대상 lineage가 현재 canonical USER와 달라 저장하지 않았습니다.",
    rollback_purge_epoch_mismatch:"이전 PURGE epoch의 데이터는 Rollback 대상으로 사용할 수 없습니다.",
    purge_human_approval_required:"PURGE는 Preview 확인 후 명시적으로 승인해야 합니다.",
    purge_old_backup_warning_ack_required:"서버리스 환경의 옛 백업/오프라인 replica 한계를 확인해야 PURGE할 수 있습니다.",
    purge_preview_missing_or_expired:"PURGE Preview가 만료되었습니다. 다시 검사하세요.",
    purge_epoch_increment_required:"PURGE epoch 조건이 달라져 작업을 중지했습니다.",
    stale_candidate:"Preview 이후 현재 HEAD가 바뀌었습니다. 새 Preview부터 다시 진행하세요.",
    history_commit_unknown:"commit 결과를 확정할 수 없습니다. 현재 HEAD/receipt를 다시 확인하기 전에는 같은 작업을 반복하지 마세요."
  };
  return map[code]||"Rollback / PURGE 검증에 실패했습니다. canonical USER는 변경하지 않았습니다.";
}

function renderRollbackPreview(preview,el){
  if(!el)return;
  const lines=[
    `현재 revision ${preview.current_revision} → 새 revision ${preview.new_revision}`,
    `되돌릴 내용의 원본 revision: ${preview.target_revision}`,
    `대상 기억 수: ${preview.target_memory_count}개`,
    `purge_epoch: ${preview.purge_epoch}`
  ];
  for(const notice of preview.notices||[])lines.push("• "+notice);
  el.textContent=lines.join("\n");el.hidden=false;
}
function renderPurgePreview(preview,el){
  if(!el)return;
  const lines=[
    `현재 revision ${preview.current_revision} → 새 root revision ${preview.new_revision}`,
    `purge_epoch ${preview.current_purge_epoch} → ${preview.new_purge_epoch}`,
    `삭제 대상 canonical memory: ${preview.memory_count}개`,
    "새 root parent: null"
  ];
  for(const notice of preview.notices||[])lines.push("• "+notice);
  el.textContent=lines.join("\n");el.hidden=false;
}

async function initHistoryUI(){
  ensureHistoryFeature();
  const root=global.document;if(!root)return null;
  const area=root.getElementById("historySafety");if(!area)return null;
  const select=root.getElementById("rollbackTarget"),rollbackInspect=root.getElementById("btnRollbackInspect"),rollbackPreview=root.getElementById("rollbackPreview"),rollbackApply=root.getElementById("btnRollbackApply"),
    purgeInspect=root.getElementById("btnPurgeInspect"),purgePreview=root.getElementById("purgePreview"),purgeApply=root.getElementById("btnPurgeApply"),purgeAck=root.getElementById("purgeOldBackupAck"),status=root.getElementById("historySafetyStatus");
  let db=null,pendingRollback=null,pendingPurge=null;
  function setStatus(text,tone="info"){if(status){status.textContent=text;status.dataset.state=tone;}}
  function clearRollback(){if(pendingRollback&&pendingRollback.preview_id)discardHistoryPreview(pendingRollback.preview_id);pendingRollback=null;if(rollbackPreview){rollbackPreview.hidden=true;rollbackPreview.textContent="";}if(rollbackApply)rollbackApply.hidden=true;}
  function clearPurge(){if(pendingPurge&&pendingPurge.preview_id)discardHistoryPreview(pendingPurge.preview_id);pendingPurge=null;if(purgePreview){purgePreview.hidden=true;purgePreview.textContent="";}if(purgeApply)purgeApply.hidden=true;}
  async function refresh(){
    clearRollback();clearPurge();
    if(!db)return;
    try{
      const verified=await verifiedCanonical(db);
      const candidates=await collectRollbackCandidates(db,verified.snapshot);
      if(select){
        select.textContent="";
        const empty=root.createElement("option");empty.value="";empty.textContent=candidates.length?"Rollback 대상 선택":"Rollback 가능한 최근 revision 없음";select.appendChild(empty);
        for(const item of candidates){const opt=root.createElement("option");opt.value=item.snapshot_id;opt.textContent=`rev ${item.revision} · ${item.memory_count} memories · ${item.created_at}`;select.appendChild(opt);}
        select.disabled=!candidates.length;
      }
      if(rollbackInspect)rollbackInspect.disabled=!candidates.length;
      if(purgeInspect)purgeInspect.disabled=false;
      setStatus(candidates.length?`동일 purge_epoch의 최근 ancestor ${candidates.length}개를 Rollback 후보로 확인했습니다. PURGE는 별도 Preview와 확인이 필요합니다.`:"Rollback 가능한 bounded ancestor는 없습니다. PURGE는 별도 Preview와 확인이 필요합니다.","ready");
    }catch(e){
      if(select){select.textContent="";select.disabled=true;}if(rollbackInspect)rollbackInspect.disabled=true;if(purgeInspect)purgeInspect.disabled=true;
      setStatus(humanError(e&&e.code),"error");
    }
  }
  try{db=await global.InooStorage.openDatabase();await refresh();}
  catch(e){setStatus("IndexedDB를 열 수 없어 Rollback/PURGE를 사용할 수 없습니다. 기존 Recovery UI는 별도로 유지됩니다.","error");return null;}

  if(rollbackInspect)rollbackInspect.addEventListener("click",async()=>{
    clearRollback();const target=select&&select.value;if(!target)return;
    rollbackInspect.disabled=true;
    try{pendingRollback=await prepareRollbackPreview(db,target);renderRollbackPreview(pendingRollback,rollbackPreview);if(rollbackApply){rollbackApply.hidden=false;rollbackApply.disabled=!pendingRollback.can_apply;}setStatus("Rollback Preview를 확인하세요. 아직 HEAD는 변경되지 않았습니다.","warn");}
    catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{rollbackInspect.disabled=!!(select&&select.disabled);}
  });
  if(rollbackApply)rollbackApply.addEventListener("click",async()=>{
    if(!pendingRollback)return;rollbackApply.disabled=true;
    try{const result=await commitRollbackPreview(db,pendingRollback.preview_id,{approved:true});setStatus(`Forward Rollback 완료: 과거 payload를 복사한 새 revision ${result.revision}이 생성되었습니다.`,"ready");pendingRollback=null;global.dispatchEvent(new CustomEvent("inoo:canonical-history-committed",{detail:{kind:"rollback",revision:result.revision}}));await refresh();}
    catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{if(!rollbackApply.hidden)rollbackApply.disabled=false;}
  });
  if(purgeInspect)purgeInspect.addEventListener("click",async()=>{
    clearPurge();purgeInspect.disabled=true;
    try{pendingPurge=await preparePurgePreview(db);renderPurgePreview(pendingPurge,purgePreview);if(purgeApply){purgeApply.hidden=false;purgeApply.disabled=!(purgeAck&&purgeAck.checked);}setStatus("PURGE Preview를 확인하고 옛 백업/오프라인 replica 한계를 확인해야 실행할 수 있습니다.","warn");}
    catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{purgeInspect.disabled=false;}
  });
  if(purgeAck)purgeAck.addEventListener("change",()=>{if(pendingPurge&&purgeApply)purgeApply.disabled=!purgeAck.checked;});
  if(purgeApply)purgeApply.addEventListener("click",async()=>{
    if(!pendingPurge)return;purgeApply.disabled=true;
    try{const result=await commitPurgePreview(db,pendingPurge.preview_id,{approved:true,oldBackupWarningAcknowledged:!!(purgeAck&&purgeAck.checked)});setStatus(`PURGE 완료: parent=null의 sanitized NEW ROOT revision ${result.revision}, purge_epoch ${result.purge_epoch}가 생성되었습니다.`,"ready");pendingPurge=null;if(purgeAck)purgeAck.checked=false;global.dispatchEvent(new CustomEvent("inoo:canonical-history-committed",{detail:{kind:"purge",revision:result.revision,purge_epoch:result.purge_epoch}}));await refresh();}
    catch(e){setStatus(humanError(e&&e.code),"error");}
    finally{if(!purgeApply.hidden)purgeApply.disabled=!(purgeAck&&purgeAck.checked);}
  });
  if(global.addEventListener){
    global.addEventListener("inoo:canonical-recovery-committed",()=>refresh().catch(()=>{}));
    global.addEventListener("inoo:canonical-transfer-committed",()=>refresh().catch(()=>{}));
    global.addEventListener("inoo:foundation-ready",()=>refresh().catch(()=>{}),{once:true});
  }
  return {db,refresh,getPendingRollback:()=>pendingRollback,getPendingPurge:()=>pendingPurge};
}

const api=Object.freeze({
  HISTORY_VERSION,ROLLBACK_OPERATION_TYPE,PURGE_OPERATION_TYPE,PURGE_POLICY_VERSION,MAX_ROLLBACK_CANDIDATES,HISTORY_FEATURE_DESCRIPTOR,OPERATION_PRIORITY,
  ensureHistoryFeature,operationPriority,compareOperationPriority,evaluateIncomingSnapshot,collectRollbackCandidates,
  prepareRollbackPreview,commitRollbackPreview,preparePurgePreview,commitPurgePreview,discardHistoryPreview,sanitizedRootPayload,initHistoryUI,
  _test:Object.freeze({compareHead,rollbackMetadata,purgeMetadata,verifiedCanonical,verifyHistorySnapshot})
});
global.InooCanonicalHistory=api;
if(global.document){
  if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",()=>{initHistoryUI().catch(()=>{});},{once:true});
  else initHistoryUI().catch(()=>{});
}
})(typeof window!=="undefined"?window:globalThis);
