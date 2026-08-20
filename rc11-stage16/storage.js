(function(global){
"use strict";

const DB_NAME="inoo_companion_user_db";
const DB_LAYOUT_VERSION=1;
const HEAD_KEY="canonical";
const LOCK_NAME="inoo_companion_user_commit";
const PURGE_ROOT_OPERATION_TYPE="canonical_purge";
const STORES=Object.freeze({
  META:"meta",
  SNAPSHOTS:"snapshots",
  HEADS:"heads",
  RECEIPTS:"receipts",
  FEATURE_STATE:"feature_state",
  LIFECYCLE:"lifecycle",
  LEGACY_ARCHIVE:"legacy_archive"
});

function storageError(code,details){
  const e=new Error(code);
  e.code=code;
  if(details!==undefined)e.details=details;
  return e;
}

function requestResult(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||storageError("idb_request_failed"));
  });
}

function transactionDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error||storageError("idb_transaction_aborted"));
    tx.onerror=()=>{/* onabort/oncomplete is the final transaction result */};
  });
}

function openWriteTransaction(db,storeNames){
  try{return db.transaction(storeNames,"readwrite",{durability:"strict"})}
  catch(e){return db.transaction(storeNames,"readwrite")}
}

function openDatabase(){
  if(!global.indexedDB)return Promise.reject(storageError("indexeddb_unavailable"));
  return new Promise((resolve,reject)=>{
    const req=global.indexedDB.open(DB_NAME,DB_LAYOUT_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORES.META))db.createObjectStore(STORES.META,{keyPath:"key"});
      if(!db.objectStoreNames.contains(STORES.SNAPSHOTS))db.createObjectStore(STORES.SNAPSHOTS,{keyPath:"snapshot_id"});
      if(!db.objectStoreNames.contains(STORES.HEADS))db.createObjectStore(STORES.HEADS,{keyPath:"name"});
      if(!db.objectStoreNames.contains(STORES.RECEIPTS))db.createObjectStore(STORES.RECEIPTS,{keyPath:"operation_id"});
      if(!db.objectStoreNames.contains(STORES.FEATURE_STATE))db.createObjectStore(STORES.FEATURE_STATE,{keyPath:"key"});
      if(!db.objectStoreNames.contains(STORES.LIFECYCLE))db.createObjectStore(STORES.LIFECYCLE,{keyPath:"key"});
      if(!db.objectStoreNames.contains(STORES.LEGACY_ARCHIVE))db.createObjectStore(STORES.LEGACY_ARCHIVE,{keyPath:"key"});
    };
    req.onsuccess=()=>{
      const db=req.result;
      db.onversionchange=()=>db.close();
      resolve(db);
    };
    req.onerror=()=>reject(req.error||storageError("indexeddb_open_failed"));
    req.onblocked=()=>reject(storageError("indexeddb_open_blocked"));
  });
}

function validUnicodeString(s){
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    if(c>=0xD800&&c<=0xDBFF){
      if(i+1>=s.length)return false;
      const n=s.charCodeAt(i+1);
      if(n<0xDC00||n>0xDFFF)return false;
      i++;
    }else if(c>=0xDC00&&c<=0xDFFF)return false;
  }
  return true;
}

function canonicalJSONStringify(value){
  function walk(v){
    if(v===null)return "null";
    if(typeof v==="boolean")return v?"true":"false";
    if(typeof v==="number"){
      if(!Number.isFinite(v))throw storageError("canonical_non_finite_number");
      return JSON.stringify(v);
    }
    if(typeof v==="string"){
      if(!validUnicodeString(v))throw storageError("canonical_invalid_unicode");
      return JSON.stringify(v);
    }
    if(Array.isArray(v)){
      const out=[];
      for(let i=0;i<v.length;i++){
        if(!Object.prototype.hasOwnProperty.call(v,i))throw storageError("canonical_sparse_array");
        out.push(walk(v[i]));
      }
      return "["+out.join(",")+"]";
    }
    if(typeof v==="object"){
      const proto=Object.getPrototypeOf(v);
      if(proto!==null){
        const ctor=proto&&proto.constructor;
        if(typeof ctor!=="function"||ctor.name!=="Object")throw storageError("canonical_non_plain_object");
      }
      const keys=Object.keys(v).sort();
      const out=[];
      for(const k of keys){
        if(!validUnicodeString(k))throw storageError("canonical_invalid_unicode_key");
        const item=v[k];
        if(item===undefined||typeof item==="function"||typeof item==="symbol"||typeof item==="bigint")throw storageError("canonical_unsupported_value");
        out.push(JSON.stringify(k)+":"+walk(item));
      }
      return "{"+out.join(",")+"}";
    }
    throw storageError("canonical_unsupported_value");
  }
  return walk(value);
}

