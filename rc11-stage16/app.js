
(async function(){
"use strict";
const L=window.InooWebLogic,STORE="inoo_public_state_v0_7",FIRST="inoo_first_use_v0_4",FAV_STORE="inoo_favorites_v1",PREV_STORE="inoo_previous_state_v1",CONT_STORE="inoo_continuity_v1",CONT_HIST_STORE="inoo_continuity_history_v1",CONT_SENS_STORE="inoo_continuity_sensitive_v1";
const MAX_SETTINGS_FILE_BYTES=256*1024,MAX_CONTINUITY_INPUT_BYTES=32*1024,FETCH_TIMEOUT_MS=8000,FETCH_RETRIES=1;
const LEGACY_SW_CACHE="inoo-companion-v0.9.0";
const ALLOWED_CHAT_ORIGINS=new Set(["https://chatgpt.com"]);
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
let T={},bootstrap="",config={},personaState=null,capabilityProfile=null,state=load(),favorites=loadFavorites(),previous=loadPrevious(),continuity=loadContinuity(),continuityHistory=loadContinuityHistory(),continuitySensitive=loadContinuitySensitive(),pendingContinuity=null,continuityClearArmed=false,continuityClearTimer=null;


async function decommissionLegacyOfflineRuntime(){
 const outcome={registration:"not_applicable",cache:"not_applicable"};
 if(location.protocol!=="https:")return outcome;
 const expectedScope=new URL("./",location.href).href;
 const expectedScript=new URL("./sw.js",location.href).href;
 if("serviceWorker" in navigator&&typeof navigator.serviceWorker.getRegistration==="function"){
  try{
   const registration=await navigator.serviceWorker.getRegistration(expectedScope);
   if(!registration){outcome.registration="none";}
   else if(registration.scope!==expectedScope){outcome.registration="different_scope";}
   else{
    const worker=registration.active||registration.waiting||registration.installing;
    if(worker&&worker.scriptURL!==expectedScript){outcome.registration="different_script";}
    else outcome.registration=await registration.unregister()?"unregistered":"not_unregistered";
   }
  }catch(_){outcome.registration="error";}
 }
 if(typeof window.caches!=="undefined"&&typeof window.caches.delete==="function"){
  try{outcome.cache=await window.caches.delete(LEGACY_SW_CACHE)?"deleted":"absent";}
  catch(_){outcome.cache="error";}
 }
 return outcome;
}

function locale(){
 if(state.locale!=="auto")return state.locale;
 const l=(navigator.language||"en").toLowerCase();
 return l.startsWith("ko")?"ko":l.startsWith("ja")?"ja":"en";
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function fetchWithTimeout(url,options={},retries=FETCH_RETRIES){
 let lastError;
 for(let attempt=0;attempt<=retries;attempt++){
  const controller=typeof AbortController!=="undefined"?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS):null;
  try{
   const response=await fetch(url,{...options,...(controller?{signal:controller.signal}:{})});
   if(!response.ok)throw new Error("http_error");
   return response;
  }catch(err){
   lastError=err;
   if(attempt<retries)await sleep(250*(attempt+1));
  }finally{
   if(timer)clearTimeout(timer);
  }
 }
 throw lastError||new Error("network_error");
}
async function getJSON(url){return (await fetchWithTimeout(url,{cache:"no-store"})).json();}
async function getBytes(url){return new Uint8Array(await (await fetchWithTimeout(url,{cache:"no-store"})).arrayBuffer());}
async function initData(){
 const foundation=window.InooIntegrityFoundation;
 if(!foundation)throw new Error("integrity_foundation_unavailable");
 [T,config]=await Promise.all([getJSON("i18n.json"),getJSON("config.json")]);
 try{capabilityProfile=foundation.createCapabilityProfile(config.capability_defaults||{});}
 catch(_){capabilityProfile=foundation.createCapabilityProfile({});}
 const descriptor=config.persona_package;
 try{
  const personaBytes=await getBytes(descriptor&&descriptor.resource||"public_bootstrap.txt");
  personaState=await foundation.verifyPersonaBytes(personaBytes,descriptor);
  if(personaState.status===foundation.PERSONA_STATUS.READY)bootstrap=foundation.decodePersonaBytes(personaBytes);
  else bootstrap="";
 }catch(e){
  personaState=foundation.personaUnavailable(descriptor,e&&e.code||e&&e.message||"persona_load_failed");
  bootstrap="";
 }
}
function personaReady(){
 const f=window.InooIntegrityFoundation;
 return !!(f&&personaState&&personaState.status===f.PERSONA_STATUS.READY);
}
function personaStatusText(){
 const f=window.InooIntegrityFoundation;
 if(personaReady())return fmt(tr("persona_ready"),{version:personaState.descriptor.persona_package_version});
 if(f&&personaState&&personaState.status===f.PERSONA_STATUS.INTEGRITY_FAILED)return tr("persona_integrity_failed");
 return tr("persona_unavailable_user_preserved");
}
function capabilityStatusKey(status){
 const f=window.InooIntegrityFoundation;
 if(!f)return "capability_unknown";
 if(status===f.CAPABILITY_STATUS.AVAILABLE)return "capability_available";
 if(status===f.CAPABILITY_STATUS.UNAVAILABLE)return "capability_unavailable";
 if(status===f.CAPABILITY_STATUS.USER_DISABLED)return "capability_user_disabled";
 return "capability_unknown";
}
function capabilityStatusText(){
 const f=window.InooIntegrityFoundation;
 if(!f||!capabilityProfile)return tr("chat_baseline");
 const project=f.capabilityDecision(capabilityProfile,"project_assistance");
 const memory=f.capabilityDecision(capabilityProfile,"memory_assistance");
 const optionalReady=[project,memory].some(x=>x.optional_available===true);
 return optionalReady?tr("chat_optional_available"):tr("chat_baseline");
}
function safeChatTarget(raw){
 try{
  const u=new URL(String(raw||"https://chatgpt.com/"));
  if(u.protocol!=="https:"||!ALLOWED_CHAT_ORIGINS.has(u.origin))return "https://chatgpt.com/";
  return u.href;
 }catch(e){return "https://chatgpt.com/"}
}
function load(){try{return L.safeImport(JSON.parse(localStorage.getItem(STORE)||"{}")).active}catch(e){return {...L.DEFAULTS}}}

function stateJSON(s){return JSON.stringify(L.exportState(s))}
function sameState(a,b){try{return stateJSON(a)===stateJSON(b)}catch(e){return false}}
function loadPrevious(){try{const raw=localStorage.getItem(PREV_STORE);if(!raw)return null;return L.safeImport(JSON.parse(raw)).active}catch(e){return null}}
function savePrevious(s){previous=s?L.validate(s).state:null;try{if(previous)localStorage.setItem(PREV_STORE,JSON.stringify(L.exportState(previous)));else localStorage.removeItem(PREV_STORE)}catch(e){}}
function sanitizeFavoriteList(input){
 if(!Array.isArray(input))return [];
 const out=[];
 for(const item of input.slice(0,8)){
  try{
   const src=item&&item.settings?item.settings:item;
   const s=L.safeImport(src).active;
   if(!out.some(x=>sameState(x,s)))out.push(s);
  }catch(e){}
 }
 return out;
}
function loadFavorites(){try{return sanitizeFavoriteList(JSON.parse(localStorage.getItem(FAV_STORE)||"[]"))}catch(e){return []}}
function saveFavorites(){try{localStorage.setItem(FAV_STORE,JSON.stringify(favorites.map(s=>L.exportState(s))));return true}catch(e){return false}}

function loadContinuity(){
 try{
  const raw=localStorage.getItem(CONT_STORE);if(!raw)return null;
  const v=L.validateContinuity(JSON.parse(raw),true);return v.ok?v.state:null;
 }catch(e){return null}
}
function sanitizeContinuityHistory(input){
 if(!Array.isArray(input))return [];
 const out=[];
 for(const item of input.slice(0,5)){
  const v=L.validateContinuity(item,true);
  if(v.ok&&v.state&&!out.some(x=>JSON.stringify(x)===JSON.stringify(v.state)))out.push(v.state);
 }
 return out;
}
function loadContinuityHistory(){try{return sanitizeContinuityHistory(JSON.parse(localStorage.getItem(CONT_HIST_STORE)||"[]"))}catch(e){return []}}
function saveContinuityStores(){
 try{
  if(continuity)localStorage.setItem(CONT_STORE,JSON.stringify(continuity));else localStorage.removeItem(CONT_STORE);
  localStorage.setItem(CONT_HIST_STORE,JSON.stringify(continuityHistory.slice(0,5)));
  localStorage.setItem(CONT_SENS_STORE,continuitySensitive?"1":"0");
  return true;
 }catch(e){return false}
}
function loadContinuitySensitive(){try{return localStorage.getItem(CONT_SENS_STORE)==="1"}catch(e){return false}}
function sessionContinuity(){
 if(!continuity)return null;
 const copy=JSON.parse(JSON.stringify(continuity));
 if(!continuitySensitive)copy.sensitive_context=[];
 return copy;
}
function pushContinuityHistory(snapshot){
 if(!snapshot)return;
 const v=L.validateContinuity(snapshot,true);if(!v.ok||!v.state)return;
 continuityHistory=[v.state,...continuityHistory.filter(x=>JSON.stringify(x)!==JSON.stringify(v.state))].slice(0,5);
}
function fmt(template,values){
 let out=String(template||"");
 for(const [k,v] of Object.entries(values||{}))out=out.replaceAll("{"+k+"}",String(v));
 return out;
}
function commitState(next,remember=true){
 const checked=L.validate(next);if(!checked.ok){setStatus(tr("invalid_setting"),"error");return false}
 if(remember&&!sameState(state,checked.state))savePrevious(state);
 state=checked.state;
 persistState();
 render();
 return true;
}

function save(){try{localStorage.setItem(STORE,JSON.stringify(L.exportState(state)));return true}catch(e){return false}}
function tr(k){const d=T[locale()]||T.en||{};return d[k]||k}
function nested(section,key){const d=T[locale()]||T.en||{};return (d[section]||{})[key]||key}
function opt(field,value){const d=T[locale()]||T.en||{};return (((d.options||{})[field]||{})[value])||value}
function setStatus(msg,type="info"){
 const e=$("#status");if(!e)return;
 e.textContent=msg;e.dataset.type=type;e.hidden=false;
}
function modeLabel(id){return ((T[locale()]||T.en).modes||{})[id]||id}
function renderFoundationStatus(){
 const f=window.InooIntegrityFoundation;
 const sessionTitle=$("#sessionStatusTitle");if(sessionTitle)sessionTitle.textContent=tr("session_status_title");
 const personaLabel=$("#personaStatusLabel");if(personaLabel)personaLabel.textContent=tr("persona_status_label");
 const chatLabel=$("#chatCapabilityLabel");if(chatLabel)chatLabel.textContent=tr("chat_capability_label");
 const manualLabel=$("#manualCapabilityLabel");if(manualLabel)manualLabel.textContent=tr("manual_capability_label");
 const projectLabel=$("#projectCapabilityLabel");if(projectLabel)projectLabel.textContent=tr("project_capability_label");
 const memoryLabel=$("#memoryCapabilityLabel");if(memoryLabel)memoryLabel.textContent=tr("memory_capability_label");
 const voiceTitle=$("#voiceReactionTitle");if(voiceTitle)voiceTitle.textContent=tr("voice_reaction_title");
 const voiceStatus=$("#voiceReactionStatus");if(voiceStatus)voiceStatus.textContent=tr("voice_reaction_unavailable");
 const voiceTtsTitle=$("#voiceTtsTitle");if(voiceTtsTitle)voiceTtsTitle.textContent=tr("voice_tts_title");
 const voiceTtsHelp=$("#voiceTtsHelp");if(voiceTtsHelp)voiceTtsHelp.textContent=tr("voice_tts_help");
 const reactionTitle=$("#reactionEngineTitle");if(reactionTitle)reactionTitle.textContent=tr("reaction_engine_title");
 const reactionHelp=$("#reactionEngineHelp");if(reactionHelp)reactionHelp.textContent=tr("reaction_engine_help");
 const sttTitle=$("#sttTitle");if(sttTitle)sttTitle.textContent=tr("stt_title");
 const sttHelp=$("#sttHelp");if(sttHelp)sttHelp.textContent=tr("stt_help");
 const personaEl=$("#personaIntegrityStatus");if(personaEl){personaEl.textContent=personaStatusText();personaEl.dataset.state=personaReady()?"ready":"error";}
 const capabilityEl=$("#chatCapabilityStatus");if(capabilityEl){capabilityEl.textContent=capabilityStatusText();capabilityEl.dataset.state="ready";}
 const manualStatus=$("#manualCapabilityStatus");if(manualStatus){manualStatus.textContent=tr("capability_available");manualStatus.dataset.state="ready";}
 if(f&&capabilityProfile){
  for(const [capability,id] of [["project_assistance","projectCapabilityStatus"],["memory_assistance","memoryCapabilityStatus"]]){
   const el=$("#"+id);if(!el)continue;
   const decision=f.capabilityDecision(capabilityProfile,capability);
   el.textContent=tr(capabilityStatusKey(decision.status))+(decision.fallback_to_baseline?" · "+tr("capability_baseline_fallback"):"");
   el.dataset.state=decision.optional_available?"ready":"neutral";
  }
 }
 const privateStatus=$("#privateSessionStatus");if(privateStatus)privateStatus.textContent=state.private_session?"ON":"OFF";
 const copy=$("#copyBtn");if(copy&&!personaReady())copy.disabled=true;
}
function setOptionText(){
 $$("select[data-key]").forEach(sel=>{
   const key=sel.dataset.key;
   Array.from(sel.options).forEach(o=>{
     if(key==="locale"){
       const names={auto:"Auto",ko:"한국어",ja:"日本語",en:"English"};o.textContent=names[o.value]||o.value;
     }else o.textContent=opt(key,o.value);
   });
 });
}
function render(){
 document.documentElement.lang=locale();
 $("#title").textContent=tr("title");$("#subtitle").textContent=tr("subtitle");$("#quickTitle").textContent=tr("quick");
 $("#advancedSummary").textContent=tr("advanced");$("#copyText").textContent=tr("copy");$("#copySub").textContent=tr("copy_sub");
 $("#openText").textContent=tr("open_chatgpt");$("#openSub").textContent=tr("open_chatgpt_sub");
 $("#notice").textContent=tr("not_official")+" · "+tr("privacy");$("#loginNote").textContent=tr("login");$("#installNote").textContent=tr("install");
 $("#btnPrevious").textContent=tr("previous");$("#btnBackup").textContent=tr("backup");$("#btnReset").textContent=tr("reset");$("#restoreLabelText").textContent=tr("restore");
 $("#manualCopy").textContent=tr("manual_copy");$("#refreshBtn").textContent=tr("refresh");$("#localeLabel").textContent=tr("locale_label");
 $("#nowLabel").textContent=tr("now");$("#favoritesTitle").textContent=tr("favorites");$("#favoritesHelp").textContent=tr("favorites_help");$("#btnSaveFavorite").textContent=tr("favorite_save");
 $("#continuityTitle").textContent=tr("continuity_title");$("#continuityHelp").textContent=tr("continuity_help");$("#continuityCurrentLabel").textContent=tr("continuity_current_label");
 $("#btnContinuityRequest").textContent=tr("continuity_request");$("#btnContinuityRollback").textContent=tr("continuity_rollback");
 $("#continuitySensitiveLabel").textContent=tr("continuity_sensitive_label");$("#continuitySensitiveHelp").textContent=tr("continuity_sensitive_help");
 $("#continuityImportSummary").textContent=tr("continuity_import_summary");$("#continuityImportHelp").textContent=tr("continuity_import_help");
 $("#btnContinuityInspect").textContent=tr("continuity_inspect");$("#btnContinuityApply").textContent=tr("continuity_apply");$("#btnContinuityClear").textContent=continuityClearArmed?tr("continuity_clear_confirm"):tr("continuity_clear");
 Object.keys((T[locale()]||T.en).fields||{}).forEach(k=>{const el=$(`[data-field-label="${k}"]`);if(el)el.textContent=nested("fields",k)});
 $("#privateHelp").textContent=((T[locale()]||T.en).field_help||{}).private_session||"";
 setOptionText();
 $$("[data-mode]").forEach(b=>{
   const id=b.dataset.mode;b.querySelector(".label").textContent=modeLabel(id);
   const selected=(id==="talk"&&state.scene==="daily"&&state.activity==="casual_talk")||(id==="phone"&&state.scene==="phone")||
    (id==="date"&&state.scene==="date")||(id==="drink"&&state.scene==="drinking")||(id==="radio"&&state.scene==="radio")||
    (id==="walk"&&state.scene==="vlog_walk")||(id==="timeslip"&&state.scene==="timeslip")||(id==="study"&&state.activity==="japanese_study");
   if(id==="random"){b.setAttribute("aria-pressed","false");b.querySelector(".mark").textContent="";return;}
   b.setAttribute("aria-pressed",selected?"true":"false");b.querySelector(".mark").textContent=selected?"✓":"";
 });
 $("#nowPlaying").textContent=[opt("era",state.era),opt("scene",state.scene),opt("relationship",state.relationship),
   opt("language_support",state.language_support),opt("proficiency",state.proficiency),opt("learning_mode",state.learning_mode)].join(" · ");
 $$("select[data-key]").forEach(s=>s.value=state[s.dataset.key]);
 $("#year_timeslip").value=state.year_timeslip;$("#yearRow").hidden=state.era!=="year_timeslip";$("#private_session").checked=state.private_session;
 $("#openChatgpt").href=safeChatTarget(config.chat_target&&config.chat_target.url);
 renderFoundationStatus();renderFavorites();renderContinuity();
}
function persistState(){
 const ok=save();if(!ok)setStatus(tr("storage_unavailable"),"warn");return ok;
}
function update(p){commitState({...state,...p},true)}
async function copyText(text){
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true}}catch(e){}
 const ta=$("#fallbackPrompt");$("#fallbackWrap").hidden=false;ta.value=text;ta.focus();ta.select();
 try{return !!(document.execCommand&&document.execCommand("copy"))}catch(e){return false}
}

