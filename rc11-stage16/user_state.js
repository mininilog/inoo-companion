(function(global){
"use strict";

const USER_SCHEMA_VERSION="rc11-user-state-1";
const CHANGESET_VERSION="rc11-user-changeset-1";
const ACTIVATION_OPERATION_TYPE="user_state_activation";
const CHANGESET_OPERATION_TYPE="user_memory_change_set";
const MIGRATION_BOOTSTRAP_KIND="legacy_migration_bootstrap";
const CANONICAL_STATE_KIND="canonical_user_state";
const previewRegistry=new Map();
const PREVIEW_REGISTRY_LIMIT=8;

const MEMORY_TYPES=new Set(["open_loop","goal","user_preference","learning_state","relationship_state","fictional_shared_memory","saved_memory"]);
const PROVENANCE_TYPES=new Set(["USER_EXPLICIT","USER_CONTEXT_SUMMARY","FICTIONAL_SHARED"]);
const STATUS_TYPES=new Set(["active","resolved","superseded"]);
const SENSITIVITY_TYPES=new Set(["normal","sensitive"]);
const ACTIONS=new Set(["ADD","UPDATE","RESOLVE","SUPERSEDE"]);
const INSTRUCTION_LIKE=/(ignore\s+(all|previous|above)|system\s+prompt|developer\s+message|assistant\s+(must|should)|follow\s+these\s+instructions|begin\s+(system|developer)|이전\s*(지시|명령).*무시|위\s*(지시|명령).*무시|시스템\s*프롬프트|개발자\s*메시지|지시를\s*따라|これまでの指示.*無視|以前の指示.*無視|システムプロンプト|開発者メッセージ|<script|javascript:|data:text\/html|eval\s*\(|new\s+function)/i;

function userStateError(code,details){
  const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;
}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function exactKeys(obj,allowed,code){
  if(!isObject(obj))throw userStateError(code||"object_required");
  for(const k of Object.keys(obj))if(!allowed.has(k))throw userStateError(code||"unknown_field",{field:k});
}
function trimRegistry(){while(previewRegistry.size>PREVIEW_REGISTRY_LIMIT)previewRegistry.delete(previewRegistry.keys().next().value)}
function validId(v,prefix){return typeof v==="string"&&v.startsWith(prefix)&&v.length>prefix.length}
function safeText(v){return typeof v==="string"&&v.trim().length>0}
function luhnCandidate(text){
  const groups=String(text).match(/(?:\d[ -]?){13,19}/g)||[];
  for(const raw of groups){
    const digits=raw.replace(/\D/g,"");
    if(digits.length<13||digits.length>19||/^0+$/.test(digits))continue;
    let sum=0,alt=false;
    for(let i=digits.length-1;i>=0;i--){let n=Number(digits[i]);if(alt){n*=2;if(n>9)n-=9}sum+=n;alt=!alt}
    if(sum%10===0)return true;
  }
  return false;
}
function hardSecurityClass(content,declared="normal"){
  const s=String(content||"");
  if(!SENSITIVITY_TYPES.has(declared))throw userStateError("memory_sensitivity_invalid");
  const neverPatterns=[
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\bAIza[0-9A-Za-z_-]{20,}\b/,
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
    /(?:password|passwd|비밀번호|패스워드|access[_ -]?token|api[_ -]?key|secret)\s*[:=]\s*\S{6,}/i,
    /\b\d{6}-[1-8]\d{6}\b/,
    /(?:집\s*주소|home\s*address|exact\s*address)\s*[:=]\s*\S.+/i
  ];
  if(INSTRUCTION_LIKE.test(s))return "instruction_like";
  if(neverPatterns.some(r=>r.test(s))||luhnCandidate(s))return "never_store";
  const sensitivePatterns=[
    /(?:계좌|account)\s*(?:번호|number)?\s*[:=]\s*[0-9-]{6,}/i,
    /(?:건강|질환|진단|병력|치료|약물|medical|diagnosis|health condition)/i,
    /(?:인종|민족|race|ethnicity)/i,
    /(?:종교|religion)/i,
    /(?:정당|정치\s*(?:성향|이념|지지)|political\s*(?:ideology|affiliation|party))/i,
    /(?:노동조합|노조|trade union)/i,
    /(?:성적\s*지향|성생활|sexual orientation|sex life)/i,
    /(?:범죄\s*경력|전과|criminal history)/i,
    /(?:생체\s*(?:정보|인식)|biometric)/i
  ];
  if(declared==="sensitive"||sensitivePatterns.some(r=>r.test(s)))return "sensitive";
  return "normal";
}
function assertMemoryBoundary(type,provenance){
  if(!MEMORY_TYPES.has(type))throw userStateError("memory_type_invalid",{memory_type:type});
  if(!PROVENANCE_TYPES.has(provenance))throw userStateError("memory_provenance_invalid",{provenance});
  if(type==="fictional_shared_memory"&&provenance!=="FICTIONAL_SHARED")throw userStateError("fictional_memory_provenance_violation");
  if(type!=="fictional_shared_memory"&&provenance==="FICTIONAL_SHARED")throw userStateError("fictional_provenance_type_violation");
}
function assertMemoryRecord(record){
  exactKeys(record,new Set(["memory_id","memory_type","provenance","content","status","memory_revision","sensitivity","source_ref","subtype","superseded_by_memory_id","supersedes_memory_id"]),"memory_record_unknown_field");
  if(!validId(record.memory_id,"mem_"))throw userStateError("memory_id_invalid");
  assertMemoryBoundary(record.memory_type,record.provenance);
  if(!safeText(record.content))throw userStateError("memory_content_invalid",{memory_id:record.memory_id});
  if(!STATUS_TYPES.has(record.status))throw userStateError("memory_status_invalid",{memory_id:record.memory_id});
  if(!Number.isInteger(record.memory_revision)||record.memory_revision<1)throw userStateError("memory_revision_invalid",{memory_id:record.memory_id});
  if(!SENSITIVITY_TYPES.has(record.sensitivity))throw userStateError("memory_sensitivity_invalid",{memory_id:record.memory_id});
  const sec=hardSecurityClass(record.content,record.sensitivity);
  if(sec==="instruction_like")throw userStateError("memory_instruction_like_blocked",{memory_id:record.memory_id});
  if(sec==="never_store")throw userStateError("never_store_content_blocked",{memory_id:record.memory_id});
  if(record.source_ref!==undefined&&!isObject(record.source_ref))throw userStateError("memory_source_ref_invalid",{memory_id:record.memory_id});
  if(record.subtype!==undefined&&!safeText(record.subtype))throw userStateError("memory_subtype_invalid",{memory_id:record.memory_id});
  if(record.superseded_by_memory_id!==undefined&&!validId(record.superseded_by_memory_id,"mem_"))throw userStateError("memory_superseded_by_invalid");
  if(record.supersedes_memory_id!==undefined&&!validId(record.supersedes_memory_id,"mem_"))throw userStateError("memory_supersedes_invalid");
  if(record.status==="superseded"&&!record.superseded_by_memory_id)throw userStateError("superseded_link_required",{memory_id:record.memory_id});
  if(record.status!=="superseded"&&record.superseded_by_memory_id!==undefined)throw userStateError("superseded_link_status_mismatch",{memory_id:record.memory_id});
  return sec;
}
function assertCanonicalPayload(payload){
  exactKeys(payload,new Set(["schema_version","state_kind","controller_projection","memory_records","migration_state"]),"canonical_state_unknown_field");
  if(payload.schema_version!==USER_SCHEMA_VERSION||payload.state_kind!==CANONICAL_STATE_KIND)throw userStateError("canonical_state_version_invalid");
  if(!isObject(payload.controller_projection))throw userStateError("controller_projection_invalid");
  if(!Array.isArray(payload.memory_records))throw userStateError("memory_records_invalid");
  if(payload.migration_state!==null&&!isObject(payload.migration_state))throw userStateError("migration_state_invalid");
  const ids=new Set(),byId=new Map();
  for(const record of payload.memory_records){
    assertMemoryRecord(record);
    if(ids.has(record.memory_id))throw userStateError("memory_id_duplicate",{memory_id:record.memory_id});
    ids.add(record.memory_id);byId.set(record.memory_id,record);
  }
  for(const record of payload.memory_records){
    if(record.superseded_by_memory_id&&!byId.has(record.superseded_by_memory_id))throw userStateError("superseded_target_missing",{memory_id:record.memory_id});
    if(record.supersedes_memory_id&&!byId.has(record.supersedes_memory_id))throw userStateError("supersedes_source_missing",{memory_id:record.memory_id});
    if(record.superseded_by_memory_id){
      const replacement=byId.get(record.superseded_by_memory_id);
      if(replacement.supersedes_memory_id!==record.memory_id)throw userStateError("supersede_link_not_bidirectional",{memory_id:record.memory_id});
    }
  }
  return payload;
}
function assertMigrationEnvelope(payload){
  if(!isObject(payload)||payload.state_kind!==MIGRATION_BOOTSTRAP_KIND)throw userStateError("migration_bootstrap_required");
  if(!Array.isArray(payload.user_memory_records)||!isObject(payload.controller_projection))throw userStateError("migration_bootstrap_invalid");
  for(const r of payload.user_memory_records){
    if(!isObject(r)||!validId(r.memory_id,"mem_")||!safeText(r.content)||r.status!=="active")throw userStateError("migration_memory_invalid");
    assertMemoryBoundary(r.memory_type,r.provenance);
    const sec=hardSecurityClass(r.content,"normal");
    if(sec==="instruction_like")throw userStateError("memory_instruction_like_blocked");
    if(sec==="never_store")throw userStateError("never_store_content_blocked");
  }
  return payload;
}
function migrationToCanonical(payload){
  assertMigrationEnvelope(payload);
  const memoryRecords=payload.user_memory_records.map(r=>({
    memory_id:r.memory_id,memory_type:r.memory_type,provenance:r.provenance,content:clone(r.content),status:"active",memory_revision:1,sensitivity:"normal",
    ...(r.source_ref?{source_ref:clone(r.source_ref)}:{}),...(r.subtype?{subtype:r.subtype}:{})
  }));
  const migrationState={
    activated_from:MIGRATION_BOOTSTRAP_KIND,
    detected_source:payload.detected_source,
    source_fingerprint:payload.source_fingerprint,
    legacy_reference_metadata:clone(payload.legacy_reference_metadata||[]),
    manual_review_summary:clone(payload.manual_review_summary||{count:0,content_persisted:false}),
    sensitive_review_summary:clone(payload.sensitive_review_summary||{count:0,content_persisted:false,requires_explicit_opt_in:true}),
    device_state_policy:clone(payload.device_state_policy||{portable_migration:false}),
    source_preservation:clone(payload.source_preservation||{})
  };
  const out={schema_version:USER_SCHEMA_VERSION,state_kind:CANONICAL_STATE_KIND,controller_projection:clone(payload.controller_projection),memory_records:memoryRecords,migration_state:migrationState};
  return assertCanonicalPayload(out);
}
function assertProposal(proposal){
  exactKeys(proposal,new Set(["proposal_version","base_snapshot_id","base_snapshot_hash","changes"]),"changeset_unknown_field");
  if(proposal.proposal_version!==CHANGESET_VERSION)throw userStateError("changeset_version_invalid");
  if(!validId(proposal.base_snapshot_id,"snap_")||typeof proposal.base_snapshot_hash!=="string"||!proposal.base_snapshot_hash)throw userStateError("changeset_base_invalid");
  if(!Array.isArray(proposal.changes)||proposal.changes.length<1||proposal.changes.length>100)throw userStateError("changeset_changes_invalid");
  const targets=new Set();
  for(const change of proposal.changes){
    if(!isObject(change)||!ACTIONS.has(change.action))throw userStateError("changeset_action_invalid");
    if(change.action==="ADD"){
      exactKeys(change,new Set(["action","memory_type","provenance","content","subtype","sensitivity"]),"changeset_add_unknown_field");
      assertMemoryBoundary(change.memory_type,change.provenance);if(!safeText(change.content))throw userStateError("memory_content_invalid");
      if(change.subtype!==undefined&&!safeText(change.subtype))throw userStateError("memory_subtype_invalid");
      hardSecurityClass(change.content,change.sensitivity||"normal");
    }else if(change.action==="UPDATE"){
      exactKeys(change,new Set(["action","memory_id","content","sensitivity"]),"changeset_update_unknown_field");
      if(!validId(change.memory_id,"mem_")||!safeText(change.content))throw userStateError("changeset_update_invalid");
      hardSecurityClass(change.content,change.sensitivity||"normal");
      if(targets.has(change.memory_id))throw userStateError("changeset_duplicate_target",{memory_id:change.memory_id});targets.add(change.memory_id);
    }else if(change.action==="RESOLVE"){
      exactKeys(change,new Set(["action","memory_id"]),"changeset_resolve_unknown_field");
      if(!validId(change.memory_id,"mem_"))throw userStateError("changeset_resolve_invalid");
      if(targets.has(change.memory_id))throw userStateError("changeset_duplicate_target",{memory_id:change.memory_id});targets.add(change.memory_id);
    }else{
      exactKeys(change,new Set(["action","memory_id","replacement"]),"changeset_supersede_unknown_field");
      if(!validId(change.memory_id,"mem_")||!isObject(change.replacement))throw userStateError("changeset_supersede_invalid");
      exactKeys(change.replacement,new Set(["memory_type","provenance","content","subtype","sensitivity"]),"changeset_replacement_unknown_field");
      assertMemoryBoundary(change.replacement.memory_type,change.replacement.provenance);if(!safeText(change.replacement.content))throw userStateError("memory_content_invalid");
      if(change.replacement.subtype!==undefined&&!safeText(change.replacement.subtype))throw userStateError("memory_subtype_invalid");
      hardSecurityClass(change.replacement.content,change.replacement.sensitivity||"normal");
      if(targets.has(change.memory_id))throw userStateError("changeset_duplicate_target",{memory_id:change.memory_id});targets.add(change.memory_id);
    }
  }
  return proposal;
}
function securityForNew(content,declared,currentSensitivity){
  const sec=hardSecurityClass(content,declared||"normal");
  if(sec==="instruction_like")throw userStateError("memory_instruction_like_blocked");
  if(sec==="never_store")throw userStateError("never_store_content_blocked");
  if(currentSensitivity==="sensitive")return "sensitive";
  return sec;
}
function applyProposal(payload,proposal,newIds){
  assertCanonicalPayload(payload);assertProposal(proposal);
  const out=clone(payload),byId=new Map(out.memory_records.map((r,i)=>[r.memory_id,i]));
  let idCursor=0,requiresSensitive=false;
  const review=[];
  for(const change of proposal.changes){
    if(change.action==="ADD"){
      const id=newIds[idCursor++];if(!validId(id,"mem_"))throw userStateError("controller_memory_id_invalid");
      const sensitivity=securityForNew(change.content,change.sensitivity||"normal",null);if(sensitivity==="sensitive")requiresSensitive=true;
      const r={memory_id:id,memory_type:change.memory_type,provenance:change.provenance,content:change.content,status:"active",memory_revision:1,sensitivity,...(change.subtype?{subtype:change.subtype}:{})};
      assertMemoryRecord(r);out.memory_records.push(r);byId.set(id,out.memory_records.length-1);review.push({action:"ADD",memory_type:r.memory_type,sensitivity,before:null,after:r.content});
    }else{
      const idx=byId.get(change.memory_id);if(idx===undefined)throw userStateError("changeset_target_missing",{memory_id:change.memory_id});
      const current=out.memory_records[idx];if(current.status!=="active")throw userStateError("changeset_target_not_active",{memory_id:change.memory_id,status:current.status});
      if(change.action==="UPDATE"){
        const before=current.content,sensitivity=securityForNew(change.content,change.sensitivity||"normal",current.sensitivity);if(sensitivity==="sensitive")requiresSensitive=true;
        current.content=change.content;current.sensitivity=sensitivity;current.memory_revision+=1;assertMemoryRecord(current);review.push({action:"UPDATE",memory_type:current.memory_type,sensitivity,before,after:current.content});
      }else if(change.action==="RESOLVE"){
        const before=current.content;current.status="resolved";current.memory_revision+=1;assertMemoryRecord(current);review.push({action:"RESOLVE",memory_type:current.memory_type,sensitivity:current.sensitivity,before,after:null});
      }else{
        const id=newIds[idCursor++];if(!validId(id,"mem_"))throw userStateError("controller_memory_id_invalid");
        const rep=change.replacement,sensitivity=securityForNew(rep.content,rep.sensitivity||"normal",null);if(sensitivity==="sensitive")requiresSensitive=true;
        current.status="superseded";current.memory_revision+=1;current.superseded_by_memory_id=id;
        const replacement={memory_id:id,memory_type:rep.memory_type,provenance:rep.provenance,content:rep.content,status:"active",memory_revision:1,sensitivity,supersedes_memory_id:current.memory_id,...(rep.subtype?{subtype:rep.subtype}:{})};
        assertMemoryRecord(replacement);assertMemoryRecord(current);out.memory_records.push(replacement);byId.set(id,out.memory_records.length-1);review.push({action:"SUPERSEDE",memory_type:replacement.memory_type,sensitivity,before:current.content,after:replacement.content});
      }
    }
  }
  assertCanonicalPayload(out);
  return {payload:out,requiresSensitive,review};
}
function countNewIds(proposal){return proposal.changes.reduce((n,c)=>n+(c.action==="ADD"||c.action==="SUPERSEDE"?1:0),0)}
async function idsForOperation(operationId,count,storageApi){
  const out=[];for(let i=0;i<count;i++)out.push("mem_"+(await storageApi.sha256Hex({controller_operation_id:operationId,ordinal:i})).slice(0,40));return out;
}
function humanReviewItems(review,sensitiveOptIn){return review.map(x=>{const redacted=x.sensitivity==="sensitive"&&sensitiveOptIn!==true;return {action:x.action,memory_type:x.memory_type,display:redacted?"민감 항목 — 별도 옵트인 후 내용 확인":"USER 기억 변경",before:redacted?null:x.before,after:redacted?null:x.after,content_redacted:redacted};})}
async function verifiedCurrent(storageApi,db){
  const v=await storageApi.verifyHead(db);if(!v||!v.ok)throw userStateError("user_state_recovery_required",{verify_code:v&&v.code||null});if(!v.head||!v.snapshot)throw userStateError("user_state_head_missing");return v;
}
async function prepareActivationPreview(db,{storageApi=global.InooStorage}={}){
  if(!storageApi)throw userStateError("storage_api_unavailable");const v=await verifiedCurrent(storageApi,db);
  if(v.snapshot.payload&&v.snapshot.payload.state_kind===CANONICAL_STATE_KIND){assertCanonicalPayload(v.snapshot.payload);return {already_active:true,can_apply:false,revision:v.head.revision,notices:["이미 rc11 USER state 스키마가 활성화되어 있습니다."]};}
  const next=migrationToCanonical(v.snapshot.payload);const operationId=storageApi.newOperationId(),previewId="user_preview_"+operationId.slice(3);
  previewRegistry.set(previewId,{kind:"activation",operationId,baseHead:clone(v.head),payload:next});trimRegistry();
  return {preview_id:previewId,already_active:false,can_apply:true,revision:v.head.revision,sections:[{title:"USER 기억 활성화",items:[`검증된 기존 기억 ${next.memory_records.length}개를 내용 변경 없이 새 canonical schema로 활성화`,`컨트롤러 설정은 그대로 유지`,`legacy 원본 저장소는 삭제하지 않음`]}]};
}
async function prepareChangeSetPreview(db,proposal,{storageApi=global.InooStorage,privateSession=false,sensitiveOptIn=false}={}){
  if(privateSession)throw userStateError("private_session_long_memory_forbidden");if(!storageApi)throw userStateError("storage_api_unavailable");
  assertProposal(proposal);const v=await verifiedCurrent(storageApi,db);assertCanonicalPayload(v.snapshot.payload);
  if(proposal.base_snapshot_id!==v.head.snapshot_id||proposal.base_snapshot_hash!==v.head.snapshot_hash)throw userStateError("stale_candidate",{reason:"proposal_base_not_current_head"});
  const operationId=storageApi.newOperationId(),newIds=await idsForOperation(operationId,countNewIds(proposal),storageApi);const applied=applyProposal(v.snapshot.payload,proposal,newIds);
  const previewId="user_preview_"+operationId.slice(3);previewRegistry.set(previewId,{kind:"changeset",operationId,baseHead:clone(v.head),payload:applied.payload,requiresSensitive:applied.requiresSensitive});trimRegistry();
  return {preview_id:previewId,can_apply:!applied.requiresSensitive||sensitiveOptIn,requires_sensitive_opt_in:applied.requiresSensitive,revision:v.head.revision,sections:[{title:"USER 기억 변경 제안",items:humanReviewItems(applied.review,sensitiveOptIn)}],notices:["AI 제안만으로는 저장되지 않으며 사용자 승인 후에만 적용됩니다.",...(applied.requiresSensitive&&!sensitiveOptIn?["민감 항목 옵트인이 꺼져 있어 적용이 잠겨 있습니다."]:[])]};
}
async function commitPrepared(db,entry,{storageApi,approved,sensitiveOptIn}){
  if(approved!==true)throw userStateError("human_approval_required");if(entry.requiresSensitive&&sensitiveOptIn!==true)throw userStateError("sensitive_opt_in_required");
  const v=await verifiedCurrent(storageApi,db);if(v.head.snapshot_id!==entry.baseHead.snapshot_id||v.head.snapshot_hash!==entry.baseHead.snapshot_hash)throw userStateError("stale_candidate",{reason:"head_changed_since_preview"});
  const operationType=entry.kind==="activation"?ACTIVATION_OPERATION_TYPE:CHANGESET_OPERATION_TYPE;
  let committed;
  try{
    committed=await storageApi.commitSnapshot(db,{operationId:entry.operationId,userSchemaVersion:USER_SCHEMA_VERSION,operationType,purgeEpoch:v.head.purge_epoch,payload:entry.payload,expectedHeadSnapshotId:entry.baseHead.snapshot_id,expectedHeadHash:entry.baseHead.snapshot_hash});
  }catch(e){
    try{const inspected=await storageApi.inspectOperation(db,entry.operationId);if(inspected.receipt)return {status:"COMMIT_UNKNOWN",outcome:"receipt_found_after_commit_exception",operation_id:entry.operationId,receipt:inspected.receipt,error_code:e&&e.code||null};}
    catch(reconcileError){throw userStateError("user_state_commit_unknown",{commit_error:e&&e.code||String(e),reconcile_error:reconcileError&&reconcileError.code||String(reconcileError)});}
    throw userStateError("user_state_commit_failed",{cause:e&&e.code||String(e)});
  }
  let verified;try{verified=await storageApi.verifyHead(db)}catch(e){return {status:"COMMIT_UNKNOWN",outcome:"readback_unavailable",operation_id:entry.operationId,receipt:committed.receipt||null,error_code:e&&e.code||null};}
  if(!verified||!verified.ok||!verified.snapshot||verified.snapshot.operation_id!==entry.operationId||verified.snapshot.user_schema_version!==USER_SCHEMA_VERSION){return {status:"COMMIT_UNKNOWN",outcome:"readback_mismatch",operation_id:entry.operationId,receipt:committed.receipt||null,verify_code:verified&&verified.code||null};}
  assertCanonicalPayload(verified.snapshot.payload);return {status:"SUCCESS",outcome:committed.status==="already_committed"?"already_committed":"committed",operation_id:entry.operationId,receipt:committed.receipt||null,revision:verified.head.revision};
}
async function commitActivationPreview(db,previewId,{storageApi=global.InooStorage,approved=false}={}){
  const entry=previewRegistry.get(previewId);if(!entry||entry.kind!=="activation")throw userStateError("activation_preview_missing_or_expired");const r=await commitPrepared(db,entry,{storageApi,approved,sensitiveOptIn:false});if(r.status==="SUCCESS")previewRegistry.delete(previewId);return r;
}
async function commitChangeSetPreview(db,previewId,{storageApi=global.InooStorage,approved=false,sensitiveOptIn=false,privateSession=false}={}){
  if(privateSession)throw userStateError("private_session_long_memory_forbidden");const entry=previewRegistry.get(previewId);if(!entry||entry.kind!=="changeset")throw userStateError("changeset_preview_missing_or_expired");const r=await commitPrepared(db,entry,{storageApi,approved,sensitiveOptIn});if(r.status==="SUCCESS")previewRegistry.delete(previewId);return r;
}
function discardPreview(previewId){return previewRegistry.delete(previewId)}

const api=Object.freeze({
  USER_SCHEMA_VERSION,CHANGESET_VERSION,ACTIVATION_OPERATION_TYPE,CHANGESET_OPERATION_TYPE,CANONICAL_STATE_KIND,
  prepareActivationPreview,commitActivationPreview,prepareChangeSetPreview,commitChangeSetPreview,discardPreview,
  validateCanonicalState:assertCanonicalPayload,validateMigrationEnvelope:assertMigrationEnvelope,
  _test:{hardSecurityClass,migrationToCanonical,assertProposal,applyProposal,assertMemoryRecord,assertCanonicalPayload,idsForOperation,countNewIds}
});
global.InooUserState=api;
})(typeof window!=="undefined"?window:globalThis);
