import {encodeWav} from "./wav.js";
const $=id=>document.getElementById(id);
const controls=["file","model","backend","scope","start","run"];
let input=null, originalUrl=null, duration=0, output=[], baseName="track", busy=false, separator=null, separatorKey="", audioCtx=null;
const log=msg=>{$("log").textContent+=new Date().toLocaleTimeString()+" "+msg+"\n";$("log").scrollTop=$("log").scrollHeight;};
const status=msg=>{$("status").textContent=msg;log(msg);};
const errorText=e=>e?.message||String(e);
function setBusy(b){busy=b;for(const id of controls)$(id).disabled=b;$("run").disabled=b||!input;$("progress").hidden=!b;}
function clearResults(){for(const id of ["vocals","instrumental"]){$(id).pause();$(id).removeAttribute("src");$(id).load();}for(const id of ["downloadV","downloadI"])$(id).removeAttribute("href");for(const item of output)URL.revokeObjectURL(item);output=[];$("results").hidden=true;}
function renderResults(){for(const [i,a,d,name] of [[0,"vocals","downloadV","vocals"],[1,"instrumental","downloadI","instrumental"]]){$(a).pause();$(a).src=output[i];$(d).href=output[i];$(d).download=baseName+"-"+name+".wav";}$("results").hidden=false;}
$("swap").onclick=()=>{if(output.length===2){output.reverse();renderResults();log("Zamieniono etykiety wyników.");}};
$("scope").onchange=()=>{$("startWrap").hidden=$("scope").value==="full";};
$("file").onchange=()=>{if(busy)return;const f=$("file").files[0];if(!f)return;clearResults();if(originalUrl)URL.revokeObjectURL(originalUrl);input=f;duration=0;originalUrl=URL.createObjectURL(f);$("original").src=originalUrl;$("original").hidden=false;$("info").textContent=f.name+" · "+(f.size/1048576).toFixed(1)+" MB";$("start").value=0;$("run").disabled=false;status("Plik wybrany.");};
$("original").onloadedmetadata=()=>{if(Number.isFinite($("original").duration)){duration=$("original").duration;$("start").max=Math.max(0,Math.floor(duration-.1));$("info").textContent=input.name+" · "+duration.toFixed(1)+" s · "+(input.size/1048576).toFixed(1)+" MB";}};
for(const id of ["original","vocals","instrumental"])$(id).addEventListener("play",()=>{for(const other of ["original","vocals","instrumental"])if(other!==id)$(other).pause();});
async function getSeparator(){
 const key=$("model").value+"|"+$("backend").value;
 if(separator&&key===separatorKey)return separator;
 separator=null;separatorKey="";
 status("Ładowanie biblioteki AI…");
 const {createSeparator}=await import("web-audio-separation");
 const providers=$("backend").value==="wasm"||!navigator.gpu?["wasm"]:["webgpu","wasm"];
 const s=createSeparator($("model").value,{mdx:{executionProviders:providers,batchSize:1}});
 status("Pobieranie / inicjalizacja modelu (~67 MB)…");
 await s.loadModel();separator=s;separatorKey=key;log("Model załadowany. Preferencja: "+providers.join(", "));return s;
}
async function asWav(url){
 const response=await fetch(url);if(!response.ok)throw new Error("Nie można odczytać wyniku modelu.");
 const blob=await response.blob();
 // Check the actual header instead of relying on MIME or filename.
 const h=new Uint8Array(await blob.slice(0,12).arrayBuffer());
 const tag=(i)=>String.fromCharCode(...h.slice(i,i+4));
 if(tag(0)==="RIFF"&&tag(8)==="WAVE")return URL.createObjectURL(new Blob([blob],{type:"audio/wav"}));
 const decoded=await audioCtx.decodeAudioData(await blob.arrayBuffer());
 return URL.createObjectURL(encodeWav(decoded));
}
$("run").onclick=async()=>{
 if(!input||busy)return;clearResults();setBusy(true);let clipUrl=null, raw=[], created=[];
 const t=performance.now();
 try{
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error("Brak Web Audio API.");
 audioCtx=audioCtx||new AC();await audioCtx.resume();
 for(const id of ["original","vocals","instrumental"])$(id).pause();
 const full=$("scope").value==="full";let start=0,length=duration;
 baseName=input.name.replace(/\.[^.]+$/,"");
 let sourceUrl=originalUrl;
 if(!full){status("Dekodowanie i wycinanie fragmentu…");const decoded=await audioCtx.decodeAudioData(await input.arrayBuffer());
 start=Math.max(0,Number($("start").value)||0);
 if(start>=decoded.duration)throw new Error("Początek fragmentu poza utworem.");
 length=Math.min(Number($("scope").value),decoded.duration-start);
 clipUrl=URL.createObjectURL(encodeWav(decoded,start,length));sourceUrl=clipUrl;baseName+="-"+start+"s-"+length.toFixed(1)+"s";}
 else if(duration>300&&!confirm("Cały utwór może przekroczyć pamięć telefonu. Kontynuować?")){status("Anulowano.");return;}
 const s=await getSeparator();status("Separacja AI w toku. Procent niedostępny; pozostaw kartę otwartą.");
 await new Promise(r=>setTimeout(r,30));
 raw=await s.separate(sourceUrl);
 if(!Array.isArray(raw)||raw.length!==2||raw.some(x=>typeof x!=="string"))throw new Error("Nieoczekiwany format wyniku modelu.");
 status("Przygotowanie plików WAV…");
 for(const url of raw)created.push(await asWav(url));
 output=created;created=[];renderResults();
 $("resultInfo").textContent=(full?"Cały utwór":start+"–"+(start+length).toFixed(1)+" s")+" · "+((performance.now()-t)/1000).toFixed(1)+" s obliczeń";
 status("Separacja zakończona. Odsłuchaj i zweryfikuj oba pliki.");
 }catch(e){status("Błąd: "+errorText(e));log("Jeśli WebGPU zawodzi, wybierz WASM i krótki fragment. Jeśli karta się zamyka, spróbuj na komputerze.");separator=null;separatorKey="";}
 finally{if(clipUrl)URL.revokeObjectURL(clipUrl);for(const u of raw||[])if(typeof u==="string"&&u.startsWith("blob:"))URL.revokeObjectURL(u);for(const u of created)URL.revokeObjectURL(u);setBusy(false);}
};
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText($("log").textContent);$("copy").textContent="Skopiowano";}catch{const r=document.createRange();r.selectNodeContents($("log"));const s=getSelection();s.removeAllRanges();s.addRange(r);$("copy").textContent="Zaznaczono log";}};
log("Tojo v0.1.0 · "+navigator.userAgent);log("WebGPU API: "+Boolean(navigator.gpu)+" · secureContext: "+isSecureContext+" · crossOriginIsolated: "+crossOriginIsolated);