const QUICK_IDS=["talk","phone","date","drink","radio","walk","timeslip","study"];
function quickIdForState(s){
 if(s.scene==="phone")return "phone";
 if(s.scene==="date")return "date";
 if(s.scene==="drinking")return "drink";
 if(s.scene==="radio")return "radio";
 if(s.scene==="vlog_walk")return "walk";
 if(s.scene==="timeslip")return "timeslip";
 if(s.activity==="japanese_study")return "study";
 if(s.scene==="daily"&&s.activity==="casual_talk")return "talk";
 return null;
}
function randomQuick(){
 const current=quickIdForState(state);
 const pool=QUICK_IDS.filter(id=>id!==current);
 const id=pool[Math.floor(Math.random()*pool.length)];
 commitState(L.applyPreset(state,id),true);
 setStatus(tr("random_result")+" · "+modeLabel(id),"ok");
}
function favoriteSummary(s){
 return [opt("scene",s.scene),opt("relationship",s.relationship),opt("learning_mode",s.learning_mode)].join(" · ");
}
function renderFavorites(){
 const list=$("#favoritesList"),empty=$("#favoritesEmpty");
 list.replaceChildren();
 empty.textContent=tr("favorite_empty");
 empty.hidden=favorites.length>0;
 favorites.forEach((s,i)=>{
  const row=document.createElement("div");row.className="favorite-row";
  const main=document.createElement("div");main.className="favorite-main";
  const name=document.createElement("div");name.className="favorite-name";name.textContent=(i+1)+". "+favoriteSummary(s);
  const sub=document.createElement("div");sub.className="favorite-sub";sub.textContent=[opt("era",s.era),opt("language_support",s.language_support),opt("proficiency",s.proficiency)].join(" · ");
  main.append(name,sub);
  const actions=document.createElement("div");actions.className="favorite-actions";
  const mk=(text,act,disabled=false)=>{const b=document.createElement("button");b.type="button";b.textContent=text;b.dataset.favoriteAction=act;b.dataset.favoriteIndex=String(i);b.disabled=disabled;return b};
  const applyBtn=mk(tr("favorite_apply"),"apply");
  const upBtn=mk("↑","up");upBtn.hidden=i===0;
  const downBtn=mk("↓","down");downBtn.hidden=i===favorites.length-1;
  const deleteBtn=mk(tr("favorite_delete"),"delete");
  actions.append(applyBtn,upBtn,downBtn,deleteBtn);
  row.append(main,actions);list.append(row);
 });
}
function saveFavorite(){
 if(favorites.some(s=>sameState(s,state))){setStatus(tr("favorite_exists"),"warn");return}
 if(favorites.length>=8){setStatus(tr("favorite_limit"),"warn");return}
 favorites.push(L.validate(state).state);
 if(!saveFavorites()){setStatus(tr("storage_unavailable"),"warn");return}
 renderFavorites();setStatus(tr("favorite_saved"),"ok");
}
function handleFavoriteAction(target){
 const b=target.closest("[data-favorite-action]");if(!b)return;
 const i=Number(b.dataset.favoriteIndex),act=b.dataset.favoriteAction;
 if(!Number.isInteger(i)||i<0||i>=favorites.length)return;
 if(act==="apply"){commitState(favorites[i],true);setStatus(tr("favorite_applied"),"ok");return}
 if(act==="delete"){favorites.splice(i,1);saveFavorites();renderFavorites();setStatus(tr("favorite_deleted"),"ok");return}
 const j=act==="up"?i-1:act==="down"?i+1:i;
 if(j>=0&&j<favorites.length&&j!==i){[favorites[i],favorites[j]]=[favorites[j],favorites[i]];saveFavorites();renderFavorites()}
}
function restorePrevious(){
 if(!previous){setStatus(tr("previous_empty"),"warn");return}
 const target=previous,current=L.validate(state).state;
 state=L.validate(target).state;savePrevious(current);persistState();render();setStatus(tr("previous_applied"),"ok");
}


