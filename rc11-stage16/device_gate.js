(function(global){
"use strict";

const DIAG_DB="inoo_companion_device_gate_v1";
const VERSION_DB="inoo_companion_device_gate_versionchange_v1";
const PRODUCT_DB_FORBIDDEN="inoo_companion_user_db";
const DIAG_VERSION=1;
const STORES=Object.freeze({KV:"kv",HEAD:"head"});
const MARKER_KEY="persistence_marker";
const CONTAINER_KEY="diagnostic_container_id";

function gateError(code,details){
  const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;
}
function requestDone(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||gateError("idb_request_failed"));
  });
}
function txDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||gateError("idb_transaction_aborted"));
    tx.onerror=()=>{};
  });
}
function openDatabase(factory=global.indexedDB,name=DIAG_DB,version=DIAG_VERSION){
  if(!factory||typeof factory.open!=="function")return Promise.reject(gateError("indexeddb_unavailable"));
  if(name===PRODUCT_DB_FORBIDDEN)return Promise.reject(gateError("product_db_forbidden"));
  return new Promise((resolve,reject)=>{
    const req=factory.open(name,version);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORES.KV))db.createObjectStore(STORES.KV);
      if(!db.objectStoreNames.contains(STORES.HEAD))db.createObjectStore(STORES.HEAD);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||gateError("idb_open_failed"));
    req.onblocked=()=>reject(gateError("idb_open_blocked"));
  });
}
function deleteDatabase(factory=global.indexedDB,name){
  if(!factory||typeof factory.deleteDatabase!=="function")return Promise.resolve(false);
  if(name===PRODUCT_DB_FORBIDDEN)return Promise.reject(gateError("product_db_forbidden"));
  return new Promise((resolve,reject)=>{
    const req=factory.deleteDatabase(name);
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>reject(req.error||gateError("idb_delete_failed"));
    req.onblocked=()=>reject(gateError("idb_delete_blocked"));
  });
}
async function getRecord(db,store,key){
  const tx=db.transaction(store,"readonly");
  const value=await requestDone(tx.objectStore(store).get(key));
  await txDone(tx);
  return value;
}
async function putRecord(db,store,key,value){
  const tx=db.transaction(store,"readwrite");
  tx.objectStore(store).put(value,key);
  await txDone(tx);
}
async function deleteRecord(db,store,key){
  const tx=db.transaction(store,"readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}
function randomId(){
  if(global.crypto&&typeof global.crypto.randomUUID==="function")return global.crypto.randomUUID();
  const a=new Uint8Array(16);
  if(global.crypto&&typeof global.crypto.getRandomValues==="function")global.crypto.getRandomValues(a);
  else for(let i=0;i<a.length;i++)a[i]=Math.floor(Math.random()*256);
  return Array.from(a,x=>x.toString(16).padStart(2,"0")).join("");
}
async function ensureContainerId(db){
  let id=await getRecord(db,STORES.KV,CONTAINER_KEY);
  if(typeof id==="string"&&id)return id;
  id=randomId();await putRecord(db,STORES.KV,CONTAINER_KEY,id);return id;
}

async function testUnicode(db){
  const key="unicode_fidelity";
  const value={text:"한글 / 日本語 / 😀 / e\u0301 / é",nested:["가","あ","🫧"],combining:"A\u030A"};
  await putRecord(db,STORES.KV,key,value);
  const read=await getRecord(db,STORES.KV,key);
  await deleteRecord(db,STORES.KV,key);
  if(JSON.stringify(read)!==JSON.stringify(value))throw gateError("unicode_fidelity_mismatch");
  return {status:"PASS"};
}

async function testAbortAtomicity(db){
  const kvKey="abort_kv",headKey="abort_head";
  try{await deleteRecord(db,STORES.KV,kvKey);}catch(_){}
  try{await deleteRecord(db,STORES.HEAD,headKey);}catch(_){}
  const tx=db.transaction([STORES.KV,STORES.HEAD],"readwrite");
  const done=txDone(tx);
  tx.objectStore(STORES.KV).put({v:1},kvKey);
  tx.objectStore(STORES.HEAD).put({revision:1},headKey);
  tx.abort();
  try{await done;}catch(_){}
  const a=await getRecord(db,STORES.KV,kvKey);
  const b=await getRecord(db,STORES.HEAD,headKey);
  if(a!==undefined||b!==undefined)throw gateError("abort_was_not_atomic");
  return {status:"PASS"};
}

async function casAttempt(db,expected,token){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORES.HEAD,"readwrite");
    const store=tx.objectStore(STORES.HEAD);
    let outcome=null;
    const req=store.get("cas_head");
    req.onerror=()=>{try{tx.abort()}catch(_){};reject(req.error||gateError("cas_read_failed"));};
    req.onsuccess=()=>{
      const cur=req.result||{revision:0};
      if(cur.revision!==expected){
        outcome={status:"STALE",actual:cur.revision};
        try{tx.abort()}catch(_){}
        return;
      }
      store.put({revision:expected+1,token},"cas_head");
      outcome={status:"SUCCESS",revision:expected+1,token};
    };
    tx.oncomplete=()=>resolve(outcome||{status:"UNKNOWN"});
    tx.onabort=()=>{
      if(outcome&&outcome.status==="STALE")resolve(outcome);
      else reject(tx.error||gateError("cas_transaction_aborted"));
    };
    tx.onerror=()=>{};
  });
}
async function testConcurrentCas(db){
  await deleteRecord(db,STORES.HEAD,"cas_head");
  const [a,b]=await Promise.all([casAttempt(db,0,"A"),casAttempt(db,0,"B")]);
  const statuses=[a.status,b.status].sort();
  const head=await getRecord(db,STORES.HEAD,"cas_head");
  await deleteRecord(db,STORES.HEAD,"cas_head");
  if(JSON.stringify(statuses)!==JSON.stringify(["STALE","SUCCESS"]))throw gateError("cas_race_result_invalid",{a,b});
  if(!head||head.revision!==1)throw gateError("cas_head_invalid",{head});
  return {status:"PASS",winner:head.token};
}

