(function(global){
"use strict";

const STATES=Object.freeze({
  EMPTY:"empty",
  MIGRATION_BOOTSTRAP:"migration_bootstrap",
  READY:"ready",
  RECOVERY:"recovery",
  UNAVAILABLE:"unavailable"
});

function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function uiError(code,details){const e=new Error(code);e.code=code;if(details!==undefined)e.details=details;return e;}

async function detectControllerState(db,{
  storageApi=global.InooStorage,
  userStateApi=global.InooUserState
}={}){
  if(!storageApi||typeof storageApi.verifyHead!=="function")return {state:STATES.UNAVAILABLE,reason:"storage_api_unavailable"};
  let v;
  try{v=await storageApi.verifyHead(db)}catch(e){return {state:STATES.UNAVAILABLE,reason:e&&e.code||"verify_failed"};}
  if(!v||!v.ok)return {state:STATES.RECOVERY,reason:v&&v.code||"head_invalid"};
  if(!v.head||!v.snapshot)return {state:STATES.EMPTY,revision:0};

  const payload=v.snapshot.payload;
  if(payload&&payload.state_kind==="legacy_migration_bootstrap"){
    return {state:STATES.MIGRATION_BOOTSTRAP,revision:v.head.revision};
  }
  if(payload&&payload.state_kind==="canonical_user_state"){
    try{
      if(!userStateApi||typeof userStateApi.validateCanonicalState!=="function")throw uiError("user_state_api_unavailable");
      userStateApi.validateCanonicalState(payload);
      return {state:STATES.READY,revision:v.head.revision};
    }catch(e){
      return {state:STATES.RECOVERY,reason:e&&e.code||"canonical_invalid",revision:v.head.revision};
    }
  }
  return {state:STATES.RECOVERY,reason:"unknown_head_payload",revision:v.head.revision};
}

function stateCopy(info){
  if(info.state===STATES.EMPTY)return {
    badge:"미활성",tone:"warn",
    status:"아직 rc11 장기 기억 저장소가 활성화되지 않았습니다. 기존 기록을 검사한 뒤 사용자가 확인해야 이관됩니다.",
    showInit:true,showSession:false,initLabel:"이전 기록 검사"
  };
  if(info.state===STATES.MIGRATION_BOOTSTRAP)return {
    badge:"활성화 대기",tone:"warn",
    status:"이전 기록 이관본은 저장되었습니다. canonical USER state로 바꾸기 전에 한 번 더 내용을 확인해야 합니다.",
    showInit:true,showSession:false,initLabel:"canonical 활성화 검사"
  };
  if(info.state===STATES.READY)return {
    badge:`사용 가능 · rev ${info.revision}`,tone:"ready",
    status:"canonical USER state가 검증되었습니다. 수동 ChatGPT 전송 방식으로 장기 기억 루프를 사용할 수 있습니다.",
    showInit:false,showSession:true,initLabel:""
  };
  if(info.state===STATES.RECOVERY)return {
    badge:"복구 필요",tone:"error",
    status:"저장소 검증에 실패했습니다. 쓰기 작업은 중지하고 복구/내보내기 경로를 사용해야 합니다.",
    showInit:false,showSession:false,initLabel:""
  };
  return {
    badge:"사용 불가",tone:"error",
    status:"이 브라우저에서 장기 기억 저장소를 열 수 없습니다. 기존 rc9 기능에는 영향을 주지 않습니다.",
    showInit:false,showSession:false,initLabel:""
  };
}
function renderDetected(info,root=global.document){
  if(!root)return;
  const c=stateCopy(info);
  const badge=root.getElementById("memoryControllerBadge");
  const status=root.getElementById("memoryControllerStatus");
  const init=root.getElementById("memoryInitArea");
  const session=root.getElementById("memorySessionArea");
  if(badge){badge.textContent=c.badge;badge.dataset.state=c.tone;}
  if(status)status.textContent=c.status;
  if(init)init.hidden=!c.showInit;
  if(session)session.hidden=!c.showSession;
  const initButton=root.getElementById("btnMemoryInitialize");
  if(initButton&&c.initLabel)initButton.textContent=c.initLabel;

  // Once an rc11 HEAD exists, do not leave a second editable long-memory authority in the same UI.
  // Legacy localStorage is preserved in place; only its old editing path is hidden/locked.
  const canonicalAuthority=info.state===STATES.MIGRATION_BOOTSTRAP||info.state===STATES.READY||info.state===STATES.RECOVERY;
  const legacyContinuity=typeof root.querySelector==="function"?root.querySelector(".continuity-section"):null;
  if(legacyContinuity)legacyContinuity.hidden=canonicalAuthority;
  const legacyCopy=root.getElementById("copyBtn");
  if(legacyCopy)legacyCopy.disabled=canonicalAuthority;
}


function flattenPreview(preview){
  const lines=[];
  for(const section of (preview&&preview.sections)||[]){
    lines.push(section.title||section.kind||"확인 항목");
    for(const item of section.items||[])lines.push("• "+String(item));
  }
  for(const notice of (preview&&preview.notices)||[])lines.push("• "+String(notice));
  return lines.join("\n");
}

async function prepareInitialization(db,info,{
  legacyStorage=global.localStorage,
  migrationApi=global.InooMigration,
  userStateApi=global.InooUserState,
  storageApi=global.InooStorage
}={}){
  if(info.state===STATES.EMPTY){
    if(!migrationApi||typeof migrationApi.prepareMigrationPreview!=="function")throw uiError("migration_api_unavailable");
    const preview=await migrationApi.prepareMigrationPreview(legacyStorage,{storageApi});
    return {kind:"migration",preview,can_apply:preview.can_apply===true,apply_label:"확인하고 이전 기록 이관"};
  }
  if(info.state===STATES.MIGRATION_BOOTSTRAP){
    if(!userStateApi||typeof userStateApi.prepareActivationPreview!=="function")throw uiError("user_state_api_unavailable");
    const preview=await userStateApi.prepareActivationPreview(db,{storageApi});
    return {kind:"activation",preview,can_apply:preview.can_apply===true,apply_label:"확인하고 장기 기억 활성화"};
  }
  throw uiError("initialization_not_applicable",{state:info.state});
}

async function commitInitialization(db,pending,{
  legacyStorage=global.localStorage,
  migrationApi=global.InooMigration,
  userStateApi=global.InooUserState,
  storageApi=global.InooStorage,
  approved=false
}={}){
  if(approved!==true)throw uiError("human_approval_required");
  if(!pending||!pending.preview||pending.can_apply!==true)throw uiError("initialization_preview_not_committable");
  if(pending.kind==="migration"){
    const r=await migrationApi.commitMigrationPreview(legacyStorage,db,pending.preview.preview_id);
    return {kind:"migration",result:r};
  }
  if(pending.kind==="activation"){
    const r=await userStateApi.commitActivationPreview(db,pending.preview.preview_id,{storageApi,approved:true});
    return {kind:"activation",result:r};
  }
  throw uiError("initialization_kind_invalid");
}


async function prepareConversationReview(db,packet,responseText,{
  verticalApi=global.InooSessionVerticalSlice,
  storageApi=global.InooStorage,
  userStateApi=global.InooUserState,
  sensitiveOptIn=false
}={}){
  if(!verticalApi)throw uiError("vertical_slice_api_unavailable");
  const parsed=verticalApi.parseChangeSetResponse(responseText);
  if(parsed.no_change)return {no_change:true,preview:null};
  const preview=await verticalApi.prepareCandidateFromConversation(db,packet,parsed.proposal,{storageApi,userStateApi,sensitiveOptIn});
  return {no_change:false,preview};
}

async function commitConversationReview(db,previewId,{
  verticalApi=global.InooSessionVerticalSlice,
  storageApi=global.InooStorage,
  userStateApi=global.InooUserState,
  approved=false,
  sensitiveOptIn=false,
  privateSession=false
}={}){
  if(!verticalApi)throw uiError("vertical_slice_api_unavailable");
  return verticalApi.approveCandidate(db,previewId,{storageApi,userStateApi,approved,sensitiveOptIn,privateSession});
}

function changePreviewText(preview){
  const lines=[];
  for(const section of (preview&&preview.sections)||[]){
    lines.push(section.title||"USER 기억 변경 제안");
    for(const item of section.items||[]){
      const head=`• ${item.action||"CHANGE"} · ${item.memory_type||"memory"}`;
      lines.push(head);
      if(item.content_redacted)lines.push("  민감 내용은 옵트인 전까지 표시하지 않습니다.");
      else{
        if(item.before!==undefined&&item.before!==null)lines.push("  이전: "+String(item.before));
        if(item.after!==undefined&&item.after!==null)lines.push("  이후: "+String(item.after));
      }
    }
  }
  for(const notice of (preview&&preview.notices)||[])lines.push("• "+String(notice));
  return lines.join("\n");
}

function runtimePersonaState(){
  const runtime=global.__InooWebApp;
  if(!runtime||typeof runtime.getPersonaState!=="function")return null;
  try{return runtime.getPersonaState();}catch(_){return null;}
}
function runtimePersonaReady(){
  const state=runtimePersonaState();
  return !!(state&&state.status==="persona_ready");
}

async function copyTransportText(text,navigatorObj=global.navigator){
  if(!text)return false;
  try{
    if(!navigatorObj||!navigatorObj.clipboard||typeof navigatorObj.clipboard.writeText!=="function")return false;
    await navigatorObj.clipboard.writeText(text);
    return true;
  }catch(e){return false;}
}

async function initControllerUI(){
  if(!global.document||!global.document.getElementById("memoryController"))return null;
  if(!global.InooStorage){renderDetected({state:STATES.UNAVAILABLE});return null;}

  let db=null,info=null,pendingInit=null,sessionPacket=null,pendingChange=null,foundationSignalPending=false;
  const root=global.document;
  const onFoundationReady=()=>{
    foundationSignalPending=true;
    if(db)refresh().catch(()=>{});
  };
  if(global.addEventListener)global.addEventListener("inoo:foundation-ready",onFoundationReady,{once:true});
  const status=root.getElementById("memoryControllerStatus");
  const initPreview=root.getElementById("memoryInitPreview");
  const prepButton=root.getElementById("btnMemoryInitialize");
  const initApply=root.getElementById("btnMemoryInitializeApply");

  const sessionCopy=root.getElementById("btnMemorySessionCopy");
  const updateRequest=root.getElementById("btnMemoryUpdateRequest");
  const transportText=root.getElementById("memoryTransportText");
  const responseInput=root.getElementById("memoryResponseInput");
  const inspectButton=root.getElementById("btnMemoryInspect");
  const sensitiveOpt=root.getElementById("memorySensitiveOptIn");
  const changePreview=root.getElementById("memoryChangePreview");
  const memoryApply=root.getElementById("btnMemoryApply");

  function clearConversationState(){
    if(pendingChange&&pendingChange.preview&&global.InooUserState&&typeof global.InooUserState.discardPreview==="function"){
      try{global.InooUserState.discardPreview(pendingChange.preview.preview_id)}catch(_){}
    }
    sessionPacket=null;pendingChange=null;
    if(updateRequest)updateRequest.disabled=true;
    if(responseInput){responseInput.value="";responseInput.disabled=true;responseInput.readOnly=true;}
    if(inspectButton)inspectButton.disabled=true;
    if(sensitiveOpt){sensitiveOpt.checked=false;sensitiveOpt.disabled=true;}
    if(changePreview){changePreview.hidden=true;changePreview.textContent="";}
    if(memoryApply)memoryApply.hidden=true;
    if(transportText){transportText.hidden=true;transportText.value="";}
  }

  if(global.addEventListener)global.addEventListener("inoo:canonical-recovery-committed",()=>{
    clearConversationState();
    refresh().catch(()=>{});
  });

  async function refresh(){
    info=await detectControllerState(db);
    renderDetected(info,root);
    pendingInit=null;
    if(initPreview){initPreview.hidden=true;initPreview.textContent="";}
    if(initApply)initApply.hidden=true;
    if(info.state!==STATES.READY)clearConversationState();
    else if(sessionCopy)sessionCopy.disabled=!runtimePersonaReady();
    return info;
  }

  async function inspectResponse(){
    if(!sessionPacket)throw uiError("session_packet_missing");
    if(!responseInput||!responseInput.value.trim())throw uiError("changeset_response_empty");
    if(pendingChange&&pendingChange.preview&&global.InooUserState&&typeof global.InooUserState.discardPreview==="function"){
      try{global.InooUserState.discardPreview(pendingChange.preview.preview_id)}catch(_){}
    }
    pendingChange=await prepareConversationReview(db,sessionPacket,responseInput.value,{
      sensitiveOptIn:!!(sensitiveOpt&&sensitiveOpt.checked)
    });
    if(pendingChange.no_change){
      if(changePreview){changePreview.textContent="저장할 장기 기억 변경이 없습니다.";changePreview.hidden=false;}
      if(memoryApply)memoryApply.hidden=true;
      if(status)status.textContent="ChatGPT가 장기 기억 변경 없음으로 응답했습니다. 저장 작업은 없습니다.";
      return pendingChange;
    }
    if(changePreview){changePreview.textContent=changePreviewText(pendingChange.preview);changePreview.hidden=false;}
    if(memoryApply){
      memoryApply.hidden=false;
      memoryApply.disabled=pendingChange.preview.can_apply!==true;
    }
    if(status)status.textContent=pendingChange.preview.can_apply?
      "before/after 내용을 확인한 뒤 승인해야만 저장됩니다.":
      "현재 Preview는 적용 조건을 충족하지 못했습니다. 민감 항목이면 명시적 옵트인이 필요합니다.";
    return pendingChange;
  }

  try{
    db=await global.InooStorage.openDatabase();
    await refresh();
    if(foundationSignalPending)await refresh();
  }catch(e){
    renderDetected({state:STATES.UNAVAILABLE,reason:e&&e.code||String(e)},root);
    try{if(db)global.InooStorage.closeDatabase(db)}catch(_){}
    return null;
  }

  if(prepButton){
    prepButton.addEventListener("click",async()=>{
      prepButton.disabled=true;
      try{
        pendingInit=await prepareInitialization(db,info);
        if(initPreview){initPreview.textContent=flattenPreview(pendingInit.preview);initPreview.hidden=false;}
        if(initApply){
          initApply.textContent=pendingInit.apply_label;
          initApply.hidden=false;
          initApply.disabled=!pendingInit.can_apply;
        }
        if(status)status.textContent=pendingInit.can_apply?
          "Preview를 확인한 뒤 승인 버튼을 눌러야만 저장됩니다.":
          "이 Preview는 자동 적용 조건을 충족하지 못했습니다. 저장하지 않습니다.";
      }catch(e){
        pendingInit=null;
        if(status)status.textContent="검사 중 오류가 발생했습니다. 저장 작업은 실행되지 않았습니다.";
        if(initApply)initApply.hidden=true;
      }finally{prepButton.disabled=false;}
    });
  }

  if(initApply){
    initApply.addEventListener("click",async()=>{
      initApply.disabled=true;
      try{
        const committed=await commitInitialization(db,pendingInit,{approved:true});
        const r=committed.result;
        if(!r||r.status!=="SUCCESS"){
          if(status)status.textContent="커밋 결과를 확정할 수 없습니다. 자동으로 다음 단계를 진행하지 않습니다.";
          return;
        }
        await refresh();
        if(status){
          status.textContent=committed.kind==="migration"?
            "이전 기록 이관이 확인되었습니다. 이제 canonical 활성화를 별도로 검사하고 승인하세요.":
            "장기 기억 활성화가 완료되었습니다. 이제 세션용 기억 루프를 사용할 수 있습니다.";
        }
      }catch(e){
        if(status)status.textContent="저장 중 오류가 발생했습니다. 상태를 다시 확인하기 전에는 재시도하지 마세요.";
      }finally{
        if(!initApply.hidden)initApply.disabled=false;
      }
    });
  }

  if(sessionCopy){
    sessionCopy.addEventListener("click",async()=>{
      sessionCopy.disabled=true;
      try{
        if(info.state!==STATES.READY)throw uiError("canonical_state_not_ready");
        if(!runtimePersonaReady())throw uiError("persona_not_ready");
        const runtime=global.__InooWebApp;
        if(!runtime||typeof runtime.getPromptWithoutContinuity!=="function"||typeof runtime.getState!=="function")throw uiError("runtime_prompt_unavailable");
        const currentState=runtime.getState();
        sessionPacket=await global.InooSessionVerticalSlice.buildSessionPacket(db,{
          privateSession:!!currentState.private_session
        });
        const prompt=global.InooSessionVerticalSlice.buildManualChatGPTPrompt(sessionPacket,{
          personaText:runtime.getPromptWithoutContinuity()
        });
        const copied=await copyTransportText(prompt);
        if(transportText){transportText.value=prompt;transportText.hidden=copied;}
        const nextStep=root.getElementById("nextStep");if(nextStep)nextStep.hidden=false;
        if(sessionPacket.private_session){
          if(updateRequest)updateRequest.disabled=true;
          if(status)status.textContent=copied?
            "Private Session 프롬프트를 복사했습니다. 이 세션에서는 장기 기억 저장을 제안하지 않습니다.":
            "자동 복사가 실패했습니다. 표시된 텍스트를 직접 복사하세요. Private Session에서는 장기 기억 저장을 제안하지 않습니다.";
        }else{
          if(updateRequest)updateRequest.disabled=false;
          if(status)status.textContent=copied?
            "세션 프롬프트를 복사했습니다. ChatGPT에 붙여넣어 대화하세요.":
            "자동 복사가 실패했습니다. 표시된 텍스트를 직접 복사하세요.";
        }
      }catch(e){
        sessionPacket=null;
        if(status)status.textContent=e&&e.code==="persona_not_ready"?
          "Persona 무결성/로드 상태가 준비되지 않아 대화 프롬프트 생성을 중지했습니다. USER 데이터는 변경하지 않습니다.":
          "세션 프롬프트를 만들 수 없습니다. 저장소 상태를 다시 확인하세요.";
      }finally{sessionCopy.disabled=info.state!==STATES.READY||!runtimePersonaReady();}
    });
  }

  if(updateRequest){
    updateRequest.addEventListener("click",async()=>{
      try{
        if(!sessionPacket||sessionPacket.private_session)throw uiError("session_packet_missing");
        const request=global.InooSessionVerticalSlice.buildChangeSetRequestText(sessionPacket);
        const copied=await copyTransportText(request);
        if(transportText){transportText.value=request;transportText.hidden=copied;}
        if(responseInput){responseInput.disabled=false;responseInput.readOnly=false;}
        if(inspectButton)inspectButton.disabled=false;
        if(sensitiveOpt)sensitiveOpt.disabled=false;
        if(status)status.textContent=copied?
          "기억 정리 요청을 복사했습니다. 같은 ChatGPT 대화에 붙여넣고 JSON 응답을 아래에 붙여넣으세요.":
          "자동 복사가 실패했습니다. 표시된 요청을 직접 복사한 뒤 JSON 응답을 아래에 붙여넣으세요.";
      }catch(e){
        if(status)status.textContent="먼저 이 세션의 프롬프트를 만들어야 합니다.";
      }
    });
  }

  if(inspectButton){
    inspectButton.addEventListener("click",async()=>{
      inspectButton.disabled=true;
      try{await inspectResponse();}
      catch(e){
        pendingChange=null;
        if(changePreview){changePreview.hidden=true;changePreview.textContent="";}
        if(memoryApply)memoryApply.hidden=true;
        if(status)status.textContent=e&&e.code==="stale_candidate"?
          "기억 기준점이 바뀌었습니다. 새 세션 프롬프트부터 다시 만들어 주세요.":
          "응답 형식 또는 기억 변경 제안을 검증하지 못했습니다. 저장하지 않습니다.";
      }finally{inspectButton.disabled=false;}
    });
  }

  if(sensitiveOpt){
    sensitiveOpt.addEventListener("change",async()=>{
      if(!sessionPacket||!responseInput||!responseInput.value.trim())return;
      try{await inspectResponse();}
      catch(e){
        pendingChange=null;
        if(memoryApply)memoryApply.hidden=true;
        if(changePreview){changePreview.hidden=true;changePreview.textContent="";}
      }
    });
  }

  if(memoryApply){
    memoryApply.addEventListener("click",async()=>{
      memoryApply.disabled=true;
      try{
        if(!pendingChange||pendingChange.no_change||!pendingChange.preview)throw uiError("change_preview_missing");
        const r=await commitConversationReview(db,pendingChange.preview.preview_id,{
          approved:true,
          sensitiveOptIn:!!(sensitiveOpt&&sensitiveOpt.checked),
          privateSession:!!(sessionPacket&&sessionPacket.private_session)
        });
        if(!r||r.status!=="SUCCESS"){
          if(status)status.textContent="커밋 결과를 확정할 수 없습니다. 같은 변경을 바로 재시도하지 마세요.";
          return;
        }
        clearConversationState();
        await refresh();
        if(status)status.textContent="장기 기억 저장을 확인했습니다. 다음 세션부터 새 기억이 반영됩니다.";
      }catch(e){
        if(status)status.textContent=e&&e.code==="stale_candidate"?
          "기억 기준점이 바뀌어 저장하지 않았습니다. 새 세션부터 다시 진행하세요.":
          "기억 저장에 실패했습니다. 기존 HEAD 상태를 다시 확인하기 전에는 재시도하지 마세요.";
      }finally{
        if(!memoryApply.hidden)memoryApply.disabled=false;
      }
    });
  }

  return {db,getInfo:()=>info,refresh};
}
const api=Object.freeze({STATES,detectControllerState,stateCopy,renderDetected,flattenPreview,prepareInitialization,commitInitialization,prepareConversationReview,commitConversationReview,changePreviewText,copyTransportText,initControllerUI});
global.InooControllerUI=api;

if(global.document){
  if(global.document.readyState==="loading")global.document.addEventListener("DOMContentLoaded",()=>{initControllerUI();},{once:true});
  else initControllerUI();
}
})(typeof window!=="undefined"?window:globalThis);