function renderContinuity(){
 const current=$("#continuityCurrent"),counts=$("#continuityCounts");
 $("#continuitySensitive").checked=continuitySensitive;
 $("#btnContinuityRequest").disabled=state.private_session;
 $("#continuityImport").hidden=state.private_session;
 if(state.private_session){pendingContinuity=null;$("#continuityPreview").hidden=true;$("#btnContinuityApply").hidden=true;}
 if(!continuity){
  current.textContent=tr("continuity_empty");
  counts.textContent=continuityHistory.length?fmt(tr("continuity_counts"),{topics:0,loops:0,goals:0,recent:0,history:continuityHistory.length}):"";
 }else{
  current.textContent=continuity.summary||tr("continuity_empty");
  const hidden=(!continuitySensitive&&continuity.sensitive_context.length)?(" · "+tr("continuity_hidden_sensitive")+" "+continuity.sensitive_context.length):"";
  counts.textContent=fmt(tr("continuity_counts"),{
   topics:continuity.active_topics.length,loops:continuity.open_loops.length,goals:continuity.goals.length,
   recent:continuity.recent_sessions.length,history:continuityHistory.length
  })+hidden;
 }
 $("#btnContinuityRollback").disabled=continuityHistory.length===0;
}
async function copyContinuityRequest(){
 if(state.private_session){setStatus(tr("continuity_private_disabled"),"warn");return}
 try{
  const request=L.continuityUpdateRequest(sessionContinuity(),continuitySensitive);
  const ok=await copyText(request);
  if(ok){setStatus(tr("continuity_request_copied"),"ok");$("#fallbackWrap").hidden=true}
  else{$("#fallbackWrap").hidden=false;$("#fallbackPrompt").value=request;setStatus(tr("copy_fail"),"warn")}
 }catch(e){setStatus(tr("continuity_invalid"),"error")}
}
function extractContinuityJSON(text){
 const raw=String(text||"");
 if(new TextEncoder().encode(raw).length>MAX_CONTINUITY_INPUT_BYTES)throw new Error("continuity_too_large");
 let s=raw.trim();
 if(s.startsWith("```"))s=s.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
 const a=s.indexOf("{"),b=s.lastIndexOf("}");
 if(a<0||b<=a)throw new Error("continuity_no_json");
 return JSON.parse(s.slice(a,b+1));
}
function inspectContinuity(){
 pendingContinuity=null;$("#btnContinuityApply").hidden=true;$("#continuityPreview").hidden=true;
 try{
  const obj=extractContinuityJSON($("#continuityInput").value);
  const checked=L.validateContinuity(obj,continuitySensitive);
  if(!checked.ok){
   const sensitive=checked.errors.some(x=>String(x).includes("sensitive_not_allowed"));
   setStatus(sensitive?tr("continuity_sensitive_blocked"):tr("continuity_invalid"),"error");
   return;
  }
  pendingContinuity=checked.state;
  const p=$("#continuityPreview");p.replaceChildren();
  const b=document.createElement("b");b.textContent=tr("continuity_preview");
  const s=document.createElement("div");s.textContent=pendingContinuity.summary||"—";
  const c=document.createElement("div");c.className="continuity-counts";
  c.textContent=fmt(tr("continuity_preview_counts"),{
   revision:pendingContinuity.revision,topics:pendingContinuity.active_topics.length,loops:pendingContinuity.open_loops.length,
   goals:pendingContinuity.goals.length,sensitive:pendingContinuity.sensitive_context.length
  });
  p.append(b,s,c);p.hidden=false;$("#btnContinuityApply").hidden=false;
  setStatus(tr("continuity_preview"),"ok");
 }catch(e){setStatus(tr("continuity_invalid"),"error")}
}
function applyContinuity(){
 if(!pendingContinuity){setStatus(tr("continuity_invalid"),"error");return}
 const checked=L.validateContinuity(pendingContinuity,continuitySensitive);
 if(!checked.ok){setStatus(tr("continuity_invalid"),"error");return}
 if(continuity)pushContinuityHistory(continuity);
 continuity=checked.state;pendingContinuity=null;
 $("#continuityInput").value="";$("#continuityPreview").hidden=true;$("#btnContinuityApply").hidden=true;
 if(!saveContinuityStores()){setStatus(tr("storage_unavailable"),"warn");return}
 renderContinuity();setStatus(tr("continuity_saved"),"ok");
}
function rollbackContinuity(){
 if(!continuityHistory.length){setStatus(tr("continuity_rollback_empty"),"warn");return}
 const target=continuityHistory.shift(),current=continuity;
 continuity=target;
 if(current)continuityHistory=[current,...continuityHistory.filter(x=>JSON.stringify(x)!==JSON.stringify(current))].slice(0,5);
 if(!saveContinuityStores()){setStatus(tr("storage_unavailable"),"warn");return}
 renderContinuity();setStatus(tr("continuity_rollback_done"),"ok");
}
function setContinuitySensitive(value){
 continuitySensitive=!!value;
 if(!saveContinuityStores()){setStatus(tr("storage_unavailable"),"warn");return}
 renderContinuity();
}
function clearContinuity(){
 if(!continuityClearArmed){
  continuityClearArmed=true;renderContinuity();setStatus(tr("continuity_clear_arm"),"warn");
  clearTimeout(continuityClearTimer);continuityClearTimer=setTimeout(()=>{continuityClearArmed=false;renderContinuity()},8000);
  return;
 }
 clearTimeout(continuityClearTimer);continuityClearArmed=false;
 continuity=null;continuityHistory=[];pendingContinuity=null;
 $("#continuityInput").value="";$("#continuityPreview").hidden=true;$("#btnContinuityApply").hidden=true;
 try{localStorage.removeItem(CONT_STORE);localStorage.removeItem(CONT_HIST_STORE)}catch(e){}
 renderContinuity();setStatus(tr("continuity_cleared"),"ok");
}

