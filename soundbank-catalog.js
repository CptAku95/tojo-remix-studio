import stargate from "./soundbank/stargate-catalog.js";
import instruments from "./soundbank/instrument-catalog.js";
export const catalog=[...stargate,...instruments].map(x=>{
 const variantGroup=x.path?.replace(/_v(?:l)?\d+|_rr\d+/gi,"");
 return {...x,...(x.velocityLayer!=null||x.roundRobin!=null?{variantGroup}:{}),
 kind:/susCymb1-cresc/i.test(x.path||"")?"riser":x.kind};
});
const encoder=new TextDecoder();
const u16=(v,i)=>v.getUint16(i,true),u32=(v,i)=>v.getUint32(i,true);
const to64=a=>{let s="";for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);};
export async function openSourceZip(file){
 const tail=new Uint8Array(await file.slice(Math.max(0,file.size-65557)).arrayBuffer()),d=new DataView(tail.buffer);let end=-1;
 for(let i=tail.length-22;i>=0;i--)if(u32(d,i)===0x06054b50&&i+22+u16(d,i+20)===tail.length){end=i;break;}
 if(end<0||u16(d,end+4)||u16(d,end+6))throw Error("Nieprawidłowy ZIP lub wieloczęściowe archiwum.");
 const count=u16(d,end+10),size=u32(d,end+12),offset=u32(d,end+16);
 if(count===65535||size===0xffffffff||offset===0xffffffff||offset+size>file.size)throw Error("Nieobsługiwany ZIP64 lub uszkodzony katalog.");
 const a=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),v=new DataView(a.buffer),entries=new Map();let p=0;
 for(let i=0;i<count;i++){if(p+46>a.length||u32(v,p)!==0x02014b50)throw Error("Uszkodzony katalog ZIP");const n=u16(v,p+28),extra=u16(v,p+30),comment=u16(v,p+32),next=p+46+n+extra+comment;if(next>a.length)throw Error("Uszkodzony wpis ZIP");const name=encoder.decode(a.subarray(p+46,p+46+n));const key=name.indexOf("stargate-sample-pack/");const inner=name.indexOf("stargate-sample-pack/",key+1);const clean=inner>=0?name.slice(inner):key>=0?name.slice(key):name;entries.set(clean,{flags:u16(v,p+8),method:u16(v,p+10),size:u32(v,p+20),raw:u32(v,p+24),offset:u32(v,p+42)});p=next;}
 return {count:entries.size,async get(path){const e=entries.get(path);if(!e)return null;if(e.flags&1)throw Error("Szyfrowany ZIP");const h=new DataView(await file.slice(e.offset,e.offset+30).arrayBuffer());if(u32(h,0)!==0x04034b50)throw Error("Uszkodzony nagłówek ZIP");const start=e.offset+30+u16(h,26)+u16(h,28),part=file.slice(start,start+e.size);let b;if(e.method===0)b=await part.arrayBuffer();else if(e.method===8){if(typeof DecompressionStream==="undefined")throw Error("Ta przeglądarka nie obsługuje rozpakowania ZIP");b=await new Response(part.stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();}else throw Error("Nieobsługiwana metoda ZIP");if(b.byteLength!==e.raw)throw Error("Niezgodna długość wpisu ZIP");return new Uint8Array(b);}};
}
export async function importCatalogSample(bank,id,archive=null,onProgress=()=>{}){
 const x=catalog.find(x=>x.id===id);if(!x)throw Error("Nie znaleziono próbki");
 const group=x.variantGroup?catalog.filter(z=>z.variantGroup===x.variantGroup):x.family&&["lead","guitar","bass-guitar","supersaw","arp","orchestral-hit"].includes(x.kind)?catalog.filter(z=>z.family===x.family&&z.kind===x.kind):[x];
 let done=0;const loaded=[];
 for(const z of group){if(bank.samples.some(a=>a.id===z.id)){onProgress(++done,group.length);continue;}let bytes=archive?await archive.get(z.path):null;
 if(!bytes){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const r=await fetch(z.url,{signal:controller.signal});if(!r.ok)throw Error("Pobieranie HTTP "+r.status);bytes=new Uint8Array(await r.arrayBuffer());}finally{clearTimeout(timer);}}
 if(bytes.byteLength!==z.bytes)throw Error("Niezgodna długość "+z.id);const head=String.fromCharCode(...bytes.subarray(0,4));if(!["RIFF","fLaC","FORM"].includes(head))throw Error("Nieprawidłowy format "+z.id);
 const entry={...z,data:to64(bytes)};bank.addSamples([entry]);loaded.push(entry.id);onProgress(++done,group.length);
 }return {id:x.id,added:loaded.length};
}
