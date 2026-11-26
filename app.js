import {encodeWav} from "./wav.js";
import {shareWav} from "./share-wav.js";
import {openMDX,splitMDX} from "./mdx-direct.js?v=016";
const $=id=>document.getElementById(id);
const controls=["file","model","modelSource","modelFile","wasmFile","backend","scope","start","run","probe","sendVocal"];
let modelRevision=0,wasmRevision=0;
let input=null, originalUrl=null, duration=0, output=[], baseName="track", busy=false, separator=null, separatorKey="";
let outputBlobs=[],lastOffset=0;
const LOGKEY="tojo-diagnostic-v011", RUNKEY="tojo-active-stage";
function store(k,v){try{localStorage.setItem(k,v)}catch{}}
function read(k){try{return localStorage.getItem(k)||""}catch{return ""}}
function mark(v){store(RUNKEY,v)}
const prior=read(RUNKEY);
$("log").textContent=read(LOGKEY).slice(-10000);
const log=msg=>{$("log").textContent=($("log").textContent+new Date().toLocaleTimeString()+" "+msg+"\n").slice(-12000);store(LOGKEY,$("log").textContent);$("log").scrollTop=$("log").scrollHeight;};
if(prior){log("Poprzednia sesja przerwana podczas: "+prior);$("status").textContent="Poprzednia sesja przerwana: "+prior;mark("");}
window.addEventListener("tojo-diagnostic",e=>log(String(e.detail)));
const status=msg=>{$("status").textContent=msg;log(msg);};
const errorText=e=>e?.message||String(e);
function setBusy(b){busy=b;for(const id of controls)$(id).disabled=b;$("run").disabled=b||!input;$("progress").hidden=!b;if(b)$("progress").removeAttribute("value");}
function clearResults(){for(const id of ["vocals","instrumental"]){$(id).pause();$(id).removeAttribute("src");$(id).load();}for(const id of ["downloadV","downloadI"])$(id).removeAttribute("href");for(const item of output)URL.revokeObjectURL(item);output=[];outputBlobs=[];$("results").hidden=true;}
function renderResults(){for(const [i,a,d,name] of [[0,"vocals","downloadV","vocals"],[1,"instrumental","downloadI","instrumental"]]){$(a).pause();$(a).src=output[i];$(d).href=output[i];$(d).download=baseName+"-"+name+".wav";}$("results").hidden=false;}
$("swap").onclick=()=>{if(output.length===2){output.reverse();outputBlobs.reverse();renderResults();log("Zamieniono etykiety wyników.");}};
const modelURLs={"UVR_MDXNET_KARA_2":"https://huggingface.co/AI4future/RVC/resolve/main/UVR_MDXNET_KARA_2.onnx","UVR-MDX-NET-Voc_FT":"https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/UVR-MDX-NET-Voc_FT.onnx","Kim_Vocal_2":"https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/Kim_Vocal_2.onnx"};
function updateModelUI(){ $("modelLink").href=modelURLs[$("model").value];$("modelFileWrap").hidden=$("modelSource").value!=="file"; }
async function releaseEngine(){const old=separator;separator=null;separatorKey="";if(old)try{await old.session.release();}catch(e){log("Zwalnianie sesji: "+errorText(e));}}
$("model").onchange=updateModelUI;$("modelSource").onchange=updateModelUI;
$("modelFile").onchange=()=>{const f=$("modelFile").files[0];modelRevision++;if(f){const matched=Object.keys(modelURLs).find(n=>(n+".onnx").toLowerCase()===f.name.toLowerCase());if(matched){$("model").value=matched;updateModelUI();}log("Lokalny model: "+f.name+" ("+(f.size/1048576).toFixed(1)+" MiB)");}};
if(navigator.userAgent.includes("Working Copy")){$("modelSource").value="file";}updateModelUI();
$("wasmFile").onchange=()=>{wasmRevision++;const f=$("wasmFile").files[0];if(f)log("Lokalny runtime: "+f.name+" ("+(f.size/1048576).toFixed(2)+" MiB)");};
$("scope").onchange=()=>{$("startWrap").hidden=$("scope").value==="full";};
$("file").onchange=()=>{if(busy)return;const f=$("file").files[0];if(!f)return;clearResults();if(originalUrl)URL.revokeObjectURL(originalUrl);input=f;duration=0;originalUrl=URL.createObjectURL(f);$("original").src=originalUrl;$("original").hidden=false;$("info").textContent=f.name+" · "+(f.size/1048576).toFixed(1)+" MB";$("start").value=0;$("run").disabled=false;status("Plik wybrany.");};
$("original").onloadedmetadata=()=>{if(Number.isFinite($("original").duration)){duration=$("original").duration;$("start").max=Math.max(0,Math.floor(duration-.1));$("info").textContent=input.name+" · "+duration.toFixed(1)+" s · "+(input.size/1048576).toFixed(1)+" MB";}};
for(const id of ["original","vocals","instrumental"])$(id).addEventListener("play",()=>{for(const other of ["original","vocals","instrumental"])if(other!==id)$(other).pause();});
async function getSeparator(){
 const name=$("model").value,source=$("modelSource").value;
 const key=name+"|"+$("backend").value+"|"+source+"|"+modelRevision+"|"+wasmRevision;
 if(separator&&key===separatorKey)return separator;
 await releaseEngine();
 const readBytes=async()=>{
  if(source==="file"){
   const f=$("modelFile").files[0];if(!f)throw Error("Wybierz zapisany plik ONNX");
   if(f.name.toLowerCase()!==(name+".onnx").toLowerCase())throw Error("Wybrany plik nie pasuje do modelu");
   log("Odczyt File.arrayBuffer(): "+f.name);
   return new Uint8Array(await f.arrayBuffer());
  }
  const url=source==="repo"?new URL("./models/"+name+".onnx",location.href).href:modelURLs[name];
  log("Odczyt fetch: "+url);
  let cache=null;if(source==="remote")try{cache=await caches.open("tojo-direct-onnx-v1");}catch{}
  let r=cache?await cache.match(url):null;
  if(!r){r=await fetch(url);if(!r.ok)throw Error("HTTP "+r.status);if(cache)try{await cache.put(url,r.clone());}catch{}}
  return new Uint8Array(await r.arrayBuffer());
 };
 status("Inicjalizacja bezpośredniego silnika ONNX…");
 try{separator=await openMDX(name,$("backend").value,readBytes,log,mark,$("wasmFile").files[0]);}
 catch(e){throw Error("Etap "+read(RUNKEY)+": "+errorText(e));}
 separatorKey=key;return separator;
}
function metrics(a,b){let aa=0,bb=0,ab=0;const stride=Math.max(1,Math.floor(a.length/150000));for(let i=0;i<a.length;i+=stride){const x=a[i],y=b[i];aa+=x*x;bb+=y*y;ab+=x*y;}return {corr:aa>0&&bb>0?ab/Math.sqrt(aa*bb):0,rmsA:Math.sqrt(aa/Math.ceil(a.length/stride)),rmsB:Math.sqrt(bb/Math.ceil(a.length/stride))};}
function wavFor(ch){return encodeWav({numberOfChannels:2,sampleRate:44100,length:ch[0].length,duration:ch[0].length/44100,getChannelData:i=>ch[i]});}
$("probe").onclick=async()=>{if(busy)return;setBusy(true);mark("test modelu");try{await getSeparator();status("Sesja ONNX utworzona. Teraz test z utworem.");}catch(e){status("Błąd testu: "+errorText(e));await releaseEngine();}finally{mark("");setBusy(false);}};
$("run").onclick=async()=>{
 if(!input||busy)return;clearResults();setBusy(true);const t=performance.now();
 try{
  for(const id of ["original","vocals","instrumental"])$(id).pause();
  mark("dekodowanie audio");status("Dekodowanie audio 44,1 kHz…");
  const ctx=new OfflineAudioContext(2,1,44100),decoded=await ctx.decodeAudioData(await input.arrayBuffer());
  const full=$("scope").value==="full",start=full?0:Math.max(0,Number($("start").value)||0);
  const offset=Math.floor(start*44100);if(offset>=decoded.length)throw Error("Początek fragmentu poza utworem");
  const frames=full?decoded.length:Math.min(decoded.length-offset,Math.floor(Number($("scope").value)*44100));
  if(full&&decoded.duration>60&&!confirm("Długi utwór może przeciążyć iPhone'a. Kontynuować?")){status("Anulowano");return;}
  const channels=[0,Math.min(1,decoded.numberOfChannels-1)].map(c=>decoded.getChannelData(c).slice(offset,offset+frames));
  baseName=input.name.replace(/\.[^.]+$/,"")+(full?"":"-"+start+"s");
  lastOffset=start;
  const engine=await getSeparator();status("Rzeczywista inferencja ONNX…");
  const inferStart=performance.now();
  const [v,i]=await splitMDX(engine,channels,log,mark,p=>{
   $("progress").value=p;
   const remaining=p>0?Math.max(0,Math.round((performance.now()-inferStart)/1000*(1-p)/p)):0;
   $("status").textContent="Inferencja "+Math.round(p*100)+"%"+(p>0&&p<1?" · szac. "+Math.floor(remaining/60)+" min "+remaining%60+" s do końca":"");
  });
  const mv=metrics(channels[0],v[0]),mi=metrics(channels[0],i[0]),vi=metrics(v[0],i[0]);
  log("Korelacja mix–vok "+mv.corr.toFixed(5)+" | mix–inst "+mi.corr.toFixed(5)+" | vok–inst "+vi.corr.toFixed(5));
  log("RMS mix/vok/inst "+[mv.rmsA,mv.rmsB,mi.rmsB].map(x=>x.toFixed(5)).join(" / "));
  const suspicious=Math.abs(vi.corr)>.995||mv.rmsB<1e-6||mi.rmsB<1e-6;
  mark("eksport WAV");outputBlobs=[wavFor(v),wavFor(i)];output=outputBlobs.map(b=>URL.createObjectURL(b));renderResults();
  $("resultInfo").textContent=(frames/44100).toFixed(2)+" s · "+((performance.now()-t)/1000).toFixed(1)+" s obliczeń";
  status(suspicious?"UWAGA: ścieżki podobne lub jedna cicha. Sprawdź log i odsłuch.":"Wyniki gotowe. Sprawdź wokal i instrumental.");
 }catch(e){status("Błąd ["+read(RUNKEY)+"]: "+errorText(e));await releaseEngine();}
 finally{mark("");setBusy(false);}
};
for(const [button,i,suffix] of [["shareV",0,"vocals"],["shareI",1,"instrumental"]]){
 $(button).onclick=()=>shareWav(outputBlobs[i],baseName+"-"+suffix+".wav",s=>{$("saveStatus").textContent=s;log(s);});
}
$("sendVocal").onclick=async()=>{
 if(busy||!outputBlobs[0])return;
 setBusy(true);try{await releaseEngine();window.dispatchEvent(new CustomEvent("tojo-vocal",{detail:{blob:outputBlobs[0],instrumental:outputBlobs[1],name:baseName+"-vocals.wav",reference:input,offset:lastOffset}}));}finally{setBusy(false);}
};
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText($("log").textContent);$("copy").textContent="Skopiowano";}catch{const r=document.createRange();r.selectNodeContents($("log"));const s=getSelection();s.removeAllRanges();s.addRange(r);$("copy").textContent="Zaznaczono log";}};
$("clearLog").onclick=()=>{
 $("log").textContent="";
 try{localStorage.removeItem(LOGKEY);}catch{}
 $("copy").textContent="Kopiuj log";
};
log("Tojo v0.4.6 · "+navigator.userAgent);log("WebGPU API: "+Boolean(navigator.gpu)+" · secureContext: "+isSecureContext+" · crossOriginIsolated: "+crossOriginIsolated);