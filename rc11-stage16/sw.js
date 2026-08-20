"use strict";

// rc11 pre-Stable retirement worker.
// This file intentionally provides no offline/fetch behavior.
// It removes only the known rc10 cache and then unregisters itself.
const LEGACY_CACHE="inoo-companion-v0.9.0";

self.addEventListener("install",()=>{
 self.skipWaiting();
});

self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  try{await caches.delete(LEGACY_CACHE);}catch(_){}
  try{await self.registration.unregister();}catch(_){}
 })());
});
