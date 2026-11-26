// Local sample bank; original recordings, no network requests during rendering.
const SR=44100,DECODE_CACHE_BYTES=48*1024*1024;
export const pitched=new Set(["fm","brass","pluck","pad","bell","lead","supersaw","arp","guitar","bass-guitar","orchestral-hit"]);
const kinds=new Set(["kick","snare","clap","closed","open","crash","tom","ride","rim","percussion","fx","riser","sweep","guitar-fx","vocal-fx","loop",...pitched]);
export const eventKind=kind=>({lead:"brass",supersaw:"brass",guitar:"brass","orchestral-hit":"brass",arp:"pluck","bass-guitar":"fm",ride:"open",rim:"snare",percussion:"tom",fx:"crash",riser:"crash",sweep:"crash","guitar-fx":"crash","vocal-fx":"crash",loop:null})[kind]??(kind==="loop"?null:kind);
const log=s=>window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:"SoundBank: "+s}));
const bytes64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function to64(a){let s="";for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);}
const valid=(a,f)=>a.length>44&&(f==="wav"?String.fromCharCode(...a.subarray(0,4))==="RIFF"&&String.fromCharCode(...a.subarray(8,12))==="WAVE":f==="flac"?String.fromCharCode(...a.subarray(0,4))==="fLaC":f==="aiff"&&String.fromCharCode(...a.subarray(0,4))==="FORM"&&["AIFF","AIFC"].includes(String.fromCharCode(...a.subarray(8,12))));
export function selectSample(samples,kind,pitch,preset="classic",overrides={},velocity=.7,time=0){
 const pick=samples.find(x=>x.id===overrides[kind]&&eventKind(x.kind)===kind);
 const target=pick?.kind||kind, tonal=pitched.has(target)||target==="tom";
 let list=samples.filter(x=>x.kind===target);if(!list.length)return null;
 if(pick&&!tonal&&!pick.variantGroup)return pick;
 const melodic={fm:"tx81z-lately",brass:"dx7-brass",pluck:"surge-bass-lead"};
 const preferred=pick?(pick.family||"legacy"):melodic[kind]||(tonal&&target!=="tom"?"legacy":preset==="dark"?"fsa-distkit":preset==="race"?"fsa-x0xproc1":"tr909");
 const family=list.filter(x=>(x.family||"legacy")===preferred);if(family.length)list=family;
 if(pick?.variantGroup){const variants=list.filter(x=>x.variantGroup===pick.variantGroup);if(variants.length)list=variants;}
 if(tonal){const closest=Math.min(...list.map(x=>Math.abs((x.root??pitch)-pitch)));list=list.filter(x=>Math.abs((x.root??pitch)-pitch)===closest);}
 const layers=[...new Set(list.map(x=>x.velocityLayer).filter(Number.isFinite))].sort((a,b)=>a-b);
 if(layers.length){const layer=layers[Math.round(Math.max(0,Math.min(1,velocity))*(layers.length-1))];list=list.filter(x=>x.velocityLayer===layer);}
 if(list.some(x=>Number.isFinite(x.roundRobin)))return list[Math.floor(Math.abs(time)*997)%list.length];
 if(tonal||pick)return list[0];
 return preset==="race"&&list.length>1?list[1]:list[0];
}
export function addSample(bus,e,sample,offset,length){
 const a=sample.channels[0],b=sample.channels[1]||a,rate=(sample.sampleRate||SR)/SR*(pitched.has(e.kind)?2**((e.pitch-sample.root)/12):1);
 const n=Math.min(length-offset,Math.round(e.duration*SR),Math.floor((a.length-1)/rate)+1);if(n<=0)return false;
 const l=Math.sqrt((1-e.pan)/2)*e.velocity,r=Math.sqrt((1+e.pan)/2)*e.velocity,release=Math.min(Math.round(SR*(pitched.has(e.kind)?.023:.009)),Math.floor(n/3)),attack=Math.min(Math.round(SR*(pitched.has(e.kind)?.002:.00035)),Math.floor(n/3)),scale=sample.scale??1;
 for(let i=0;i<n;i++){const p=i*rate,j=Math.floor(p),f=p-j,k=Math.min(j+1,a.length-1),env=Math.min(1,(i+1)/Math.max(1,attack),(n-i)/Math.max(1,release));bus[0][offset+i]+=(a[j]+(a[k]-a[j])*f)*l*env*scale;bus[1][offset+i]+=(b[j]+(b[k]-b[j])*f)*r*env*scale;}return true;
}
export class SoundBank{
 constructor(samples,name="TOJO SoundBank v1"){
  if(!Array.isArray(samples)||!samples.length)throw Error("Nieprawidłowa liczba próbek");
  const seen=new Set();
  for(const x of samples){if(!x||typeof x.id!=="string"||!x.id||seen.has(x.id)||!kinds.has(x.kind)||!["wav","flac","aiff"].includes(x.format)||typeof x.data!=="string"||(pitched.has(x.kind)&&(!Number.isFinite(x.root)||x.root<0||x.root>127)))throw Error("Nieprawidłowy wpis biblioteki");seen.add(x.id);}
  this.samples=samples;this.name=name;this.cache=new Map();this.cacheSizes=new Map();this.cacheBytes=0;this.overrides={};this.ctx=null;this.failures=new Set();
 }
 async decode(x){
  if(this.cache.has(x.id)){const p=this.cache.get(x.id);this.cache.delete(x.id);this.cache.set(x.id,p);return p;}
  if(!this.cache.has(x.id))this.cache.set(x.id,(async()=>{const a=bytes64(x.data);if(!valid(a,x.format))throw Error("Uszkodzony plik");
   this.ctx??=new OfflineAudioContext(2,1,SR);const b=await this.ctx.decodeAudioData(a.buffer);
   if(!b.length)throw Error("Nieprawidłowa długość");
   const channels=[b.getChannelData(0),b.getChannelData(Math.min(1,b.numberOfChannels-1))];let peak=0;
   for(const c of channels)for(const v of c)peak=Math.max(peak,Math.abs(v));if(peak<1e-6)throw Error("Pusta próbka");
   const bytes=channels.reduce((sum,c)=>sum+c.byteLength,0);
   this.cacheSizes.set(x.id,bytes);this.cacheBytes+=bytes;
   for(const id of this.cache.keys()){if(this.cacheBytes<=DECODE_CACHE_BYTES)break;if(id===x.id||!this.cacheSizes.has(id))continue;this.cacheBytes-=this.cacheSizes.get(id);this.cacheSizes.delete(id);this.cache.delete(id);}
   if(bytes>DECODE_CACHE_BYTES){this.cache.delete(x.id);this.cacheSizes.delete(x.id);this.cacheBytes-=bytes;}
   return {channels,sampleRate:b.sampleRate,root:x.root,scale:Math.min(4,.9/peak),id:x.id};
  })().catch(e=>{if(!this.failures.has(x.id)){this.failures.add(x.id);log(x.id+" - "+e.message);}return null;}));return this.cache.get(x.id);
 }
 async playEvent(bus,e,offset,length,preset){
  const x=selectSample(this.samples,e.kind,e.pitch,preset,this.overrides,e.velocity,e.time);if(!x)return false;
  const sample=await this.decode(x);if(!sample)return false;let event={...e,kind:x.kind};if(x.kind==="riser"&&offset>0){const n=Math.min(offset,Math.round(SR*2),sample.channels[0].length);offset-=n;event.duration=n/SR;}const result=addSample(bus,event,sample,offset,length);
  if(e.kind==="clap"){const snare=selectSample(this.samples,"snare",0,preset,this.overrides);if(snare){const d=await this.decode(snare);if(d)addSample(bus,{...e,kind:"snare",velocity:e.velocity*.58},d,offset,length);}}return result;
 }
 addSamples(samples){const seen=new Set(this.samples.map(x=>x.id));const fresh=samples.filter(x=>!seen.has(x.id));if(!fresh.length)return 0;const validated=new SoundBank(fresh);for(const x of validated.samples)this.samples.push(x);return fresh.length;}
 preview(id){const x=this.samples.find(x=>x.id===id);if(!x)throw Error("Brak próbki");return new Blob([bytes64(x.data)],{type:x.format==="wav"?"audio/wav":x.format==="aiff"?"audio/aiff":"audio/flac"});}
 exportZip(){
  const manifest={version:1,name:this.name,samples:this.samples.map(({data,...x},i)=>({...x,file:"samples/"+String(i+1).padStart(3,"0")+"."+x.format}))};
  const enc=new TextEncoder(),entries=[{name:"manifest.json",data:enc.encode(JSON.stringify(manifest,null,2))}];
  this.samples.forEach((x,i)=>entries.push({name:manifest.samples[i].file,data:bytes64(x.data)}));
  entries.push({name:"LICENSES.txt",data:enc.encode(this.samples.map(x=>x.id+" | "+x.license+" | "+x.credit+" | "+x.source).join("\n")+"\nhttps://creativecommons.org/publicdomain/zero/1.0/\n")});return new Blob([writeZip(entries)],{type:"application/zip"});
 }
 static async fromZip(file){
  const files=readZip(new Uint8Array(await file.arrayBuffer())),m=JSON.parse(new TextDecoder().decode(files.get("manifest.json")||new Uint8Array()));
  if(m.version!==1||!Array.isArray(m.samples)||!m.samples.length)throw Error("Nieprawidłowy manifest");
  return new SoundBank(m.samples.map(x=>{const a=files.get(x.file);if(!a||!valid(a,x.format))throw Error("Brakuje poprawnego pliku "+x.file);return {...x,data:to64(a)};}),String(m.name||file.name));
 }
}
let builtinPromise=null;
export function builtinBank(){
 if(!builtinPromise)builtinPromise=(async()=>{const all=[];for(const load of [()=>import("./soundbank/bass.js"),()=>import("./soundbank/bell.js"),()=>import("./soundbank/brass.js"),()=>import("./soundbank/drums.js"),()=>import("./soundbank/exp-dx7-brass-0.js"),()=>import("./soundbank/exp-dx7-brass-more-0.js"),()=>import("./soundbank/exp-dx7-brass-more-1.js"),()=>import("./soundbank/exp-dx7-brass-more-2.js"),()=>import("./soundbank/exp-fsa-a-0.js"),()=>import("./soundbank/exp-fsa-a-1.js"),()=>import("./soundbank/exp-fsa-a-2.js"),()=>import("./soundbank/exp-fsa-a-3.js"),()=>import("./soundbank/exp-fsa-a-4.js"),()=>import("./soundbank/exp-fsa-b-0.js"),()=>import("./soundbank/exp-fsa-b-1.js"),()=>import("./soundbank/exp-fsa-b-2.js"),()=>import("./soundbank/exp-fsa-c-0.js"),()=>import("./soundbank/exp-fsa-c-1.js"),()=>import("./soundbank/exp-fsa-c-2.js"),()=>import("./soundbank/exp-fsa-c-3.js"),()=>import("./soundbank/exp-fsa-d-0.js"),()=>import("./soundbank/exp-fsa-d-1.js"),()=>import("./soundbank/exp-fsa-d-2.js"),()=>import("./soundbank/exp-fsa-d-3.js"),()=>import("./soundbank/exp-retro-0.js"),()=>import("./soundbank/exp-retro-1.js"),()=>import("./soundbank/exp-surge-bass-lead-0.js"),()=>import("./soundbank/exp-surge-bass-lead-1.js"),()=>import("./soundbank/exp-surge-bass-lead-more-0.js"),()=>import("./soundbank/exp-surge-bass-lead-more-1.js"),()=>import("./soundbank/exp-surge-bass-lead-more-2.js"),()=>import("./soundbank/exp-surge-full-0.js"),()=>import("./soundbank/exp-surge-full-1.js"),()=>import("./soundbank/exp-surge-full-2.js"),()=>import("./soundbank/exp-surge-full-3.js"),()=>import("./soundbank/exp-surge-full-4.js"),()=>import("./soundbank/exp-tr909-0.js"),()=>import("./soundbank/exp-tr909-1.js"),()=>import("./soundbank/exp-tx81z-lately-0.js"),()=>import("./soundbank/exp-tx81z-lately-1.js"),()=>import("./soundbank/exp-tx81z-lately-2.js"),()=>import("./soundbank/exp-tx81z-more-0.js"),()=>import("./soundbank/exp-tx81z-more-1.js"),()=>import("./soundbank/exp-tx81z-more-2.js"),()=>import("./soundbank/exp-tx81z-more-3.js"),()=>import("./soundbank/exp-tx81z-more-4.js"),()=>import("./soundbank/exp-tx81z-more-5.js"),()=>import("./soundbank/exp-tx81z-more-6.js"),()=>import("./soundbank/exp-tx81z-more-7.js"),()=>import("./soundbank/keys.js"),()=>import("./soundbank/pad.js"),()=>import("./soundbank/exp-dx7-bass-0.js"),()=>import("./soundbank/exp-dx7-bass-1.js"),()=>import("./soundbank/exp-dx7-bass-2.js"),()=>import("./soundbank/exp-dx7-bass-3.js"),()=>import("./soundbank/exp-dx7-bass-4.js"),()=>import("./soundbank/exp-dx7-bass-5.js"),()=>import("./soundbank/exp-zyn-bass-0.js"),()=>import("./soundbank/exp-zyn-bass-1.js"),()=>import("./soundbank/stargate-starter.js"),()=>import("./soundbank/exp-fifths-lead.js"),()=>import("./soundbank/exp-supersaw-wide.js"),()=>import("./soundbank/exp-supersaw-race.js"),()=>import("./soundbank/exp-calliope-arp-0.js"),()=>import("./soundbank/exp-calliope-arp-1.js"),()=>import("./soundbank/exp-calliope-arp-2.js"),()=>import("./soundbank/exp-calliope-arp-3.js"),()=>import("./soundbank/exp-orchestral-stab.js")]){const group=await load();all.push(...group.default);}const bank=new SoundBank(all,"TOJO SoundBank 3.1");log("Biblioteka: "+all.length+" próbek WAV/FLAC/AIFF");return bank;})().catch(e=>{builtinPromise=null;throw e;});return builtinPromise;
}
const table=Uint32Array.from({length:256},(_,i)=>{let x=i;for(let k=0;k<8;k++)x=x&1?0xedb88320^(x>>>1):x>>>1;return x>>>0;});
function crc32(a){let c=0xffffffff;for(const v of a)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function writeZip(entries){
 const files=entries.map(e=>({...e,nameBytes:new TextEncoder().encode(e.name),crc:crc32(e.data)}));
 const size=files.reduce((s,e)=>s+76+2*e.nameBytes.length+e.data.length,22);
 if(files.length>65535||size>=0xffffffff||files.some(e=>e.nameBytes.length>65535))throw Error("Ten eksport przekracza format ZIP32. Podziel eksport na paczki.");
 const a=new Uint8Array(size),d=new DataView(a.buffer);let p=0;
 const u16=(o,x)=>d.setUint16(o,x,true),u32=(o,x)=>d.setUint32(o,x,true);
 for(const e of files){e.offset=p;u32(p,0x04034b50);u16(p+4,20);u16(p+6,0x800);u32(p+14,e.crc);u32(p+18,e.data.length);u32(p+22,e.data.length);u16(p+26,e.nameBytes.length);a.set(e.nameBytes,p+30);a.set(e.data,p+30+e.nameBytes.length);p+=30+e.nameBytes.length+e.data.length;}
 const central=p;for(const e of files){u32(p,0x02014b50);u16(p+4,20);u16(p+6,20);u16(p+8,0x800);u32(p+16,e.crc);u32(p+20,e.data.length);u32(p+24,e.data.length);u16(p+28,e.nameBytes.length);u32(p+42,e.offset);a.set(e.nameBytes,p+46);p+=46+e.nameBytes.length;}
 u32(p,0x06054b50);u16(p+8,files.length);u16(p+10,files.length);u32(p+12,p-central);u32(p+16,central);return a;
}
export function readZip(a){
 const d=new DataView(a.buffer,a.byteOffset,a.byteLength),files=new Map();let p=0,total=0;
 while(p+4<=a.length&&d.getUint32(p,true)===0x04034b50){if(p+30>a.length)throw Error("Niekompletny ZIP");const flags=d.getUint16(p+6,true),method=d.getUint16(p+8,true),crc=d.getUint32(p+14,true),size=d.getUint32(p+18,true),raw=d.getUint32(p+22,true),nl=d.getUint16(p+26,true),xl=d.getUint16(p+28,true),off=p+30+nl+xl;
 if(flags&9||method!==0||size!==raw)throw Error("Użyj ZIP zapisanego przez TOJO (bez kompresji)");if(off+size>a.length)throw Error("Nieprawidłowy rozmiar ZIP");
 const name=new TextDecoder().decode(a.subarray(p+30,p+30+nl)),data=a.subarray(off,off+size);if(files.has(name)||crc32(data)!==crc)throw Error("Uszkodzony ZIP");files.set(name,data);total+=size;p=off+size;}
 if(!files.size)throw Error("Pusty ZIP");return files;
}
