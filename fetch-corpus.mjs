import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const [manifest,dir,reportPath]=process.argv.slice(2);
const rows=JSON.parse(await fs.readFile(manifest,"utf8"));
if(!Array.isArray(rows)||rows.length>100)throw Error("Expected up to 100 records");
await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.dirname(reportPath),{recursive:true});
const report={downloaded:0,files:[]},seen=new Set();
for(const row of rows){
 const rec={file:row.file,source:row.source};report.files.push(rec);
 try{
  if(row.approved!==true||row.genre!=="eurobeat"||!row.license||!row.source)throw Error("Unapproved source");
  if(typeof row.file!=="string"||!/^[\w.-]+\.midi?$/i.test(row.file)||seen.has(row.file))throw Error("Invalid or duplicate filename");
  const url=new URL(row.download);if(url.protocol!=="https:"||url.username||url.password)throw Error("HTTPS URL required");
  if(!/^[a-f0-9]{64}$/i.test(row.sha256||""))throw Error("Pinned SHA-256 required");
  seen.add(row.file);
  const res=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(20000)});
  if(!res.ok||!res.body)throw Error("HTTP "+res.status);
  const chunks=[];let size=0;for await(const chunk of res.body){size+=chunk.length;if(size>8*1024*1024)throw Error("File exceeds 8 MB");chunks.push(chunk)}
  const data=Buffer.concat(chunks);if(data.subarray(0,4).toString()!=="MThd")throw Error("Not a MIDI file");
  const hash=crypto.createHash("sha256").update(data).digest("hex");if(hash!==row.sha256.toLowerCase())throw Error("Hash mismatch");
  await fs.writeFile(path.join(dir,row.file),data,{flag:"wx"});report.downloaded++;Object.assign(rec,{status:"downloaded",sha256:hash,bytes:size});
 }catch(e){Object.assign(rec,{status:"skipped",reason:e.message});}
}
await fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
