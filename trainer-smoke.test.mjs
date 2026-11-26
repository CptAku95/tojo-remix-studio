import test from "node:test";import assert from "node:assert/strict";import "./trainer-core.js";
test("MIDI parse, train and transpose (synthetic fixture; not corpus)",()=>{
 const b=new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,15,0,192,33,0,144,36,100,96,128,36,0,0,255,47,0]);
 const T=globalThis.TojoTrainer,m=T.parseMidi(b.buffer),model=T.train([{bars:T.extract(m)}]),events=T.generate(model,[0,5],42);
 assert.equal(m.notes.length,1);assert.equal(model.roles.bass.events,1);assert.deepEqual(events.map(e=>e.pitch),[36,41]);
});
