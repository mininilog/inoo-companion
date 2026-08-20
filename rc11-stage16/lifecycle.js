(function(global){
"use strict";

const FEATURE_ID="lifecycle_memory_maintenance";
const FEATURE_SCHEMA_VERSION="1";
const STATE_NAMESPACE="lifecycle.memory_maintenance";
const STATE_KEY="primary";
const ROW_KEY=STATE_NAMESPACE+":"+STATE_KEY;
const MEMORY_INTERVAL_DAYS=7;
const NEW_CHAT_SUCCESS_CADENCE=4;
const BACKUP_INTERVAL_DAYS=30;
const CLOCK_DRIFT_TOLERANCE_MS=120000;

function lifecycleError(code,details){const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function clone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function validIso(v){return typeof v==="string"&&Number.isFinite(Date.parse(v));}
function iso(ms){return new Date(ms).toISOString();}
function addDays(isoText,days){return iso(Date.parse(isoText)+days*86400000);}
function elapsedDays(fromIso,nowIso){if(!validIso(fromIso)||!validIso(nowIso))return null;return Math.max(0,Math.floor((Date.parse(nowIso)-Date.parse(fromIso))/86400000));}
function requestResult(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||lifecycleError("lifecycle_idb_request_failed"));});}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||lifecycleError("lifecycle_transaction_aborted"));tx.onerror=()=>{};});}

function descriptor(){return Object.freeze({
  feature_id:FEATURE_ID,
  feature_schema_version:FEATURE_SCHEMA_VERSION,
  read_capabilities:["lifecycle:read"],
  write_capabilities:["lifecycle:write"],
  migration_owner:"lifecycle",
  state_namespace:STATE_NAMESPACE
});}
function ensureRegistered(foundation=global.InooIntegrityFoundation){
  if(!foundation||!foundation.defaultRegistry)return;
  try{foundation.defaultRegistry.getFeature(FEATURE_ID);}
  catch(_){foundation.defaultRegistry.registerFeature(descriptor());}
}

