import test from "node:test";
import assert from "node:assert/strict";
import { validateUploadBatch, bindUploadDropzone, isFileTransfer } from "../admin/upload-dropzone.js";

const photo = {name:"image.jpg", type:"image/jpeg", size:1200};
test("upload batches reject mixed invalid inputs before preparation", () => {
  validateUploadBatch([photo, {...photo,type:"image/png"}]);
  assert.throws(() => validateUploadBatch([]), /文件夹/);
  assert.throws(() => validateUploadBatch(Array(21).fill(photo)), /20/);
  assert.throws(() => validateUploadBatch([photo,{...photo,type:"text/plain",name:"notes.txt"}]), /notes.txt/);
  assert.throws(() => validateUploadBatch([{...photo,size:25*1024*1024+1}]), /25 MB/);
  assert.throws(() => validateUploadBatch([{...photo,size:0}]), /非空/);
});

function fixture() {
  const root = new EventTarget(), classes = new Set();
  let busy=false, hidden=false;
  const inside = {}, nested = {}, outside = {};
  const zone = {contains:target=>target===inside||target===nested, closest:()=>hidden?{}:null,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
  const received=[], errors=[];
  bindUploadDropzone(root,{getZone:()=>zone,isBusy:()=>busy,onFiles:files=>received.push(files),onError:error=>errors.push(error)});
  function dispatch(type,target=inside,transfer={types:["Files"],files:[photo]}) {
    const event=new Event(type,{cancelable:true});
    Object.defineProperties(event,{target:{value:target},dataTransfer:{value:transfer}});
    root.dispatchEvent(event); return event;
  }
  return {dispatch,inside,nested,outside,received,errors,classes,setBusy:value=>busy=value,setHidden:value=>hidden=value};
}
test("nested drag events keep the highlight and deliver dropped files once", () => {
  const f=fixture();
  f.dispatch("dragenter"); f.dispatch("dragenter",f.nested); f.dispatch("dragleave",f.nested);
  assert.ok(f.classes.has("is-over"));
  const drop=f.dispatch("drop");
  assert.ok(drop.defaultPrevented);
  assert.deepEqual(f.received,[[photo]]);
  assert.equal(f.classes.size,0);
});
test("outside, hidden and busy drops cannot navigate away or start processing", () => {
  const f=fixture();
  assert.ok(f.dispatch("drop",f.outside).defaultPrevented);
  f.setBusy(true); f.dispatch("drop");
  f.setBusy(false); f.setHidden(true); f.dispatch("drop");
  assert.equal(f.received.length,0);
  const transfer={types:["Files"],files:[photo]};
  f.dispatch("dragover",f.outside,transfer);
  assert.equal(transfer.dropEffect,"none");
});
test("folder drops report a useful error and text drags are left alone", () => {
  const f=fixture();
  f.dispatch("drop",f.inside,{types:["Files"],files:[],items:[{webkitGetAsEntry:()=>({isDirectory:true})}]});
  assert.match(f.errors[0],/文件夹/); assert.equal(f.received.length,0);
  assert.equal(f.dispatch("drop",f.inside,{types:["text/plain"],files:[]}).defaultPrevented,false);
  assert.equal(isFileTransfer(null),false);
});