async function testSuccessfulMultiStoreCommit(db){
  const op=randomId();
  const tx=db.transaction([STORES.KV,STORES.HEAD],"readwrite");
  tx.objectStore(STORES.KV).put({op},"commit_kv");
  tx.objectStore(STORES.HEAD).put({op},"commit_head");
  await txDone(tx);
  const a=await getRecord(db,STORES.KV,"commit_kv");
  const b=await getRecord(db,STORES.HEAD,"commit_head");
  await deleteRecord(db,STORES.KV,"commit_kv");
  await deleteRecord(db,STORES.HEAD,"commit_head");
  if(!a||!b||a.op!==op||b.op!==op)throw gateError("multi_store_commit_mismatch");
  return {status:"PASS"};
}

async function testVersionChange(factory=global.indexedDB){
  try{await deleteDatabase(factory,VERSION_DB);}catch(_){}
  const first=await openDatabase(factory,VERSION_DB,1);
  let eventSeen=false;
  first.onversionchange=()=>{eventSeen=true;first.close();};
  const upgraded=await new Promise((resolve,reject)=>{
    const req=factory.open(VERSION_DB,2);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORES.KV))db.createObjectStore(STORES.KV);
      if(!db.objectStoreNames.contains(STORES.HEAD))db.createObjectStore(STORES.HEAD);
      if(!db.objectStoreNames.contains("v2"))db.createObjectStore("v2");
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||gateError("versionchange_upgrade_failed"));
    req.onblocked=()=>reject(gateError("versionchange_blocked"));
  });
  upgraded.close();
  await deleteDatabase(factory,VERSION_DB);
  if(!eventSeen)throw gateError("versionchange_event_missing");
  return {status:"PASS"};
}

async function testPersistenceMarker(db){
  const existing=await getRecord(db,STORES.KV,MARKER_KEY);
  if(existing&&existing.kind==="device_gate_marker"){
    return {status:"PASS",first_seen_at:existing.first_seen_at,rerun_seen:true};
  }
  const marker={kind:"device_gate_marker",first_seen_at:new Date().toISOString(),nonce:randomId()};
  await putRecord(db,STORES.KV,MARKER_KEY,marker);
  return {status:"PENDING",reason:"reload_required",first_seen_at:marker.first_seen_at,rerun_seen:false};
}

async function storageAdvisory(){
  const out={persisted:null,estimate:null};
  try{
    if(global.navigator&&global.navigator.storage&&typeof global.navigator.storage.persisted==="function"){
      out.persisted=await global.navigator.storage.persisted();
    }
  }catch(_){}
  try{
    if(global.navigator&&global.navigator.storage&&typeof global.navigator.storage.estimate==="function"){
      const e=await global.navigator.storage.estimate();
      out.estimate={usage:typeof e.usage==="number"?e.usage:null,quota:typeof e.quota==="number"?e.quota:null};
    }
  }catch(_){}
  return out;
}