async function sha256Hex(value){
  if(!global.crypto||!global.crypto.subtle)throw storageError("webcrypto_unavailable");
  const text=typeof value==="string"?value:canonicalJSONStringify(value);
  const digest=await global.crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}

function newId(prefix){
  if(!global.crypto)throw storageError("crypto_unavailable");
  if(typeof global.crypto.randomUUID==="function")return prefix+global.crypto.randomUUID();
  const a=new Uint8Array(16);global.crypto.getRandomValues(a);
  a[6]=(a[6]&0x0f)|0x40;a[8]=(a[8]&0x3f)|0x80;
  const h=Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
  return prefix+`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function newOperationId(){return newId("op_")}
function newSnapshotId(){return newId("snap_")}
function newLineageId(){return newId("lin_")}
function newReplicaId(){return newId("rep_")}

async function readMeta(db,key){
  const tx=db.transaction([STORES.META],"readonly");
  const row=await requestResult(tx.objectStore(STORES.META).get(key));
  await transactionDone(tx);
  return row?row.value:null;
}

async function getIdentity(db){
  const tx=db.transaction([STORES.META],"readonly");
  const store=tx.objectStore(STORES.META);
  const [lineage,replica]=await Promise.all([
    requestResult(store.get("lineage_id")),requestResult(store.get("replica_id"))
  ]);
  await transactionDone(tx);
  if(!lineage&&!replica)return null;
  if(!lineage||!replica)throw storageError("identity_partial_state");
  return {lineage_id:lineage.value,replica_id:replica.value};
}

async function ensureIdentity(db,{lineageId=null}={}){
  const existing=await getIdentity(db);
  if(existing){
    if(lineageId&&existing.lineage_id!==lineageId)throw storageError("lineage_mismatch");
    return existing;
  }
  const identity={lineage_id:lineageId||newLineageId(),replica_id:newReplicaId()};
  const tx=openWriteTransaction(db,[STORES.META]);
  const store=tx.objectStore(STORES.META);
  store.add({key:"db_layout_version",value:DB_LAYOUT_VERSION});
  store.add({key:"lineage_id",value:identity.lineage_id});
  store.add({key:"replica_id",value:identity.replica_id});
  await transactionDone(tx);
  return identity;
}

async function readHead(db){
  const tx=db.transaction([STORES.HEADS],"readonly");
  const row=await requestResult(tx.objectStore(STORES.HEADS).get(HEAD_KEY));
  await transactionDone(tx);
  return row||null;
}

async function readSnapshot(db,snapshotId){
  const tx=db.transaction([STORES.SNAPSHOTS],"readonly");
  const row=await requestResult(tx.objectStore(STORES.SNAPSHOTS).get(snapshotId));
  await transactionDone(tx);
  return row||null;
}

async function inspectOperation(db,operationId){
  const tx=db.transaction([STORES.RECEIPTS,STORES.HEADS],"readonly");
  const receiptReq=tx.objectStore(STORES.RECEIPTS).get(operationId);
  const headReq=tx.objectStore(STORES.HEADS).get(HEAD_KEY);
  const [receipt,head]=await Promise.all([requestResult(receiptReq),requestResult(headReq)]);
  await transactionDone(tx);
  return {receipt:receipt||null,head:head||null};
}

function assertCommitInput(input){
  if(!input||typeof input!=="object"||Array.isArray(input))throw storageError("commit_invalid_input");
  if(typeof input.operationId!=="string"||!input.operationId)throw storageError("commit_operation_id_required");
  if(typeof input.userSchemaVersion!=="string"||!input.userSchemaVersion)throw storageError("commit_user_schema_required");
  if(typeof input.operationType!=="string"||!input.operationType)throw storageError("commit_operation_type_required");
  if(!Object.prototype.hasOwnProperty.call(input,"expectedHeadSnapshotId"))throw storageError("commit_expected_head_id_required");
  if(!Object.prototype.hasOwnProperty.call(input,"expectedHeadHash"))throw storageError("commit_expected_head_hash_required");
  if((input.expectedHeadSnapshotId!==null&&typeof input.expectedHeadSnapshotId!=="string")||(input.expectedHeadHash!==null&&typeof input.expectedHeadHash!=="string"))throw storageError("commit_expected_head_invalid");
  if(!Number.isInteger(input.purgeEpoch)||input.purgeEpoch<0)throw storageError("commit_purge_epoch_invalid");
  canonicalJSONStringify(input.payload);
  if(input.operationMetadata!==undefined){
    if(!input.operationMetadata||typeof input.operationMetadata!=="object"||Array.isArray(input.operationMetadata))throw storageError("commit_operation_metadata_invalid");
    canonicalJSONStringify(input.operationMetadata);
  }
}

async function prepareSnapshot(input,identity,currentHead,{forceRootParent=false}={}){
  const snapshotId=newSnapshotId();
  const createdAt=new Date().toISOString();
  const revision=currentHead?currentHead.revision+1:1;
  const userPayloadHash=await sha256Hex(input.payload);
  const basis={
    snapshot_id:snapshotId,
    lineage_id:identity.lineage_id,
    replica_id:identity.replica_id,
    parent_snapshot_id:forceRootParent?null:(currentHead?currentHead.snapshot_id:null),
    revision,
    user_schema_version:input.userSchemaVersion,
    user_payload_hash:userPayloadHash,
    operation_id:input.operationId,
    operation_type:input.operationType,
    purge_epoch:input.purgeEpoch,
    created_at:createdAt,
    ...(input.operationMetadata!==undefined?{operation_metadata:input.operationMetadata}:{})
  };
  const snapshotHash=await sha256Hex(basis);
  return {...basis,snapshot_hash:snapshotHash,payload:input.payload};
}

async function commitSnapshotUnlocked(db,input,{forceRootParent=false,requirePurgeRoot=false}={}){
  assertCommitInput(input);
  const identity=await ensureIdentity(db,{lineageId:input.lineageId||null});
  const preHead=await readHead(db);
  if(requirePurgeRoot&&input.operationType!==PURGE_ROOT_OPERATION_TYPE)throw storageError("purge_root_operation_type_invalid");
  const prepared=await prepareSnapshot(input,identity,preHead,{forceRootParent});

  const tx=openWriteTransaction(db,[STORES.RECEIPTS,STORES.HEADS,STORES.SNAPSHOTS]);
  const receipts=tx.objectStore(STORES.RECEIPTS),heads=tx.objectStore(STORES.HEADS),snapshots=tx.objectStore(STORES.SNAPSHOTS);
  const existingReceipt=await requestResult(receipts.get(input.operationId));
  if(existingReceipt){
    tx.abort();
    try{await transactionDone(tx)}catch(e){}
    return {status:"already_committed",receipt:existingReceipt};
  }

  const actualHead=await requestResult(heads.get(HEAD_KEY));
  const actualHeadId=actualHead?actualHead.snapshot_id:null;
  const expectedId=input.expectedHeadSnapshotId;
  const expectedHash=input.expectedHeadHash;
  if(actualHeadId!==expectedId||(actualHead?actualHead.snapshot_hash:null)!==expectedHash){
    tx.abort();
    try{await transactionDone(tx)}catch(e){}
    throw storageError("stale_candidate",{expected_snapshot_id:expectedId,actual_snapshot_id:actualHeadId});
  }
  if(requirePurgeRoot){
    if(!actualHead||input.purgeEpoch!==actualHead.purge_epoch+1){
      tx.abort();
      try{await transactionDone(tx)}catch(e){}
      throw storageError("purge_epoch_increment_required",{current:actualHead?actualHead.purge_epoch:null,requested:input.purgeEpoch});
    }
  }

  // Rebuild if the pre-read HEAD changed before this transaction acquired its snapshot.
  let snapshot=prepared;
  if((preHead?preHead.snapshot_id:null)!==actualHeadId){
    tx.abort();
    try{await transactionDone(tx)}catch(e){}
    throw storageError("stale_candidate",{expected_snapshot_id:preHead?preHead.snapshot_id:null,actual_snapshot_id:actualHeadId});
  }

  snapshots.add(snapshot);
  const head={
    name:HEAD_KEY,
    lineage_id:snapshot.lineage_id,
    snapshot_id:snapshot.snapshot_id,
    snapshot_hash:snapshot.snapshot_hash,
    revision:snapshot.revision,
    purge_epoch:snapshot.purge_epoch,
    updated_at:snapshot.created_at
  };
  heads.put(head);
  const receipt={
    operation_id:input.operationId,
    operation_type:input.operationType,
    status:"committed",
    lineage_id:snapshot.lineage_id,
    snapshot_id:snapshot.snapshot_id,
    snapshot_hash:snapshot.snapshot_hash,
    parent_snapshot_id:snapshot.parent_snapshot_id,
    committed_at:snapshot.created_at,
    ...(snapshot.operation_metadata!==undefined?{operation_metadata:snapshot.operation_metadata}:{})
  };
  receipts.add(receipt);
  await transactionDone(tx);
  return {status:"committed",snapshot,head,receipt};
}

async function withCommitLock(fn){
  if(global.navigator&&global.navigator.locks&&typeof global.navigator.locks.request==="function"){
    return global.navigator.locks.request(LOCK_NAME,{mode:"exclusive"},fn);
  }
  return fn();
}

async function commitSnapshot(db,input){return withCommitLock(()=>commitSnapshotUnlocked(db,input))}
async function commitNewRoot(db,input){return withCommitLock(()=>commitSnapshotUnlocked(db,input,{forceRootParent:true,requirePurgeRoot:true}))}

async function verifyHead(db){
  const head=await readHead(db);
  if(!head)return {ok:true,head:null,snapshot:null};
  const snapshot=await readSnapshot(db,head.snapshot_id);
  if(!snapshot)return {ok:false,code:"head_snapshot_missing",head,snapshot:null};
  if(snapshot.snapshot_hash!==head.snapshot_hash)return {ok:false,code:"head_hash_mismatch",head,snapshot};
  const userPayloadHash=await sha256Hex(snapshot.payload);
  if(userPayloadHash!==snapshot.user_payload_hash)return {ok:false,code:"payload_hash_mismatch",head,snapshot};
  const basis={
    snapshot_id:snapshot.snapshot_id,lineage_id:snapshot.lineage_id,replica_id:snapshot.replica_id,
    parent_snapshot_id:snapshot.parent_snapshot_id,revision:snapshot.revision,user_schema_version:snapshot.user_schema_version,
    user_payload_hash:snapshot.user_payload_hash,operation_id:snapshot.operation_id,operation_type:snapshot.operation_type,
    purge_epoch:snapshot.purge_epoch,created_at:snapshot.created_at,
    ...(snapshot.operation_metadata!==undefined?{operation_metadata:snapshot.operation_metadata}:{})
  };
  const snapshotHash=await sha256Hex(basis);
  if(snapshotHash!==snapshot.snapshot_hash)return {ok:false,code:"snapshot_hash_mismatch",head,snapshot};
  return {ok:true,head,snapshot};
}

function closeDatabase(db){if(db)db.close()}

const api=Object.freeze({
  DB_NAME,DB_LAYOUT_VERSION,STORES,HEAD_KEY,PURGE_ROOT_OPERATION_TYPE,
  openDatabase,closeDatabase,getIdentity,ensureIdentity,readMeta,readHead,readSnapshot,inspectOperation,
  newOperationId,commitSnapshot,commitNewRoot,verifyHead,canonicalJSONStringify,sha256Hex,
  _test:{validUnicodeString}
});

global.InooStorage=api;
})(window);
