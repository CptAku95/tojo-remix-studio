import {encodeWav} from "./wav.js";
const $=id=>document.getElementById(id);
const controls=["file","model","modelSource","modelFile","backend","scope","start","run","probe"];
let modelBlob=null,modelRevision=0;
let input=null, originalUrl=null, duration=0, output=[], baseName="track", busy=false, separator=null, separatorKey="", audioCtx=null;
const LOGKEY="tojo-diagnostic-v011", RUNKEY="tojo-active-stage";
function store(k,v){try{localStorage.setItem(k,v)}catch{}}
function read(k){try{return localStorage.getItem(k)||""}catch{return ""}}
function mark(v){store(RUNKEY,v)}
const prior=read(RUNKEY);
$("log").textContent=read(LOGKEY).slice(-10000);
const log=msg=>{$("log").textContent=($("log").textContent+new Date().toLocaleTimeString()+" "+msg+"\n").slice(-12000);store(LOGKEY,$("log").textContent);$("log").scrollTop=$("log").scrollHeight;};
if(prior){log("Poprzednia sesja przerwana podczas: "+prior);$("status").textContent="Poprzednia sesja przerwana: "+prior;mark("");}
const status=msg=>{$("status").textContent=msg;log(msg);};
const errorText=e=>e?.message||String(e);
function setBusy(b){busy=b;for(const id of controls)$(id).disabled=b;$("run").disabled=b||!input;$("progress").hidden=!b;if(b)$("progress").removeAttribute("value");}
function clearResults(){for(const id of ["vocals","instrumental"]){$(id).pause();$(id).removeAttribute("src");$(id).load();}for(const id of ["downloadV","downloadI"])$(id).removeAttribute("href");for(const item of output)URL.revokeObjectURL(item);output=[];$("results").hidden=true;}
function renderResults(){for(const [i,a,d,name] of [[0,"vocals","downloadV","vocals"],[1,"instrumental","downloadI","instrumental"]]){$(a).pause();$(a).src=output[i];$(d).href=output[i];$(d).download=baseName+"-"+name+".wav";}$("results").hidden=false;}
$("swap").onclick=()=>{if(output.length===2){output.reverse();renderResults();log("Zamieniono etykiety wyników.");}};
const modelURLs={"UVR_MDXNET_KARA_2":"https://huggingface.co/AI4future/RVC/resolve/main/UVR_MDXNET_KARA_2.onnx","UVR-MDX-NET-Voc_FT":"https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/UVR-MDX-NET-Voc_FT.onnx","Kim_Vocal_2":"https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/Kim_Vocal_2.onnx"};
function updateModelUI(){ $("modelLink").href=modelURLs[$("model").value];$("modelFileWrap").hidden=$("modelSource").value!=="file"; }
$("model").onchange=updateModelUI;$("modelSource").onchange=updateModelUI;
$("modelFile").onchange=()=>{if(modelBlob)URL.revokeObjectURL(modelBlob);const f=$("modelFile").files[0];modelBlob=f?URL.createObjectURL(f):null;modelRevision++;separator=null;separatorKey="";if(f)log("Lokalny model: "+f.name+" ("+(f.size/1048576).toFixed(1)+" MiB)");};
$("scope").onchange=()=>{$("startWrap").hidden=$("scope").value==="full";};
$("file").onchange=()=>{if(busy)return;const f=$("file").files[0];if(!f)return;clearResults();if(originalUrl)URL.revokeObjectURL(originalUrl);input=f;duration=0;originalUrl=URL.createObjectURL(f);$("original").src=originalUrl;$("original").hidden=false;$("info").textContent=f.name+" · "+(f.size/1048576).toFixed(1)+" MB";$("start").value=0;$("run").disabled=false;status("Plik wybrany.");};
$("original").onloadedmetadata=()=>{if(Number.isFinite($("original").duration)){duration=$("original").duration;$("start").max=Math.max(0,Math.floor(duration-.1));$("info").textContent=input.name+" · "+duration.toFixed(1)+" s · "+(input.size/1048576).toFixed(1)+" MB";}};
for(const id of ["original","vocals","instrumental"])$(id).addEventListener("play",()=>{for(const other of ["original","vocals","instrumental"])if(other!==id)$(other).pause();});
async function getSeparator(){
 const name=$("model").value,source=$("modelSource").value;
 const key=name+"|"+$("backend").value+"|"+source+"|"+modelRevision;
 if(separator&&key===separatorKey)return separator;
 separator=null;separatorKey="";
 status("Ładowanie biblioteki AI…");
 const {createSeparator}=await import("web-audio-separation");
 const providers=$("backend").value==="wasm"||!navigator.gpu?["wasm"]:$("backend").value==="gpu"?["webgpu"]:["webgpu","wasm"];
 const common={logLevel:"info",onProgress:p=>{if(p?.stage&&Number.isFinite(p.fraction)){ $("progress").value=Math.max(0,Math.min(1,p.fraction)); $("status").textContent=p.stage+" "+Math.round(p.fraction*100)+"%"; }}};
 if(source==="repo"){const url=new URL("./models/"+name+".onnx",location.href).href;common.modelUrl=url;common.modelPath=url;}
 if(source==="file"){const f=$("modelFile").files[0];if(!modelBlob||!f)throw new Error("Wybierz plik ONNX.");if(f.name.toLowerCase()!==(name+".onnx").toLowerCase())throw new Error("Plik nie odpowiada wybranemu modelowi: oczekiwano "+name+".onnx");if(f.size<1000000)throw new Error("Plik modelu za mały (może to wskaźnik Git LFS).");common.modelUrl=modelBlob;common.modelPath=modelBlob;}
 log("Źródło modelu: "+source);
 const s=createSeparator(name,{common,mdx:{executionProviders:providers,batchSize:1}});
 mark("loadModel "+key);status("Pobieranie / inicjalizacja "+$("model").selectedOptions[0].textContent+"…");
 await s.loadModel();mark("model załadowany");separator=s;separatorKey=key;log("Model załadowany. Preferencja: "+providers.join(", "));return s;
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
async function decodedURL(u){const r=await fetch(u);if(!r.ok)throw Error("Odczyt ścieżki nieudany");return audioCtx.decodeAudioData(await r.arrayBuffer());}
function similarity(a,b){const n=Math.min(a.length,b.length);let aa=0,bb=0,ab=0;const stride=Math.max(1,Math.floor(n/150000));for(let i=0;i<n;i+=stride){const x=a[i],y=b[i];aa+=x*x;bb+=y*y;ab+=x*y;}return {corr:aa>0&&bb>0?ab/Math.sqrt(aa*bb):0,rmsA:Math.sqrt(aa/Math.ceil(n/stride)),rmsB:Math.sqrt(bb/Math.ceil(n/stride))};}
async function validateShort(mixUrl,urls){const m=await decodedURL(mixUrl),a=await decodedURL(urls[0]),b=await decodedURL(urls[1]);const x=m.getChannelData(0),y=a.getChannelData(0),z=b.getChannelData(0);const ma=similarity(x,y),mb=similarity(x,z),ab=similarity(y,z);log("Długość mix / vok / inst: "+[m,a,b].map(v=>v.duration.toFixed(3)).join(" / ")+" s");log("Korelacja mix–vok: "+ma.corr.toFixed(5)+" | mix–inst: "+mb.corr.toFixed(5)+" | vok–inst: "+ab.corr.toFixed(5));log("RMS mix/vok/inst: "+[ma.rmsA,ma.rmsB,mb.rmsB].map(v=>v.toFixed(5)).join(" / "));return Math.abs(ab.corr)>.995||Math.abs(ma.corr)>.9999&&Math.abs(mb.corr)>.9999;}
$("probe").onclick=async()=>{if(busy)return;setBusy(true);mark("test modelu");try{await getSeparator();status("Test modelu zakończony. Możesz zaimportować utwór.");}catch(e){status("Błąd testu: "+errorText(e));separator=null;separatorKey="";}finally{mark("");setBusy(false);}};
$("run").onclick=async()=>{
 if(!input||busy)return;clearResults();setBusy(true);let clipUrl=null, raw=[], created=[];
 const t=performance.now();
 try{
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error("Brak Web Audio API.");
 audioCtx=audioCtx||new AC();await audioCtx.resume();
 for(const id of ["original","vocals","instrumental"])$(id).pause();
 mark("przygotowanie audio");const s=await getSeparator();mark("dekodowanie audio");const full=$("scope").value==="full";let start=0,length=duration;
 baseName=input.name.replace(/\.[^.]+$/,"");
 let sourceUrl=originalUrl;
 if(!full){status("Dekodowanie i wycinanie fragmentu…");const decoded=await audioCtx.decodeAudioData(await input.arrayBuffer());
 start=Math.max(0,Number($("start").value)||0);
 if(start>=decoded.duration)throw new Error("Początek fragmentu poza utworem.");
 length=Math.min(Number($("scope").value),decoded.duration-start);
 clipUrl=URL.createObjectURL(encodeWav(decoded,start,length));sourceUrl=clipUrl;baseName+="-"+start+"s-"+length.toFixed(1)+"s";}
 else if(duration>300&&!confirm("Cały utwór może przekroczyć pamięć telefonu. Kontynuować?")){status("Anulowano.");return;}
 mark("separate "+separatorKey);status("Separacja AI w toku. Procent niedostępny; pozostaw kartę otwartą.");
 await new Promise(r=>setTimeout(r,30));
 raw=await s.separate(sourceUrl);
 if(!Array.isArray(raw)||raw.length!==2||raw.some(x=>typeof x!=="string"))throw new Error("Nieoczekiwany format wyniku modelu.");
 mark("eksport WAV");status("Przygotowanie plików WAV…");
 for(const url of raw)created.push(await asWav(url));
 // Upstream source writes secondary first, then primary; manual swap remains available.
 if($("model").value!=="UVR_MDXNET_KARA_2")created.reverse();
 const suspicious=!full&&await validateShort(sourceUrl,created);
 output=created;created=[];renderResults();
 separator=null;separatorKey="";
 $("resultInfo").textContent=(full?"Cały utwór":start+"–"+(start+length).toFixed(1)+" s")+" · "+((performance.now()-t)/1000).toFixed(1)+" s obliczeń";
 status(suspicious?"UWAGA: obie ścieżki są niemal identyczne. Separacja niepotwierdzona; skopiuj log.":"Wyniki gotowe. Odsłuchaj oba pliki; różnice próbek nie gwarantują poprawnej separacji.");
 }catch(e){status("Błąd: "+errorText(e));log("Jeśli WebGPU zawodzi, wybierz WASM i krótki fragment. Jeśli karta się zamyka, spróbuj na komputerze.");separator=null;separatorKey="";}
 finally{if(clipUrl)URL.revokeObjectURL(clipUrl);for(const u of raw||[])if(typeof u==="string"&&u.startsWith("blob:"))URL.revokeObjectURL(u);for(const u of created)URL.revokeObjectURL(u);mark("");setBusy(false);}
};
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText($("log").textContent);$("copy").textContent="Skopiowano";}catch{const r=document.createRange();r.selectNodeContents($("log"));const s=getSelection();s.removeAllRanges();s.addRange(r);$("copy").textContent="Zaznaczono log";}};
log("Tojo v0.1.2 · "+navigator.userAgent);log("WebGPU API: "+Boolean(navigator.gpu)+" · secureContext: "+isSecureContext+" · crossOriginIsolated: "+crossOriginIsolated);