function environmentInfo(){
  let standalone=false;
  try{standalone=!!(global.matchMedia&&global.matchMedia("(display-mode: standalone)").matches)||!!(global.navigator&&global.navigator.standalone);}catch(_){}
  return {
    user_agent:global.navigator&&global.navigator.userAgent||"unknown",
    standalone,
    secure_context:global.isSecureContext===true,
    origin:global.location&&global.location.origin||"unknown"
  };
}
async function runDeviceGate({factory=global.indexedDB}={}){
  const started=new Date().toISOString();
  const results={};
  let db=null;
  try{
    db=await openDatabase(factory,DIAG_DB,DIAG_VERSION);
    results.open={status:"PASS"};
    const containerId=await ensureContainerId(db);
    results.unicode=await testUnicode(db);
    results.abort_atomicity=await testAbortAtomicity(db);
    results.multi_store_commit=await testSuccessfulMultiStoreCommit(db);
    results.concurrent_cas=await testConcurrentCas(db);
    results.persistence=await testPersistenceMarker(db);
    results.versionchange=await testVersionChange(factory);
    const advisory=await storageAdvisory();
    return {
      gate_version:"rc11-device-gate-1",
      started_at:started,
      completed_at:new Date().toISOString(),
      overall:Object.values(results).some(x=>x&&x.status==="FAIL")?"FAIL":(results.persistence.status==="PENDING"?"PENDING":"PASS"),
      diagnostic_db:DIAG_DB,
      product_db_touched:false,
      diagnostic_container_id:containerId,
      environment:environmentInfo(),
      advisory,
      results
    };
  }catch(e){
    results.failure={status:"FAIL",code:e&&e.code||e&&e.name||"unknown_error"};
    return {
      gate_version:"rc11-device-gate-1",
      started_at:started,
      completed_at:new Date().toISOString(),
      overall:"FAIL",
      diagnostic_db:DIAG_DB,
      product_db_touched:false,
      environment:environmentInfo(),
      results
    };
  }finally{
    try{if(db)db.close();}catch(_){}
  }
}
function humanSummary(report){
  const r=report.results||{};
  const lines=[
    `결과: ${report.overall}`,
    `진단 컨테이너 ID: ${report.diagnostic_container_id||"미확인"}`,
    `실행 모드: ${report.environment&&report.environment.standalone?"설치/standalone":"브라우저 탭"}`,
    `Secure Context: ${report.environment&&report.environment.secure_context?"예":"아니오"}`,
    `IndexedDB open: ${r.open&&r.open.status||"미실행"}`,
    `Unicode fidelity: ${r.unicode&&r.unicode.status||"미실행"}`,
    `Abort atomicity: ${r.abort_atomicity&&r.abort_atomicity.status||"미실행"}`,
    `Multi-store commit: ${r.multi_store_commit&&r.multi_store_commit.status||"미실행"}`,
    `Concurrent CAS: ${r.concurrent_cas&&r.concurrent_cas.status||"미실행"}`,
    `versionchange: ${r.versionchange&&r.versionchange.status||"미실행"}`,
    `Reload persistence: ${r.persistence&&r.persistence.status||"미실행"}`,
    `제품 USER DB 접근: ${report.product_db_touched?"있음(오류)":"없음"}`
  ];
  if(r.persistence&&r.persistence.status==="PENDING")lines.push("→ 같은 브라우저/앱에서 새로고침 후 다시 실행해야 persistence PASS 여부를 확정할 수 있습니다.");
  return lines.join("\n");
}

async function copyText(text){
  try{
    if(global.navigator&&global.navigator.clipboard&&typeof global.navigator.clipboard.writeText==="function"){
      await global.navigator.clipboard.writeText(text);return true;
    }
  }catch(_){}
  return false;
}
function bindUI(){
  if(!global.document)return;
  const run=global.document.getElementById("gateRun");
  const reload=global.document.getElementById("gateReload");
  const copy=global.document.getElementById("gateCopy");
  const status=global.document.getElementById("gateStatus");
  const result=global.document.getElementById("gateResult");
  if(!run)return;
  let last=null;
  run.addEventListener("click",async()=>{
    run.disabled=true;
    if(status)status.textContent="진단 중입니다. 제품 USER DB에는 접근하지 않습니다.";
    last=await runDeviceGate();
    const text=humanSummary(last)+"\n\nRAW REPORT\n"+JSON.stringify(last,null,2);
    if(result){result.textContent=text;result.hidden=false;}
    if(copy)copy.hidden=false;
    if(reload)reload.hidden=!(last.results&&last.results.persistence&&last.results.persistence.status==="PENDING");
    if(status)status.textContent=last.overall==="PASS"?"이 저장 컨테이너의 진단 항목이 PASS했습니다.":last.overall==="PENDING"?"1차 진단은 통과했습니다. persistence 확인을 위해 새로고침 후 다시 실행하세요.":"진단 중 FAIL이 발생했습니다. 제품 DB에는 write하지 않았습니다.";
    run.disabled=false;
  });
  if(reload)reload.addEventListener("click",()=>global.location.reload());
  if(copy)copy.addEventListener("click",async()=>{
    if(!last)return;
    const ok=await copyText(humanSummary(last)+"\n\n"+JSON.stringify(last,null,2));
    if(status)status.textContent=ok?"진단 결과를 복사했습니다.":"자동 복사가 실패했습니다. 화면의 결과를 직접 복사하세요.";
  });
}

const api=Object.freeze({
  DIAG_DB,VERSION_DB,PRODUCT_DB_FORBIDDEN,DIAG_VERSION,STORES,
  openDatabase,deleteDatabase,runDeviceGate,humanSummary,environmentInfo,
  _test:{testUnicode,testAbortAtomicity,testConcurrentCas,testSuccessfulMultiStoreCommit,testVersionChange,testPersistenceMarker}
});
global.InooDeviceGate=api;

if(global.document){
  if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",bindUI,{once:true});
  else bindUI();
}
})(typeof window!=="undefined"?window:globalThis);
