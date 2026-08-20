(function(global){
"use strict";

const FOUNDATION_VERSION="stage17-h04-foundation-1";
const PERSONA_STATUS=Object.freeze({
  READY:"persona_ready",
  UNAVAILABLE:"persona_unavailable",
  INTEGRITY_FAILED:"persona_integrity_failed"
});
const CAPABILITY_STATUS=Object.freeze({
  UNKNOWN:"unknown",
  AVAILABLE:"available",
  UNAVAILABLE:"unavailable",
  USER_DISABLED:"user_disabled"
});
const FEATURE_STATE_CAPABILITY="feature_state:self";
const FEATURE_DESCRIPTOR_KEYS=new Set([
  "feature_id","feature_schema_version","read_capabilities","write_capabilities","migration_owner","state_namespace"
]);
const PERSONA_DESCRIPTOR_KEYS=new Set([
  "persona_package_id","persona_package_version","persona_package_hash_algorithm","persona_package_hash","resource"
]);
const OPTIONAL_CAPABILITIES=new Set(["project_assistance","memory_assistance"]);
const CAPABILITY_VALUES=new Set(Object.values(CAPABILITY_STATUS));
const FORBIDDEN_NAMESPACE=/^(?:PERSONA_DOMAIN|USER_DOMAIN|USER_STATE)(?:$|[.:/])/i;
const SAFE_RELATIVE_RESOURCE=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?!.*\/\/)[A-Za-z0-9._/-]+$/;
const MAX_FEATURE_STATE_BYTES=64*1024;

function foundationError(code,details){
  const e=new Error(code);
  e.code=code;
  if(details!==undefined)e.details=details;
  return e;
}
function isObject(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function nonEmptyString(v){return typeof v==="string"&&v.length>0;}
function validToken(v){return nonEmptyString(v)&&/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(v);}
function requestResult(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||foundationError("idb_request_failed"));
  });
}
function transactionDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||foundationError("idb_transaction_aborted"));
    tx.onerror=()=>{};
  });
}
function assertJsonValue(value,path="$"){
  if(value===null||typeof value==="boolean"||typeof value==="string")return;
  if(typeof value==="number"){
    if(!Number.isFinite(value))throw foundationError("feature_state_non_finite_number",{path});
    return;
  }
  if(Array.isArray(value)){
    for(let i=0;i<value.length;i++){
      if(!Object.prototype.hasOwnProperty.call(value,i))throw foundationError("feature_state_sparse_array",{path,index:i});
      assertJsonValue(value[i],`${path}[${i}]`);
    }
    return;
  }
  if(isObject(value)){
    for(const [key,item] of Object.entries(value)){
      if(item===undefined||typeof item==="function"||typeof item==="symbol"||typeof item==="bigint"){
        throw foundationError("feature_state_unsupported_value",{path:`${path}.${key}`});
      }
      assertJsonValue(item,`${path}.${key}`);
    }
    return;
  }
  throw foundationError("feature_state_unsupported_value",{path});
}
function cloneJson(value){
  assertJsonValue(value);
  return JSON.parse(JSON.stringify(value));
}
function jsonByteLength(value){
  assertJsonValue(value);
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
function exactKeys(obj,allowed,code){
  if(!isObject(obj))throw foundationError(code||"object_required");
  for(const k of Object.keys(obj))if(!allowed.has(k))throw foundationError(code||"unknown_field",{field:k});
}
function uniqueTokens(list,code){
  if(!Array.isArray(list)||!list.every(validToken))throw foundationError(code);
  if(new Set(list).size!==list.length)throw foundationError(code,{reason:"duplicate"});
}
function asBytes(input){
  if(input instanceof Uint8Array)return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  if(input instanceof ArrayBuffer)return new Uint8Array(input);
  if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  throw foundationError("persona_bytes_invalid");
}
async function sha256BytesHex(input){
  if(!global.crypto||!global.crypto.subtle)throw foundationError("webcrypto_unavailable");
  const bytes=asBytes(input);
  const digest=await global.crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
function decodePersonaBytes(input){
  const bytes=asBytes(input);
  try{return new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch(_){throw foundationError("persona_utf8_invalid");}
}

function assertPersonaDescriptor(input){
  exactKeys(input,PERSONA_DESCRIPTOR_KEYS,"persona_descriptor_invalid");
  if(!validToken(input.persona_package_id))throw foundationError("persona_package_id_invalid");
  if(!nonEmptyString(input.persona_package_version))throw foundationError("persona_package_version_invalid");
  if(input.persona_package_hash_algorithm!=="SHA-256")throw foundationError("persona_hash_algorithm_invalid");
  if(typeof input.persona_package_hash!=="string"||!/^[0-9a-f]{64}$/.test(input.persona_package_hash))throw foundationError("persona_hash_invalid");
  if(!nonEmptyString(input.resource)||!SAFE_RELATIVE_RESOURCE.test(input.resource))throw foundationError("persona_resource_invalid");
  return Object.freeze(cloneJson(input));
}

async function verifyPersonaBytes(bytes,descriptor){
  const d=assertPersonaDescriptor(descriptor);
  const actual=await sha256BytesHex(bytes);
  const ok=actual===d.persona_package_hash;
  return Object.freeze({
    status:ok?PERSONA_STATUS.READY:PERSONA_STATUS.INTEGRITY_FAILED,
    descriptor:d,
    persona_package_hash:actual,
    expected_persona_package_hash:d.persona_package_hash,
    reason:ok?null:"persona_hash_mismatch"
  });
}
async function verifyPersonaText(text,descriptor){
  if(typeof text!=="string")throw foundationError("persona_text_invalid");
  return verifyPersonaBytes(new TextEncoder().encode(text),descriptor);
}
function personaUnavailable(descriptor,reason="persona_load_failed"){
  let d=null;
  try{d=assertPersonaDescriptor(descriptor);}catch(_){d=null;}
  return Object.freeze({
    status:PERSONA_STATUS.UNAVAILABLE,
    descriptor:d,
    persona_package_hash:null,
    expected_persona_package_hash:d?d.persona_package_hash:null,
    reason:String(reason||"persona_load_failed")
  });
}
function personaDependency(personaState){
  if(!personaState||personaState.status!==PERSONA_STATUS.READY||!personaState.descriptor)return null;
  return Object.freeze({
    persona_package_id:personaState.descriptor.persona_package_id,
    persona_package_version:personaState.descriptor.persona_package_version,
    persona_package_hash_algorithm:"SHA-256",
    persona_package_hash:personaState.persona_package_hash
  });
}

function createCapabilityProfile(overrides={}){
  if(!isObject(overrides))throw foundationError("capability_profile_invalid");
  for(const key of Object.keys(overrides)){
    if(!OPTIONAL_CAPABILITIES.has(key))throw foundationError("capability_unknown",{capability:key});
    if(!CAPABILITY_VALUES.has(overrides[key]))throw foundationError("capability_status_invalid",{capability:key});
  }
  return Object.freeze({
    manual_copy_paste:CAPABILITY_STATUS.AVAILABLE,
    project_assistance:overrides.project_assistance||CAPABILITY_STATUS.UNKNOWN,
    memory_assistance:overrides.memory_assistance||CAPABILITY_STATUS.UNKNOWN
  });
}
function capabilityDecision(profile,capability){
  if(!profile||profile.manual_copy_paste!==CAPABILITY_STATUS.AVAILABLE)throw foundationError("baseline_capability_missing");
  if(capability==="manual_copy_paste")return Object.freeze({
    capability,
    status:CAPABILITY_STATUS.AVAILABLE,
    baseline_available:true,
    optional_available:false,
    fallback_to_baseline:false
  });
  if(!OPTIONAL_CAPABILITIES.has(capability))throw foundationError("capability_unknown",{capability});
  const status=profile[capability];
  if(!CAPABILITY_VALUES.has(status))throw foundationError("capability_status_invalid",{capability});
  return Object.freeze({
    capability,
    status,
    baseline_available:true,
    optional_available:status===CAPABILITY_STATUS.AVAILABLE,
    fallback_to_baseline:status!==CAPABILITY_STATUS.AVAILABLE
  });
}

function assertFeatureDescriptor(input){
  exactKeys(input,FEATURE_DESCRIPTOR_KEYS,"feature_descriptor_invalid");
  if(!validToken(input.feature_id))throw foundationError("feature_id_invalid");
  if(!validToken(input.feature_schema_version))throw foundationError("feature_schema_version_invalid");
  uniqueTokens(input.read_capabilities,"feature_read_capabilities_invalid");
  uniqueTokens(input.write_capabilities,"feature_write_capabilities_invalid");
  if(!validToken(input.migration_owner))throw foundationError("feature_migration_owner_invalid");
  if(!validToken(input.state_namespace)||FORBIDDEN_NAMESPACE.test(input.state_namespace)){
    throw foundationError("feature_namespace_forbidden",{state_namespace:input.state_namespace});
  }
  return Object.freeze(cloneJson(input));
}

class FeatureRegistry{
  constructor(){this.features=new Map();this.adapters=new Map();}
  registerFeature(input){
    const d=assertFeatureDescriptor(input);
    if(this.features.has(d.feature_id))throw foundationError("feature_duplicate_registration",{feature_id:d.feature_id});
    this.features.set(d.feature_id,d);
    return d;
  }
  getFeature(featureId){
    const d=this.features.get(featureId);
    if(!d)throw foundationError("feature_not_registered",{feature_id:featureId});
    return d;
  }
  listFeatures(){return Object.freeze(Array.from(this.features.values()));}
  registerMigrationAdapter(featureId,fromVersion,toVersion,adapter){
    const d=this.getFeature(featureId);
    if(!validToken(fromVersion)||!validToken(toVersion)||fromVersion===toVersion||typeof adapter!=="function"){
      throw foundationError("feature_adapter_invalid");
    }
    if(!validToken(d.migration_owner))throw foundationError("feature_migration_owner_invalid");
    const key=`${featureId}:${fromVersion}->${toVersion}`;
    if(this.adapters.has(key))throw foundationError("feature_adapter_duplicate",{feature_id:featureId,from_version:fromVersion,to_version:toVersion});
    this.adapters.set(key,Object.freeze({feature_id:featureId,from_version:fromVersion,to_version:toVersion,adapter}));
  }
  migrationChain(featureId,fromVersion,toVersion){
    this.getFeature(featureId);
    if(!validToken(fromVersion)||!validToken(toVersion))throw foundationError("feature_schema_version_invalid");
    if(fromVersion===toVersion)return [];
    const edges=Array.from(this.adapters.values())
      .filter(x=>x.feature_id===featureId)
      .sort((a,b)=>(a.from_version+"->"+a.to_version).localeCompare(b.from_version+"->"+b.to_version));
    const queue=[[fromVersion,[]]],seen=new Set([fromVersion]);
    while(queue.length){
      const [version,path]=queue.shift();
      for(const edge of edges.filter(e=>e.from_version===version)){
        const nextPath=[...path,edge];
        if(edge.to_version===toVersion)return nextPath;
        if(!seen.has(edge.to_version)){
          seen.add(edge.to_version);
          queue.push([edge.to_version,nextPath]);
        }
      }
    }
    throw foundationError("feature_migration_path_missing",{feature_id:featureId,from_version:fromVersion,to_version:toVersion});
  }
  migrateRecord(featureId,record,toVersion){
    if(!isObject(record)||record.feature_id!==featureId||!validToken(record.feature_schema_version))throw foundationError("feature_record_invalid");
    const source=cloneJson(record);
    let current=cloneJson(record);
    const chain=this.migrationChain(featureId,current.feature_schema_version,toVersion);
    for(const edge of chain){
      const next=edge.adapter(cloneJson(current));
      if(!isObject(next)||next.feature_id!==featureId||next.feature_schema_version!==edge.to_version){
        throw foundationError("feature_adapter_output_invalid",{feature_id:featureId,to_version:edge.to_version});
      }
      current=cloneJson(next);
    }
    return Object.freeze({
      source:Object.freeze(source),
      migrated:Object.freeze(current),
      chain:Object.freeze(chain.map(x=>Object.freeze({from_version:x.from_version,to_version:x.to_version})))
    });
  }
}

function assertFeatureWriteAccess(registry,featureId,targetNamespace){
  const d=registry.getFeature(featureId);
  if(typeof targetNamespace!=="string"||FORBIDDEN_NAMESPACE.test(targetNamespace)){
    throw foundationError("feature_namespace_forbidden",{state_namespace:targetNamespace});
  }
  if(targetNamespace!==d.state_namespace){
    throw foundationError("feature_cross_namespace_write_blocked",{feature_id:featureId,target_namespace:targetNamespace});
  }
  if(!d.write_capabilities.includes(FEATURE_STATE_CAPABILITY)){
    throw foundationError("feature_write_capability_missing",{feature_id:featureId});
  }
  return d;
}
function assertFeatureReadAccess(registry,featureId,targetNamespace){
  const d=registry.getFeature(featureId);
  if(typeof targetNamespace!=="string"||FORBIDDEN_NAMESPACE.test(targetNamespace)){
    throw foundationError("feature_namespace_forbidden",{state_namespace:targetNamespace});
  }
  if(targetNamespace!==d.state_namespace){
    throw foundationError("feature_cross_namespace_read_blocked",{feature_id:featureId,target_namespace:targetNamespace});
  }
  if(!d.read_capabilities.includes(FEATURE_STATE_CAPABILITY)){
    throw foundationError("feature_read_capability_missing",{feature_id:featureId});
  }
  return d;
}
function featureRowKey(namespace,stateKey){
  if(!validToken(stateKey))throw foundationError("feature_state_key_invalid");
  return `${namespace}:${stateKey}`;
}
function validateStoredFeatureRow(row,descriptor,stateKey){
  if(!isObject(row)||row.feature_id!==descriptor.feature_id||row.state_namespace!==descriptor.state_namespace||row.state_key!==stateKey){
    throw foundationError("feature_state_namespace_corrupt");
  }
  if(!validToken(row.feature_schema_version))throw foundationError("feature_schema_version_invalid");
  if(row.feature_schema_version!==descriptor.feature_schema_version){
    throw foundationError("feature_schema_migration_required",{
      stored_version:row.feature_schema_version,
      runtime_version:descriptor.feature_schema_version
    });
  }
  assertJsonValue(row.value);
  return row;
}

async function readFeatureState(db,featureId,stateKey,{registry=defaultRegistry,storageApi=global.InooStorage}={}){
  if(!db||typeof db.transaction!=="function")throw foundationError("feature_db_invalid");
  if(!storageApi||!storageApi.STORES||!storageApi.STORES.FEATURE_STATE)throw foundationError("feature_storage_api_unavailable");
  const descriptor=registry.getFeature(featureId);
  assertFeatureReadAccess(registry,featureId,descriptor.state_namespace);
  const tx=db.transaction([storageApi.STORES.FEATURE_STATE],"readonly");
  const row=await requestResult(tx.objectStore(storageApi.STORES.FEATURE_STATE).get(featureRowKey(descriptor.state_namespace,stateKey)));
  await transactionDone(tx);
  if(!row)return null;
  validateStoredFeatureRow(row,descriptor,stateKey);
  return Object.freeze(cloneJson(row));
}
async function writeFeatureState(db,featureId,stateKey,value,{
  registry=defaultRegistry,
  storageApi=global.InooStorage,
  now=()=>new Date().toISOString()
}={}){
  if(!db||typeof db.transaction!=="function")throw foundationError("feature_db_invalid");
  if(!storageApi||!storageApi.STORES||!storageApi.STORES.FEATURE_STATE)throw foundationError("feature_storage_api_unavailable");
  const descriptor=registry.getFeature(featureId);
  assertFeatureWriteAccess(registry,featureId,descriptor.state_namespace);
  const safeValue=cloneJson(value);
  if(jsonByteLength(safeValue)>MAX_FEATURE_STATE_BYTES)throw foundationError("feature_state_too_large",{max_bytes:MAX_FEATURE_STATE_BYTES});
  const key=featureRowKey(descriptor.state_namespace,stateKey);
  const tx=db.transaction([storageApi.STORES.FEATURE_STATE],"readwrite");
  const store=tx.objectStore(storageApi.STORES.FEATURE_STATE);
  const existing=await requestResult(store.get(key));
  if(existing&&existing.feature_schema_version!==descriptor.feature_schema_version){
    tx.abort();
    try{await transactionDone(tx);}catch(_){}
    throw foundationError("feature_schema_migration_required",{
      stored_version:existing.feature_schema_version,
      runtime_version:descriptor.feature_schema_version
    });
  }
  const row={
    key,
    feature_id:featureId,
    feature_schema_version:descriptor.feature_schema_version,
    state_namespace:descriptor.state_namespace,
    state_key:stateKey,
    value:safeValue,
    updated_at:now()
  };
  store.put(row);
  await transactionDone(tx);
  return Object.freeze(cloneJson(row));
}

const defaultRegistry=new FeatureRegistry();
defaultRegistry.registerFeature({
  feature_id:"chatgpt_capability_profile",
  feature_schema_version:"1",
  read_capabilities:[FEATURE_STATE_CAPABILITY],
  write_capabilities:[FEATURE_STATE_CAPABILITY],
  migration_owner:"integrity_foundation",
  state_namespace:"device.chatgpt_capabilities"
});

const api=Object.freeze({
  FOUNDATION_VERSION,
  PERSONA_STATUS,
  CAPABILITY_STATUS,
  FEATURE_STATE_CAPABILITY,
  MAX_FEATURE_STATE_BYTES,
  assertPersonaDescriptor,
  verifyPersonaBytes,
  verifyPersonaText,
  sha256BytesHex,
  decodePersonaBytes,
  personaUnavailable,
  personaDependency,
  createCapabilityProfile,
  capabilityDecision,
  assertFeatureDescriptor,
  FeatureRegistry,
  defaultRegistry,
  assertFeatureWriteAccess,
  assertFeatureReadAccess,
  readFeatureState,
  writeFeatureState,
  _test:Object.freeze({FORBIDDEN_NAMESPACE,SAFE_RELATIVE_RESOURCE,featureRowKey,assertJsonValue,jsonByteLength})
});

global.InooIntegrityFoundation=api;
})(typeof window!=="undefined"?window:globalThis);
