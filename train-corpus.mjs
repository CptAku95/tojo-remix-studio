// Node.js >= 18. Train on locally available, rights-cleared MIDI; no npm dependencies.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import {TextDecoder} from "node:util";
const sandbox={TextDecoder};vm.createContext(sandbox);vm.runInContext(await fs.readFile(new URL("./trainer-core.js",import.meta.url),"utf8"),sandbox);
const T=sandbox.TojoTrainer;
const args=process.argv.slice(2);if(args.length!==3){console.error("Usage: node train-corpus.mjs approved-corpus.json MIDI-directory output-model.json");process.exit(2)}
const [manifest,dir,out]=args;
const list=JSON.parse(await fs.readFile(manifest,"utf8"));
if(!Array.isArray(list))throw Error("Expected array of source records");
const songs=[],audit=[],seen=new Set();let count=0;
for(const item of list){
 const row={file:item.file,source:item.source,license:item.license,genre:item.genre};audit.push(row);
 try{
  if(item.approved!==true||!item.source||!item.license||item.genre!=="eurobeat")throw Error("Not approved Eurobeat material");
  if(typeof item.file!=="string"||path.basename(item.file)!==item.file||!/\.midi?$/i.test(item.file))throw Error("Invalid MIDI filename");
  const f=await fs.readFile(path.join(dir,item.file));if(f.length>8*1024*1024)throw Error("File exceeds 8 MB");
  const hash=crypto.createHash("sha256").update(f).digest("hex");row.sha256=hash;if(seen.has(hash))throw Error("Duplicate");
  const m=T.parseMidi(f.buffer.slice(f.byteOffset,f.byteOffset+f.byteLength));const bars=T.extract(m);
  if(songs.length>=100||count+m.notes.length>300000)throw Error("Trainer v1 corpus limit reached");
  seen.add(hash);count+=m.notes.length;songs.push({bars});Object.assign(row,{status:"accepted",bpm:m.bpm,bars:bars.length,notes:m.notes.length});
 }catch(e){Object.assign(row,{status:"skipped",reason:e.message});}
}
const report={accepted:songs.length,notes:count,files:audit};await fs.writeFile(out+".report.json",JSON.stringify(report,null,2));
if(!songs.length){console.error("No eligible MIDI. Report written; no model trained.");process.exit(1)}
const model=T.train(songs);await fs.writeFile(out,JSON.stringify(model));console.log(JSON.stringify({songs:model.songs,bars:model.bars,notes:model.notes,roles:Object.fromEntries(T.ROLES.map(r=>[r,model.roles[r].events])),output:out},null,2));