function defaultValue(nowIso,timezoneOffsetMinutes){return {
  policy_version:"1",
  first_seen_at:nowIso,
  last_memory_save_at:null,
  memory_save_success_count:0,
  successful_saves_since_new_chat:0,
  new_chat_recommended_at:null,
  new_chat_acknowledged_at:null,
  memory_update_postponed_at:null,
  last_backup_generated_at:null,
  last_backup_verified_at:null,
  last_observed_at:nowIso,
  last_timezone_offset_minutes:Number.isInteger(timezoneOffsetMinutes)?timezoneOffsetMinutes:null
};}
function validateValue(v){
  if(!isObject(v)||v.policy_version!=="1")throw lifecycleError("lifecycle_state_invalid");
  for(const k of ["first_seen_at","last_observed_at"]){if(!validIso(v[k]))throw lifecycleError("lifecycle_state_invalid",{field:k});}
  for(const k of ["last_memory_save_at","new_chat_recommended_at","new_chat_acknowledged_at","memory_update_postponed_at","last_backup_generated_at","last_backup_verified_at"]){if(v[k]!==null&&!validIso(v[k]))throw lifecycleError("lifecycle_state_invalid",{field:k});}
  for(const k of ["memory_save_success_count","successful_saves_since_new_chat"]){if(!Number.isInteger(v[k])||v[k]<0)throw lifecycleError("lifecycle_state_invalid",{field:k});}
  if(v.last_timezone_offset_minutes!==null&&!Number.isInteger(v.last_timezone_offset_minutes))throw lifecycleError("lifecycle_state_invalid",{field:"last_timezone_offset_minutes"});
  return v;
}
function rowFromValue(value,updatedAt){return {key:ROW_KEY,feature_id:FEATURE_ID,feature_schema_version:FEATURE_SCHEMA_VERSION,state_namespace:STATE_NAMESPACE,state_key:STATE_KEY,value:clone(validateValue(value)),updated_at:updatedAt};}
function validateRow(row){
  if(!isObject(row)||row.key!==ROW_KEY||row.feature_id!==FEATURE_ID||row.feature_schema_version!==FEATURE_SCHEMA_VERSION||row.state_namespace!==STATE_NAMESPACE||row.state_key!==STATE_KEY||!validIso(row.updated_at))throw lifecycleError("lifecycle_row_invalid");
  validateValue(row.value);return row;
}
async function readRow(db,{storageApi=global.InooStorage}={}){
  if(!storageApi||!storageApi.STORES||!storageApi.STORES.LIFECYCLE)throw lifecycleError("lifecycle_storage_unavailable");
  const tx=db.transaction([storageApi.STORES.LIFECYCLE],"readonly");
  const row=await requestResult(tx.objectStore(storageApi.STORES.LIFECYCLE).get(ROW_KEY));
  await transactionDone(tx);
  return row?validateRow(row):null;
}
async function writeValue(db,value,{storageApi=global.InooStorage,nowIso=new Date().toISOString()}={}){
  ensureRegistered();validateValue(value);
  const tx=db.transaction([storageApi.STORES.LIFECYCLE],"readwrite");
  tx.objectStore(storageApi.STORES.LIFECYCLE).put(rowFromValue(value,nowIso));
  await transactionDone(tx);return clone(value);
}
async function ensureState(db,{storageApi=global.InooStorage,nowIso=new Date().toISOString(),timezoneOffsetMinutes=new Date().getTimezoneOffset()}={}){
  let row=await readRow(db,{storageApi});
  if(row)return clone(row.value);
  const value=defaultValue(nowIso,timezoneOffsetMinutes);
  await writeValue(db,value,{storageApi,nowIso});return value;
}
function computeView(value,{nowIso=new Date().toISOString(),timezoneOffsetMinutes=new Date().getTimezoneOffset(),clockAnomaly=null,privateSession=false}={}){
  validateValue(value);
  const baseline=value.last_memory_save_at||value.first_seen_at;
  const nextMemoryAt=addDays(baseline,MEMORY_INTERVAL_DAYS);
  const memoryDue=Date.parse(nowIso)>=Date.parse(nextMemoryAt);
  const backupBaseline=value.last_backup_verified_at||value.first_seen_at;
  const nextBackupAt=addDays(backupBaseline,BACKUP_INTERVAL_DAYS);
  const backupDue=Date.parse(nowIso)>=Date.parse(nextBackupAt);
  const timezoneChanged=value.last_timezone_offset_minutes!==null&&Number.isInteger(timezoneOffsetMinutes)&&value.last_timezone_offset_minutes!==timezoneOffsetMinutes;
  const clockBackward=Date.parse(nowIso)<Date.parse(value.last_observed_at);
  const anomaly=clockAnomaly|| (clockBackward?"clock_moved_backward":timezoneChanged?"timezone_changed":null);
  return Object.freeze({
    memory_due:memoryDue,
    memory_due_state:privateSession&&memoryDue?"private_session_paused":memoryDue&&value.memory_update_postponed_at?"postponed":memoryDue?"due":"not_due",
    last_memory_save_at:value.last_memory_save_at,
    next_memory_recommended_at:nextMemoryAt,
    elapsed_days:elapsedDays(value.last_memory_save_at||value.first_seen_at,nowIso),
    successful_memory_saves:value.memory_save_success_count,
    successful_saves_since_new_chat:value.successful_saves_since_new_chat,
    new_chat_due:value.successful_saves_since_new_chat>=NEW_CHAT_SUCCESS_CADENCE,
    new_chat_recommended_at:value.new_chat_recommended_at,
    backup_due:backupDue,
    next_backup_recommended_at:nextBackupAt,
    last_backup_generated_at:value.last_backup_generated_at,
    last_backup_verified_at:value.last_backup_verified_at,
    backup_verified_matches_latest:!!value.last_backup_generated_at&&!!value.last_backup_verified_at&&Date.parse(value.last_backup_verified_at)>=Date.parse(value.last_backup_generated_at),
    clock_advisory:anomaly,
    timezone_changed:timezoneChanged,
    private_session:!!privateSession
  });
}

