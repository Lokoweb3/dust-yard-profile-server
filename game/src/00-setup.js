
(() => {
'use strict';
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const store = {
  get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
};
const isTouch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
if (isTouch) { document.body.classList.add('touch'); $('keysDesk').hidden = true; $('keysTouch').hidden = false; }