function getPrompt(){if(!personaReady())throw new Error("persona_not_ready");return L.fullPrompt(state,bootstrap,sessionContinuity())}
async function doCopy(){
 try{
  const prompt=getPrompt();
  const ok=await copyText(prompt);
  $("#nextStep").hidden=false;
  if(ok){setStatus(tr("copied")+" "+tr("paste"),"ok");$("#fallbackWrap").hidden=true}
  else{$("#fallbackWrap").hidden=false;$("#fallbackPrompt").value=prompt;setStatus(tr("copy_fail"),"warn")}
  $("#openChatgpt").focus();
 }catch(e){setStatus(e&&e.message==="persona_not_ready"?personaStatusText():tr("unexpected_error"),"error")}
}
function exportSettings(){
 try{
  const bundle={
   bundle_version:"0.9.0",
   settings:L.exportState(state),
   favorites:favorites.map(s=>L.exportState(s)),
   previous:previous?L.exportState(previous):null,
   continuity:continuity,
   continuity_history:continuityHistory.slice(0,5),
   continuity_options:{allow_sensitive:continuitySensitive}
  };
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download="inoo_companion_backup_v0.9.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 }catch(e){setStatus(tr("export_fail"),"error")}
}
async function restore(file){
 try{
  if(!file||file.size>MAX_SETTINGS_FILE_BYTES){setStatus(tr("settings_too_large"),"error");return}
  const obj=JSON.parse(await file.text());
  if(obj&&typeof obj==="object"&&!Array.isArray(obj)&&obj.settings){
   const r=L.safeImport(obj.settings);
   savePrevious(state);state=r.active;
   favorites=sanitizeFavoriteList(obj.favorites||[]);
   previous=obj.previous?L.safeImport(obj.previous).active:previous;
   const restoredSensitive=!!(obj.continuity_options&&obj.continuity_options.allow_sensitive);
   let restoredContinuity=null,restoredHistory=[];
   if(obj.continuity){
    const cv=L.validateContinuity(obj.continuity,true);
    if(!cv.ok)throw new Error("invalid_continuity_backup");
    restoredContinuity=cv.state;
   }
   restoredHistory=sanitizeContinuityHistory(obj.continuity_history||[]);
   continuitySensitive=restoredSensitive;continuity=restoredContinuity;continuityHistory=restoredHistory;
   persistState();saveFavorites();if(previous)savePrevious(previous);saveContinuityStores();render();
   setStatus(tr("restore_ok"),"ok");
  }else{
   const r=L.safeImport(obj);commitState(r.active,true);
   setStatus(Object.keys(r.quarantine).length?tr("restore_ok")+" "+tr("unsupported_ignored"):tr("restore_ok"),"ok");
  }
 }catch(e){setStatus(tr("restore_fail"),"error")}
}
function firstUse(){
 let seen=false;try{seen=localStorage.getItem(FIRST)==="1"}catch(e){}
 if(!seen){$("#firstUse").hidden=false;$("#firstTitle").textContent=tr("first_title");$("#firstBody").textContent=tr("first_body");$("#gotIt").textContent=tr("got_it")}
}
function dismissFirst(){try{localStorage.setItem(FIRST,"1")}catch(e){}$("#firstUse").hidden=true}
function networkStatus(){
 if(!navigator.onLine){
  setStatus(tr("offline"),"warn");
  $("#openChatgpt").setAttribute("aria-disabled","true");
 }else{
  $("#openChatgpt").removeAttribute("aria-disabled");
 }
}
async function checkVersion(){
 try{
  const v=await getJSON("version.json");
  if((v.app_version&&v.app_version!==L.VERSION)||(v.runtime_version&&v.runtime_version!==L.RUNTIME)){$("#updateBar").hidden=false;$("#updateText").textContent=tr("update_ready")}
 }catch(e){/* Version check is non-critical. */}
}
function wire(){
 $$("[data-mode]").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.mode==="random"){randomQuick();return}commitState(L.applyPreset(state,b.dataset.mode),true);setStatus(modeLabel(b.dataset.mode)+" · "+tr("selected"),"ok")}));
 $$("select[data-key]").forEach(s=>s.addEventListener("change",()=>update({[s.dataset.key]:s.value})));
 $("#year_timeslip").addEventListener("change",e=>update({year_timeslip:e.target.value}));
 $("#private_session").addEventListener("change",e=>{update({private_session:e.target.checked});renderContinuity();if(globalThis.dispatchEvent)globalThis.dispatchEvent(new CustomEvent("inoo:lifecycle-changed",{detail:{kind:"private_session_changed"}}));});
 $("#copyBtn").addEventListener("click",doCopy);
 $("#btnSaveFavorite").addEventListener("click",saveFavorite);
 $("#favoritesList").addEventListener("click",e=>handleFavoriteAction(e.target));
 $("#btnContinuityRequest").addEventListener("click",copyContinuityRequest);
 $("#btnContinuityRollback").addEventListener("click",rollbackContinuity);
 $("#continuitySensitive").addEventListener("change",e=>setContinuitySensitive(e.target.checked));
 $("#btnContinuityInspect").addEventListener("click",inspectContinuity);
 $("#btnContinuityApply").addEventListener("click",applyContinuity);
 $("#btnContinuityClear").addEventListener("click",clearContinuity);
 $("#btnPrevious").addEventListener("click",restorePrevious);
 $("#btnBackup").addEventListener("click",exportSettings);
 $("#btnReset").addEventListener("click",()=>{commitState({...L.DEFAULTS},true);setStatus(tr("status_ready"))});
 $("#restoreFile").addEventListener("change",e=>{if(e.target.files[0])restore(e.target.files[0]);e.target.value=""});
 $("#manualCopy").addEventListener("click",async()=>{const ok=await copyText($("#fallbackPrompt").value);setStatus(ok?tr("copied")+" "+tr("paste"):tr("copy_fail"),ok?"ok":"warn")});
 $("#gotIt").addEventListener("click",dismissFirst);
 $("#refreshBtn").addEventListener("click",()=>location.reload());
 $("#openChatgpt").addEventListener("click",e=>{if(!navigator.onLine){e.preventDefault();setStatus(tr("offline"),"warn")}});
 window.addEventListener("online",()=>{networkStatus();setStatus(tr("online"),"ok")});
 window.addEventListener("offline",networkStatus);
 window.addEventListener("error",()=>setStatus(tr("unexpected_error"),"error"));
 window.addEventListener("unhandledrejection",()=>setStatus(tr("unexpected_error"),"error"));
}
function renderStartupFailure(){
 document.body.replaceChildren();
 const main=document.createElement("main");
 main.className="startup-error";
 const h=document.createElement("h1");h.textContent="Inoo Companion";
 const p1=document.createElement("p");p1.textContent="연결이 원활하지 않거나 필수 파일을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.";
 const p2=document.createElement("p");p2.textContent="Could not load required app files. Check your connection and refresh the official HTTPS link.";
 main.append(h,p1,p2);document.body.append(main);
}
try{
 await initData();
}catch(e){
 renderStartupFailure();
 return;
}
if(location.protocol==="file:"){const w=$("#localWarning");w.textContent=tr("local_warn");w.hidden=false}
document.documentElement.classList.add("js-ready");
wire();render();firstUse();networkStatus();setStatus(navigator.onLine?tr("status_ready"):tr("offline"));
window.__InooWebApp={
 getState:()=>({...state}),getFavorites:()=>favorites.map(s=>({...s})),getPrevious:()=>previous?({...previous}):null,
 getContinuity:()=>continuity?JSON.parse(JSON.stringify(continuity)):null,
 getContinuityHistory:()=>continuityHistory.map(s=>JSON.parse(JSON.stringify(s))),
 getPrompt,
 getPromptWithoutContinuity:()=>{if(!personaReady())throw new Error("persona_not_ready");return L.fullPrompt(state,bootstrap,null)},
 getPersonaState:()=>personaState?JSON.parse(JSON.stringify(personaState)):null,
 getPersonaDependency:()=>window.InooIntegrityFoundation.personaDependency(personaState),
 getCapabilityProfile:()=>capabilityProfile?JSON.parse(JSON.stringify(capabilityProfile)):null,
 translations:T,config,safeChatTarget
};
window.dispatchEvent(new CustomEvent("inoo:foundation-ready",{detail:{persona_status:personaState&&personaState.status||"unknown"}}));
decommissionLegacyOfflineRuntime().catch(()=>{/* Legacy offline runtime retirement is best-effort and never touches USER data. */});
checkVersion();
})();