let sessionClock={wall:Date.now(),mono:global.performance&&typeof global.performance.now==="function"?global.performance.now():null};
function detectSessionClockAnomaly({wallNow=Date.now(),monoNow=global.performance&&typeof global.performance.now==="function"?global.performance.now():null}={}){
  if(sessionClock.mono===null||monoNow===null){sessionClock={wall:wallNow,mono:monoNow};return null;}
  const wallDelta=wallNow-sessionClock.wall,monoDelta=monoNow-sessionClock.mono,diff=wallDelta-monoDelta;
  sessionClock={wall:wallNow,mono:monoNow};
  if(diff>CLOCK_DRIFT_TOLERANCE_MS)return "clock_moved_forward";
  if(diff<-CLOCK_DRIFT_TOLERANCE_MS)return "clock_moved_backward";
  return null;
}
async function observe(db,{storageApi=global.InooStorage,nowIso=new Date().toISOString(),timezoneOffsetMinutes=new Date().getTimezoneOffset(),privateSession=false,clockAnomaly=detectSessionClockAnomaly()}={}){
  const existing=await readRow(db,{storageApi});
  const value=existing?clone(existing.value):privateSession?defaultValue(nowIso,timezoneOffsetMinutes):await ensureState(db,{storageApi,nowIso,timezoneOffsetMinutes});
  const view=computeView(value,{nowIso,timezoneOffsetMinutes,privateSession,clockAnomaly});
  if(privateSession)return view;
  // Observation metadata is lifecycle-only advisory state, never canonical USER mutation authority.
  const next={...value,last_observed_at:nowIso,last_timezone_offset_minutes:timezoneOffsetMinutes};
  await writeValue(db,next,{storageApi,nowIso});
  return view;
}
async function noteMemorySaveSuccess(db,{storageApi=global.InooStorage,nowIso=new Date().toISOString(),privateSession=false}={}){
  if(privateSession)return Object.freeze({recorded:false,reason:"private_session"});
  const value=await ensureState(db,{storageApi,nowIso});
  const count=value.memory_save_success_count+1,since=value.successful_saves_since_new_chat+1;
  const next={...value,last_memory_save_at:nowIso,memory_save_success_count:count,successful_saves_since_new_chat:since,memory_update_postponed_at:null};
  if(since>=NEW_CHAT_SUCCESS_CADENCE&&!next.new_chat_recommended_at)next.new_chat_recommended_at=nowIso;
  await writeValue(db,next,{storageApi,nowIso});return Object.freeze({recorded:true,value:clone(next)});
}
async function postponeMemoryUpdate(db,{storageApi=global.InooStorage,nowIso=new Date().toISOString(),privateSession=false}={}){
  if(privateSession)return Object.freeze({recorded:false,reason:"private_session"});
  const value=await ensureState(db,{storageApi,nowIso});
  const next={...value,memory_update_postponed_at:nowIso};await writeValue(db,next,{storageApi,nowIso});return Object.freeze({recorded:true,value:clone(next)});
}
async function acknowledgeNewChat(db,{storageApi=global.InooStorage,nowIso=new Date().toISOString()}={}){
  const value=await ensureState(db,{storageApi,nowIso});
  const next={...value,successful_saves_since_new_chat:0,new_chat_acknowledged_at:nowIso,new_chat_recommended_at:null};
  await writeValue(db,next,{storageApi,nowIso});return Object.freeze({recorded:true,value:clone(next)});
}
async function noteBackupStatus(db,{storageApi=global.InooStorage,generatedAt=null,verifiedAt=null,nowIso=new Date().toISOString()}={}){
  const value=await ensureState(db,{storageApi,nowIso});
  if(generatedAt!==null&&!validIso(generatedAt))throw lifecycleError("backup_generated_at_invalid");
  if(verifiedAt!==null&&!validIso(verifiedAt))throw lifecycleError("backup_verified_at_invalid");
  const next={...value};if(generatedAt!==null)next.last_backup_generated_at=generatedAt;if(verifiedAt!==null)next.last_backup_verified_at=verifiedAt;
  await writeValue(db,next,{storageApi,nowIso});return Object.freeze({recorded:true,value:clone(next)});
}
async function exportPortableRecord(db,{storageApi=global.InooStorage}={}){
  const row=await readRow(db,{storageApi});return row?Object.freeze(clone(row)):null;
}
async function importPortableRecord(db,row,{storageApi=global.InooStorage,nowIso=new Date().toISOString()}={}){
  validateRow(row);
  await writeValue(db,row.value,{storageApi,nowIso});return Object.freeze({status:"SUCCESS"});
}
function portableRecordValid(row){try{validateRow(row);return true;}catch(_){return false;}}

