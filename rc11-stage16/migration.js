(function(global){
"use strict";

const REPORT_VERSION="1.0.0";
const LEGACY_KEYS=Object.freeze({
  SETTINGS:"inoo_public_state_v0_7",
  FIRST_USE:"inoo_first_use_v0_4",
  FAVORITES:"inoo_favorites_v1",
  PREVIOUS:"inoo_previous_state_v1",
  CONTINUITY:"inoo_continuity_v1",
  CONTINUITY_HISTORY:"inoo_continuity_history_v1",
  CONTINUITY_SENSITIVE:"inoo_continuity_sensitive_v1"
});
const BASE_KEYS=Object.freeze([LEGACY_KEYS.SETTINGS,LEGACY_KEYS.FIRST_USE,LEGACY_KEYS.FAVORITES,LEGACY_KEYS.PREVIOUS]);
const RC10_KEYS=Object.freeze([LEGACY_KEYS.CONTINUITY,LEGACY_KEYS.CONTINUITY_HISTORY,LEGACY_KEYS.CONTINUITY_SENSITIVE]);
const ALL_KEYS=Object.freeze([...BASE_KEYS,...RC10_KEYS]);
const STAGE3_VERSION="1.0.0";
const MIGRATION_OPERATION_TYPE="legacy_migration_stage3";
const MIGRATION_USER_SCHEMA_VERSION="rc11-migration-envelope-1";
const previewRegistry=new Map();
const PREVIEW_REGISTRY_LIMIT=8;
const LEGACY_SENSITIVE_CONTENT=/(?:건강|질환|진단|병력|치료|약물|medical|diagnosis|health condition|인종|민족|race|ethnicity|종교|religion|정당|정치\s*(?:성향|이념|지지)|political\s*(?:ideology|affiliation|party)|노동조합|노조|trade union|성적\s*지향|성생활|sexual orientation|sex life|범죄\s*경력|전과|criminal history|생체\s*(?:정보|인식)|biometric)/i;

function legacyAutoCandidateNeedsSensitiveReview(content){
  return typeof content==="string"&&LEGACY_SENSITIVE_CONTENT.test(content);
}

function migrationError(code,details){
  const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;
}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function parseJSON(raw,label){
  if(raw===null)return {present:false,value:null,error:null};
  try{return {present:true,value:JSON.parse(raw),error:null};}
  catch(e){return {present:true,value:null,error:{code:"invalid_json",field:label,message:String(e&&e.message||e)}};}
}
function captureLegacyStorage(storage){
  if(!storage||typeof storage.getItem!=="function")throw migrationError("legacy_storage_reader_required");
  const present={};
  for(const key of ALL_KEYS){
    const value=storage.getItem(key);
    if(value!==null)present[key]=String(value);
  }
  return Object.freeze({present:Object.freeze(present),keys:Object.freeze(Object.keys(present).sort())});
}
function detectSource(capture){
  const keys=new Set(capture.keys);
  const hasRc10=RC10_KEYS.some(k=>keys.has(k));
  const hasBase=BASE_KEYS.some(k=>keys.has(k));
  if(hasRc10)return hasBase?"rc10":"rc10_partial";
  if(hasBase)return "rc9";
  return "none";
}
function sourceRef(field,state){
  const ref={source:"legacy_rc10",storage_key:LEGACY_KEYS.CONTINUITY,field};
  if(state&&Number.isInteger(state.revision))ref.legacy_revision=state.revision;
  if(state&&typeof state.updated_at==="string")ref.legacy_updated_at=state.updated_at;
  return ref;
}
function candidate(memoryType,provenance,content,field,state,subtype){
  const out={memory_type:memoryType,provenance,content:clone(content),status:"active",source_ref:sourceRef(field,state)};
  if(subtype)out.subtype=subtype;
  return out;
}
function mapContinuityDeterministic(state){
  const candidates=[];
  for(let i=0;i<state.open_loops.length;i++)candidates.push(candidate("open_loop","USER_CONTEXT_SUMMARY",state.open_loops[i],`open_loops[${i}]`,state));
  for(let i=0;i<state.goals.length;i++)candidates.push(candidate("goal","USER_CONTEXT_SUMMARY",state.goals[i],`goals[${i}]`,state));
  for(let i=0;i<state.communication_preferences.length;i++)candidates.push(candidate("user_preference","USER_CONTEXT_SUMMARY",state.communication_preferences[i],`communication_preferences[${i}]`,state));

  if(state.learning.level_ref)candidates.push(candidate("learning_state","USER_CONTEXT_SUMMARY",state.learning.level_ref,"learning.level_ref",state,"level_ref"));
  for(let i=0;i<state.learning.current_focus.length;i++)candidates.push(candidate("learning_state","USER_CONTEXT_SUMMARY",state.learning.current_focus[i],`learning.current_focus[${i}]`,state,"current_focus"));
  for(let i=0;i<state.learning.learned_expressions.length;i++)candidates.push(candidate("learning_state","USER_CONTEXT_SUMMARY",state.learning.learned_expressions[i],`learning.learned_expressions[${i}]`,state,"learned_expression"));
  for(let i=0;i<state.learning.recurring_patterns.length;i++)candidates.push(candidate("learning_state","USER_CONTEXT_SUMMARY",state.learning.recurring_patterns[i],`learning.recurring_patterns[${i}]`,state,"recurring_pattern"));

  if(state.relationship&&state.relationship.stage)candidates.push(candidate("relationship_state","USER_CONTEXT_SUMMARY",state.relationship.stage,"relationship.stage",state,"stage"));
  for(let i=0;i<state.relationship.fictional_shared.length;i++)candidates.push(candidate("fictional_shared_memory","FICTIONAL_SHARED",state.relationship.fictional_shared[i],`relationship.fictional_shared[${i}]`,state));
  return candidates;
}
function ambiguousReview(state){
  return {
    review_kind:"rc10_ambiguous_continuity_fields",
    source_ref:{source:"legacy_rc10",storage_key:LEGACY_KEYS.CONTINUITY,legacy_revision:state.revision,legacy_updated_at:state.updated_at},
    content:{
      summary:clone(state.summary),
      active_topics:clone(state.active_topics),
      recent_sessions:clone(state.recent_sessions),
      relationship_style_notes:clone(state.relationship.style_notes)
    },
    auto_persist:false,
    promotion_policy:"manual_review_only"
  };
}
function currentSourceArchiveMetadata(state){
  return {
    archive_kind:"rc10_current_continuity_source_pointer",
    source:"legacy_rc10",
    storage_key:LEGACY_KEYS.CONTINUITY,
    legacy_revision:state.revision,
    legacy_updated_at:state.updated_at,
    preserved_at_source:true,
    raw_copy_to_new_db:false,
    prompt_injection:false
  };
}
function parseControllerProjection(capture,logic,errors,warnings,archive){
  const out={settings:null,favorites:[],previous:null};
  const raw=capture.present;
  const settings=parseJSON(raw[LEGACY_KEYS.SETTINGS]??null,"settings");
  if(settings.error)errors.push(settings.error);
  else if(settings.present){
    try{
      const r=logic.safeImport(settings.value);out.settings=clone(r.active);
      if(Object.keys(r.quarantine).length){warnings.push({code:"settings_quarantine_preserved",fields:Object.keys(r.quarantine).sort()});archive.push({archive_kind:"legacy_controller_unknown_fields_pointer",source:"legacy_rc9_or_rc10",storage_key:LEGACY_KEYS.SETTINGS,fields:Object.keys(r.quarantine).sort(),preserved_at_source:true,raw_copy_to_new_db:false});}
    }catch(e){errors.push({code:"settings_invalid",message:String(e&&e.message||e)});archive.push({archive_kind:"legacy_controller_invalid_source_pointer",storage_key:LEGACY_KEYS.SETTINGS,preserved_at_source:true,raw_copy_to_new_db:false});}
  }

  const favorites=parseJSON(raw[LEGACY_KEYS.FAVORITES]??null,"favorites");
  if(favorites.error)errors.push(favorites.error);
  else if(favorites.present){
    if(!Array.isArray(favorites.value)){errors.push({code:"favorites_invalid_format"});archive.push({archive_kind:"legacy_controller_invalid_source_pointer",storage_key:LEGACY_KEYS.FAVORITES,preserved_at_source:true,raw_copy_to_new_db:false});}
    else{
      for(let i=0;i<favorites.value.length;i++){
        try{
          const src=favorites.value[i]&&favorites.value[i].settings?favorites.value[i].settings:favorites.value[i];
          const r=logic.safeImport(src);out.favorites.push(clone(r.active));
          if(Object.keys(r.quarantine).length)archive.push({archive_kind:"legacy_favorite_unknown_fields_pointer",source_index:i,fields:Object.keys(r.quarantine).sort(),preserved_at_source:true,raw_copy_to_new_db:false});
        }catch(e){warnings.push({code:"favorite_entry_preserved_not_migrated",index:i});archive.push({archive_kind:"legacy_favorite_invalid_entry_pointer",source_index:i,preserved_at_source:true,raw_copy_to_new_db:false});}
      }
    }
  }

  const previous=parseJSON(raw[LEGACY_KEYS.PREVIOUS]??null,"previous");
  if(previous.error)errors.push(previous.error);
  else if(previous.present){
    try{
      const r=logic.safeImport(previous.value);out.previous=clone(r.active);
      if(Object.keys(r.quarantine).length)archive.push({archive_kind:"legacy_previous_unknown_fields_pointer",fields:Object.keys(r.quarantine).sort(),preserved_at_source:true,raw_copy_to_new_db:false});
    }catch(e){warnings.push({code:"previous_preserved_not_migrated"});archive.push({archive_kind:"legacy_previous_invalid_source_pointer",storage_key:LEGACY_KEYS.PREVIOUS,preserved_at_source:true,raw_copy_to_new_db:false});}
  }

  return out;
}

async function dryRun(storage,{logic=global.InooWebLogic,storageApi=global.InooStorage}={}){
  if(!logic||typeof logic.safeImport!=="function"||typeof logic.validateContinuity!=="function")throw migrationError("legacy_logic_unavailable");
  if(!storageApi||typeof storageApi.sha256Hex!=="function")throw migrationError("storage_api_unavailable");
  const capture=captureLegacyStorage(storage);
  const detectedSource=detectSource(capture);
  const sourceFingerprint=await storageApi.sha256Hex(capture.present);
  const sourceItemHashes={};
  for(const key of capture.keys)sourceItemHashes[key]=await storageApi.sha256Hex(capture.present[key]);
  const errors=[],warnings=[],legacyArchive=[],legacyReviewItems=[];
  const controllerProjection=parseControllerProjection(capture,logic,errors,warnings,legacyArchive);
  const deviceProjection={first_use_seen:Object.prototype.hasOwnProperty.call(capture.present,LEGACY_KEYS.FIRST_USE)?capture.present[LEGACY_KEYS.FIRST_USE]==="1":null};
  const autoCandidates=[],sensitiveReviewCandidates=[];
  let continuitySummary={present:false,valid:false,revision:null,updated_at:null};
  const raw=capture.present;

  if(Object.prototype.hasOwnProperty.call(raw,LEGACY_KEYS.CONTINUITY)){
    const parsed=parseJSON(raw[LEGACY_KEYS.CONTINUITY],"continuity");
    continuitySummary.present=true;
    if(parsed.error){
      errors.push(parsed.error);
      legacyArchive.push({archive_kind:"rc10_invalid_continuity_source_pointer",source:"legacy_rc10",storage_key:LEGACY_KEYS.CONTINUITY,preserved_at_source:true,raw_copy_to_new_db:false,prompt_injection:false,promotion_policy:"none"});
    }else{
      const v=logic.validateContinuity(parsed.value,true);
      if(!v.ok||!v.state){
        errors.push({code:"continuity_invalid",details:clone(v.errors||[])});
        legacyArchive.push({archive_kind:"rc10_invalid_continuity_source_pointer",source:"legacy_rc10",storage_key:LEGACY_KEYS.CONTINUITY,preserved_at_source:true,raw_copy_to_new_db:false,prompt_injection:false,promotion_policy:"none"});
      }else{
        const state=v.state;continuitySummary={present:true,valid:true,revision:state.revision,updated_at:state.updated_at};
        legacyArchive.push(currentSourceArchiveMetadata(state));
        legacyReviewItems.push(ambiguousReview(state));
        for(const mapped of mapContinuityDeterministic(state)){
          if(legacyAutoCandidateNeedsSensitiveReview(mapped.content)){
            sensitiveReviewCandidates.push({...mapped,requires_explicit_opt_in:true,standard_backup_eligible:false,review_reason:"content_sensitive_classification"});
          }else autoCandidates.push(mapped);
        }
        for(let i=0;i<state.sensitive_context.length;i++){
          sensitiveReviewCandidates.push({memory_type:"sensitive_legacy_memory",provenance:"USER_CONTEXT_SUMMARY",content:state.sensitive_context[i],source_ref:sourceRef(`sensitive_context[${i}]`,state),requires_explicit_opt_in:true,standard_backup_eligible:false,review_reason:"legacy_sensitive_context"});
        }
      }
    }
  }

  if(Object.prototype.hasOwnProperty.call(raw,LEGACY_KEYS.CONTINUITY_HISTORY)){
    const parsed=parseJSON(raw[LEGACY_KEYS.CONTINUITY_HISTORY],"continuity_history");
    if(parsed.error){errors.push(parsed.error);legacyArchive.push({archive_kind:"rc10_history_source_pointer",source:"legacy_rc10",storage_key:LEGACY_KEYS.CONTINUITY_HISTORY,preserved_at_source:true,raw_copy_to_new_db:false,new_lineage:false});}
    else legacyArchive.push({archive_kind:"rc10_history_source_pointer",source:"legacy_rc10",storage_key:LEGACY_KEYS.CONTINUITY_HISTORY,legacy_entry_count:Array.isArray(parsed.value)?parsed.value.length:null,preserved_at_source:true,raw_copy_to_new_db:false,new_lineage:false,prompt_injection:false,promotion_policy:"manual_review_only"});
  }

  if(Object.prototype.hasOwnProperty.call(raw,LEGACY_KEYS.CONTINUITY_SENSITIVE)){
    legacyArchive.push({archive_kind:"rc10_sensitive_option",source:"legacy_rc10",content:{allow_sensitive:raw[LEGACY_KEYS.CONTINUITY_SENSITIVE]==="1"},promotion_policy:"preference_review_only"});
  }

  if(detectedSource==="rc9"&&autoCandidates.length)throw migrationError("rc9_user_memory_invariant_broken");

  return {
    report_version:REPORT_VERSION,
    mode:"dry_run_read_only",
    detected_source:detectedSource,
    source_fingerprint:sourceFingerprint,
    source_item_hashes:sourceItemHashes,
    source_keys:capture.keys.slice(),
    source_preservation:{strategy:"leave_legacy_in_place_read_only",raw_copy_to_new_db:false,delete_after_dry_run:false},
    controller_projection:controllerProjection,
    device_projection:deviceProjection,
    user_projection:{auto_candidates:autoCandidates,sensitive_review_candidates:sensitiveReviewCandidates},
    continuity_summary:continuitySummary,
    legacy_archive:legacyArchive,
    legacy_review_items:legacyReviewItems,
    warnings,
    errors,
    commit_allowed:false,
    source_mutation_allowed:false
  };
}


function publicPreviewSections(report){
  const controllerCount=(report.controller_projection.settings?1:0)+report.controller_projection.favorites.length+(report.controller_projection.previous?1:0);
  const memoryCount=report.user_projection.auto_candidates.length;
  const referenceOnlyCount=report.legacy_archive.length+report.legacy_review_items.length;
  const sensitiveCount=report.user_projection.sensitive_review_candidates.length;
  const deviceCount=report.device_projection.first_use_seen===null?0:1;
  const sections=[
    {kind:"auto_migrate",title:"자동으로 옮길 수 있는 항목",items:[
      controllerCount?`설정·프리셋 계열 ${controllerCount}개`:"설정·프리셋 계열 없음",
      memoryCount?`검증된 장기기억 후보 ${memoryCount}개`:"자동 이동할 장기기억 후보 없음"
    ]},
    {kind:"reference_only",title:"이전 버전 참고자료로만 보존할 항목",items:[referenceOnlyCount?`자동 승격하지 않는 참고 항목 ${referenceOnlyCount}개`:"참고자료 전용 항목 없음"]},
    {kind:"sensitive_opt_in",title:"민감/옵트인 항목",items:[sensitiveCount?`명시적 확인이 필요한 민감 항목 ${sensitiveCount}개 — 자동으로 옮기지 않음`:"민감 항목 없음"]},
    {kind:"device_state",title:"이 기기에만 남길 상태",items:[deviceCount?"기기 전용 상태 1개 — portable USER 데이터로 옮기지 않음":"이동 제외할 기기 전용 상태 없음"]}
  ];
  return sections;
}

function previewCanApply(report){
  return (report.detected_source==="rc9"||report.detected_source==="rc10")&&report.errors.length===0;
}

function trimPreviewRegistry(){
  while(previewRegistry.size>PREVIEW_REGISTRY_LIMIT){
    const first=previewRegistry.keys().next().value;
    previewRegistry.delete(first);
  }
}

async function deterministicOperationId(report,storageApi){
  const digest=await storageApi.sha256Hex({kind:MIGRATION_OPERATION_TYPE,stage3_version:STAGE3_VERSION,source_fingerprint:report.source_fingerprint});
  return "op_migration_"+digest;
}

async function prepareMigrationPreview(storage,{logic=global.InooWebLogic,storageApi=global.InooStorage}={}){
  if(!storageApi||typeof storageApi.newOperationId!=="function"||typeof storageApi.sha256Hex!=="function")throw migrationError("storage_api_unavailable");
  const report=await dryRun(storage,{logic,storageApi});
  const previewId="preview_"+storageApi.newOperationId().replace(/^op_/,"");
  const operationId=await deterministicOperationId(report,storageApi);
  previewRegistry.set(previewId,{report,operationId,logic,storageApi});
  trimPreviewRegistry();
  const notices=[];
  if(report.detected_source==="rc10_partial")notices.push("불완전한 rc10 저장소로 감지되어 자동 적용이 잠겨 있습니다.");
  if(report.errors.length)notices.push(`검증 오류 ${report.errors.length}건으로 적용이 잠겨 있습니다.`);
  if(report.warnings.length)notices.push(`확인이 필요한 경고 ${report.warnings.length}건이 있습니다.`);
  notices.push("기존 브라우저 저장소는 성공 후에도 삭제하지 않습니다.");
  return {
    preview_id:previewId,
    detected_source:report.detected_source,
    can_apply:previewCanApply(report),
    sections:publicPreviewSections(report),
    notices
  };
}

function assertSafeAutoCandidate(c){
  const allowedTypes=new Set(["open_loop","goal","user_preference","learning_state","relationship_state","fictional_shared_memory"]);
  if(!c||typeof c!=="object"||Array.isArray(c))throw migrationError("migration_candidate_invalid");
  if(!allowedTypes.has(c.memory_type))throw migrationError("migration_candidate_type_blocked",{memory_type:c.memory_type});
  if(typeof c.content!=="string"||!c.content.trim())throw migrationError("migration_candidate_content_invalid",{memory_type:c.memory_type});
  if(c.memory_type==="fictional_shared_memory"){
    if(c.provenance!=="FICTIONAL_SHARED")throw migrationError("migration_fictional_provenance_violation");
  }else if(c.provenance!=="USER_CONTEXT_SUMMARY")throw migrationError("migration_user_provenance_violation",{memory_type:c.memory_type});
  if(!c.source_ref||c.source_ref.source!=="legacy_rc10"||c.source_ref.storage_key!==LEGACY_KEYS.CONTINUITY||typeof c.source_ref.field!=="string")throw migrationError("migration_source_ref_invalid",{memory_type:c.memory_type});
  return c;
}

async function materializeMemoryRecords(report,storageApi){
  const records=[];
  for(const candidateValue of report.user_projection.auto_candidates){
    const c=assertSafeAutoCandidate(candidateValue);
    const idBasis={source_fingerprint:report.source_fingerprint,memory_type:c.memory_type,source_ref:c.source_ref};
    const memoryId="mem_"+(await storageApi.sha256Hex(idBasis)).slice(0,40);
    records.push({memory_id:memoryId,memory_type:c.memory_type,provenance:c.provenance,content:clone(c.content),status:c.status||"active",source_ref:clone(c.source_ref),...(c.subtype?{subtype:c.subtype}:{})});
  }
  return records;
}

function safeLegacyReferenceMetadata(report){
  const scalarKeys=new Set([
    "archive_kind","source","storage_key","source_index","preserved_at_source","raw_copy_to_new_db",
    "prompt_injection","promotion_policy","new_lineage","legacy_entry_count","legacy_revision","legacy_updated_at"
  ]);
  return report.legacy_archive.map(item=>{
    const out={};
    for(const key of scalarKeys){
      if(Object.prototype.hasOwnProperty.call(item,key))out[key]=clone(item[key]);
    }
    if(Array.isArray(item.fields))out.field_count=item.fields.length;
    if(item.archive_kind==="rc10_sensitive_option"&&item.content&&typeof item.content.allow_sensitive==="boolean")out.allow_sensitive=item.content.allow_sensitive;
    return out;
  });
}

async function buildMigrationEnvelope(report,storageApi){
  const memoryRecords=await materializeMemoryRecords(report,storageApi);
  return {
    envelope_version:STAGE3_VERSION,
    state_kind:"legacy_migration_bootstrap",
    detected_source:report.detected_source,
    source_fingerprint:report.source_fingerprint,
    controller_projection:clone(report.controller_projection),
    user_memory_records:memoryRecords,
    legacy_reference_metadata:safeLegacyReferenceMetadata(report),
    manual_review_summary:{count:report.legacy_review_items.length,content_persisted:false},
    sensitive_review_summary:{count:report.user_projection.sensitive_review_candidates.length,content_persisted:false,requires_explicit_opt_in:true},
    device_state_policy:{portable_migration:false,first_use_seen_present:report.device_projection.first_use_seen!==null},
    source_preservation:clone(report.source_preservation)
  };
}

async function buildMigrationCandidate(storage,{logic=global.InooWebLogic,storageApi=global.InooStorage}={}){
  if(!storageApi||typeof storageApi.sha256Hex!=="function")throw migrationError("storage_api_unavailable");
  const report=await dryRun(storage,{logic,storageApi});
  if(!previewCanApply(report))throw migrationError("migration_candidate_not_committable",{error_count:report.errors.length,detected_source:report.detected_source});
  const envelope=await buildMigrationEnvelope(report,storageApi);
  return {
    detected_source:report.detected_source,
    source_fingerprint:report.source_fingerprint,
    envelope,
    review_summary:{
      manual_review_count:report.legacy_review_items.length,
      sensitive_review_count:report.user_projection.sensitive_review_candidates.length,
      device_state_count:report.device_projection.first_use_seen===null?0:1
    }
  };
}

async function commitMigrationPreview(storage,db,previewId){
  const entry=previewRegistry.get(previewId);
  if(!entry)throw migrationError("migration_preview_missing_or_expired");
  const {report:previewReport,operationId,logic,storageApi}=entry;
  if(!previewCanApply(previewReport))throw migrationError("migration_preview_not_committable",{error_count:previewReport.errors.length,detected_source:previewReport.detected_source});

  // Re-read and re-fingerprint immediately before duplicate reconciliation or commit.
  // An old preview must become stale if the legacy source changed, even if that old source
  // had already been migrated in an earlier operation.
  const fresh=await dryRun(storage,{logic,storageApi});
  if(fresh.source_fingerprint!==previewReport.source_fingerprint)throw migrationError("stale_migration",{reason:"legacy_source_changed_since_preview"});
  if(!previewCanApply(fresh))throw migrationError("migration_revalidation_failed",{error_count:fresh.errors.length,detected_source:fresh.detected_source});

  // A matching receipt is authoritative for idempotent retry after source revalidation.
  const prior=await storageApi.inspectOperation(db,operationId);
  if(prior.receipt){
    return {status:"SUCCESS",outcome:"already_migrated",operation_id:operationId,receipt:prior.receipt};
  }

  // Stage 3 deliberately refuses to replace a pre-existing canonical USER HEAD.
  // Merge/change-set handling belongs to a later gate.
  const existingHead=await storageApi.readHead(db);
  if(existingHead)throw migrationError("migration_existing_head_requires_merge",{revision:existingHead.revision});

  const payload=await buildMigrationEnvelope(fresh,storageApi);
  let committed;
  try{
    committed=await storageApi.commitSnapshot(db,{
      operationId,
      userSchemaVersion:MIGRATION_USER_SCHEMA_VERSION,
      operationType:MIGRATION_OPERATION_TYPE,
      purgeEpoch:0,
      payload,
      expectedHeadSnapshotId:null,
      expectedHeadHash:null
    });
  }catch(e){
    // Reconcile before calling a commit failure definitive.
    try{
      const inspected=await storageApi.inspectOperation(db,operationId);
      if(inspected.receipt)return {status:"COMMIT_UNKNOWN",outcome:"receipt_found_after_commit_exception",operation_id:operationId,receipt:inspected.receipt,error_code:e&&e.code||null};
    }catch(reconcileError){
      throw migrationError("migration_commit_unknown",{commit_error:e&&e.code||String(e),reconcile_error:reconcileError&&reconcileError.code||String(reconcileError)});
    }
    throw migrationError("migration_commit_failed",{cause:e&&e.code||String(e)});
  }

  let verified;
  try{verified=await storageApi.verifyHead(db)}catch(e){
    return {status:"COMMIT_UNKNOWN",outcome:"readback_unavailable",operation_id:operationId,receipt:committed.receipt||null,error_code:e&&e.code||null};
  }
  if(!verified||!verified.ok||!verified.snapshot||verified.snapshot.operation_id!==operationId||verified.snapshot.operation_type!==MIGRATION_OPERATION_TYPE||verified.snapshot.payload.source_fingerprint!==fresh.source_fingerprint){
    return {status:"COMMIT_UNKNOWN",outcome:"readback_mismatch",operation_id:operationId,receipt:committed.receipt||null,verify_code:verified&&verified.code||null};
  }

  // localStorage and IndexedDB cannot share one atomic transaction. A legacy writer in another
  // tab could change the source after the pre-commit capture. Re-check after the verified commit
  // so that divergence is surfaced instead of silently treated as fully migrated.
  let postcheck;
  try{postcheck=await dryRun(storage,{logic,storageApi})}catch(e){
    previewRegistry.delete(previewId);
    return {status:"SUCCESS",outcome:"committed_source_postcheck_unknown",operation_id:operationId,receipt:committed.receipt||null,revision:verified.head.revision,requires_source_review:true,source_postcheck_error:e&&e.code||null};
  }
  previewRegistry.delete(previewId);
  if(postcheck.source_fingerprint!==fresh.source_fingerprint){
    return {status:"SUCCESS",outcome:"committed_source_changed_after_capture",operation_id:operationId,receipt:committed.receipt||null,revision:verified.head.revision,requires_merge:true};
  }
  return {status:"SUCCESS",outcome:committed.status==="already_committed"?"already_migrated":"committed",operation_id:operationId,receipt:committed.receipt||null,revision:verified.head.revision};
}

function discardMigrationPreview(previewId){return previewRegistry.delete(previewId);}

const api=Object.freeze({
  REPORT_VERSION,STAGE3_VERSION,MIGRATION_OPERATION_TYPE,MIGRATION_USER_SCHEMA_VERSION,
  LEGACY_KEYS,ALL_KEYS,captureLegacyStorage,detectSource,dryRun,buildMigrationCandidate,
  prepareMigrationPreview,commitMigrationPreview,discardMigrationPreview,
  _test:{mapContinuityDeterministic,ambiguousReview,publicPreviewSections,previewCanApply,buildMigrationEnvelope,assertSafeAutoCandidate,deterministicOperationId,safeLegacyReferenceMetadata,legacyAutoCandidateNeedsSensitiveReview}
});
global.InooMigration=api;
})(typeof window!=="undefined"?window:globalThis);