function runtimePrivateSession(){
  const runtime=global.__InooWebApp;if(!runtime||typeof runtime.getState!=="function")return false;
  try{return !!runtime.getState().private_session;}catch(_){return false;}
}
function formatTime(v){if(!v)return "없음";try{return new Date(v).toLocaleString();}catch(_){return String(v);}}
function renderLifecycleView(view,root=global.document){
  if(!root||!view)return;
  const status=root.getElementById("lifecycleStatus"),last=root.getElementById("lifecycleLastSave"),next=root.getElementById("lifecycleNextSave"),elapsed=root.getElementById("lifecycleElapsedDays"),cycles=root.getElementById("lifecycleNewChatCycle"),backup=root.getElementById("lifecycleBackupState"),postpone=root.getElementById("btnLifecyclePostpone"),ack=root.getElementById("btnLifecycleNewChatAck");
  if(last)last.textContent=formatTime(view.last_memory_save_at);
  if(next)next.textContent=formatTime(view.next_memory_recommended_at);
  if(elapsed)elapsed.textContent=String(view.elapsed_days)+"일";
  if(cycles)cycles.textContent=`${view.successful_saves_since_new_chat}/${NEW_CHAT_SUCCESS_CADENCE}`;
  if(backup)backup.textContent=view.last_backup_verified_at?`검증 ${formatTime(view.last_backup_verified_at)}`:view.last_backup_generated_at?`생성만 ${formatTime(view.last_backup_generated_at)}`:"검증된 백업 없음";
  if(postpone){postpone.hidden=!view.memory_due;postpone.disabled=view.private_session;}
  if(ack){ack.hidden=!view.new_chat_due;ack.disabled=view.private_session;}
  let text="장기 기억 업데이트는 아직 권장 시점 전입니다.";let tone="ready";
  if(view.private_session&&view.memory_due){text="Private Session 중이라 lifecycle 자동 기록과 장기 기억 업데이트 권장을 일시 정지했습니다.";tone="warn";}
  else if(view.memory_due_state==="postponed"){text="장기 기억 업데이트 권장 시점이 지났지만 사용자가 이번 업데이트를 미뤘습니다. 밀린 주차를 여러 건으로 쪼개지 않고 다음 성공 저장 1회로 통합합니다.";tone="warn";}
  else if(view.memory_due){text="장기 기억 업데이트 권장 시점입니다. 밀린 기간이 있어도 현재 업데이트 한 번으로 통합합니다.";tone="warn";}
  if(view.new_chat_due)text+=" 장기 기억 저장 성공 4회가 누적되어 새 ChatGPT 채팅을 권장합니다.";
  if(view.backup_due)text+=" 검증된 Standard Recovery Backup도 주기적으로 새로 만드는 것을 권장합니다.";
  if(view.clock_advisory){text+=` 기기 시간/시간대 변화(${view.clock_advisory})가 감지됐습니다. 이 알림은 advisory일 뿐 USER 데이터를 자동 변경하지 않습니다.`;tone="warn";}
  if(status){status.textContent=text;status.dataset.state=tone;}
}
async function initLifecycleUI(){
  ensureRegistered();const root=global.document;if(!root||!root.getElementById("lifecyclePanel")||!global.InooStorage)return null;
  let db=null;try{db=await global.InooStorage.openDatabase();}catch(_){return null;}
  const refresh=async()=>{const view=await observe(db,{privateSession:runtimePrivateSession()});renderLifecycleView(view,root);return view;};
  const postpone=root.getElementById("btnLifecyclePostpone"),ack=root.getElementById("btnLifecycleNewChatAck");
  if(postpone)postpone.addEventListener("click",async()=>{await postponeMemoryUpdate(db,{privateSession:runtimePrivateSession()});await refresh();});
  if(ack)ack.addEventListener("click",async()=>{if(runtimePrivateSession())return;await acknowledgeNewChat(db);await refresh();});
  if(global.addEventListener){
    for(const name of ["inoo:lifecycle-changed","inoo:canonical-recovery-committed","inoo:canonical-history-committed","inoo:canonical-transfer-committed","inoo:foundation-ready"])global.addEventListener(name,()=>refresh().catch(()=>{}));
  }
  await refresh();return {db,refresh};
}

ensureRegistered();
const api=Object.freeze({FEATURE_ID,FEATURE_SCHEMA_VERSION,STATE_NAMESPACE,STATE_KEY,ROW_KEY,MEMORY_INTERVAL_DAYS,NEW_CHAT_SUCCESS_CADENCE,BACKUP_INTERVAL_DAYS,descriptor,ensureRegistered,defaultValue,validateValue,validateRow,readRow,writeValue,ensureState,computeView,observe,noteMemorySaveSuccess,postponeMemoryUpdate,acknowledgeNewChat,noteBackupStatus,exportPortableRecord,importPortableRecord,portableRecordValid,renderLifecycleView,initLifecycleUI,_test:Object.freeze({elapsedDays,addDays,detectSessionClockAnomaly,resetClock:(wall,mono)=>{sessionClock={wall,mono};}})});
global.InooLifecycle=api;
if(global.document){if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",()=>{initLifecycleUI().catch(()=>{});},{once:true});else initLifecycleUI().catch(()=>{});}
})(typeof window!=="undefined"?window:globalThis);
