import {encodeWav} from "./wav.js";
import {shareWav} from "./share-wav.js";
import {transcribe,addOriginalNotes} from "./basic-pitch.js?v=031";
import {SR,analyze,parseChords,stretch,arrangement,backing,reshapeRhythm,enrichInstrumental,mix} from "./eurobeat-dsp.js?v=029";
import {planArrangement,renderArrangement,peakGuard} from "./eurobeat-engine.js?v=040";
import {pairedTempo,pairedAccents,pairedGains} from "./paired-style.js?v=1";
import {applyAudioStyle} from "./audio-style.js?v=1";
import {applyLearnedGroove} from "./learned-groove.js?v=1";
import {builtinBank,SoundBank} from "./soundbank.js?v=047";
const $=id=>document.getElementById(id);
const ids=["ebVocal","ebBase","ebReference","ebAnalyze","ebPitch","ebPitchModel","ebPitchWasm","ebPitchStart","ebPitchSeconds","ebPitchGain","ebBassSource","ebRebuild","ebEngine","ebBankLoad","ebBankImport","ebBankExport","ebBankShare","ebSampleSelect","ebSamplePreview","ebSampleUse","ebBankReset","ebDrumsGain","ebBassGain","ebUpbeatGain","ebPadGain","ebBrassGain","ebFxGain","ebOriginalBpm","ebTargetBpm","ebStart","ebKey","ebChords","ebBars","ebStyle","ebPreset","ebLead","ebVGain","ebIGain","ebBaseGain","ebLowCut","ebRender"];
let transcription=null,vocal=null,baseBlob=null,reference=null,refOffset=0,vocalName="track",busy=false,urls=[],blobs=[],vocalURL=null;
let activeBank=null,previewUrl=null,packUrl=null,packBlob=null;
function invalidatePack(){if(packUrl)URL.revokeObjectURL(packUrl);packUrl=null;packBlob=null;$("ebBankDownload").hidden=true;}
async function getBank(){if(!activeBank)activeBank=await builtinBank();return activeBank;}
function populateBank(bank){
 $("ebBankInfo").textContent=bank.name+" · "+bank.samples.length+" próbek WAV/FLAC";
 $("ebSampleSelect").replaceChildren();
 for(const x of bank.samples){const option=document.createElement("option");option.value=x.id;option.textContent=x.kind+" · "+x.id+(x.root===null?"":" (MIDI "+x.root+")");$("ebSampleSelect").append(option);}
 $("ebSamplePreview").disabled=busy; $("ebSampleUse").disabled=busy;
}
async function bankAction(action){if(busy)return;lock(true);try{await action();}catch(e){$("ebBankInfo").textContent="Błąd: "+e.message;}finally{lock(false);}}
$("ebBankLoad").onclick=()=>bankAction(async()=>populateBank(await getBank()));
$("ebBankImport").onchange=()=>{const f=$("ebBankImport").files[0];if(f)bankAction(async()=>{activeBank=await SoundBank.fromZip(f);invalidatePack();populateBank(activeBank);});};
$("ebBankReset").onclick=()=>bankAction(async()=>{activeBank=await builtinBank();activeBank.overrides={};invalidatePack();populateBank(activeBank);});
$("ebBankExport").onclick=()=>bankAction(async()=>{const bank=await getBank();populateBank(bank);if(packUrl)URL.revokeObjectURL(packUrl);packBlob=bank.exportZip();packUrl=URL.createObjectURL(packBlob);const link=$("ebBankDownload");link.href=packUrl;link.download="TOJO-SoundBank-v3.zip";link.hidden=false;});
$("ebBankShare").onclick=async()=>{if(!packBlob||busy)return;try{const f=new File([packBlob],"TOJO-SoundBank-v3.zip",{type:"application/zip"});if(!navigator.share||(navigator.canShare&&!navigator.canShare({files:[f]})))throw Error("Użyj linku Zapisz ZIP.");await navigator.share({files:[f]});$("ebBankInfo").textContent="Menu udostępniania zakończone. Sprawdź aplikację Pliki.";}catch(e){$("ebBankInfo").textContent=e.name==="AbortError"?"Anulowano. ZIP nadal gotowy.":e.message;}};
$("ebSamplePreview").onclick=()=>bankAction(async()=>{const bank=await getBank();if(!$("ebSampleSelect").value)populateBank(bank);if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(bank.preview($("ebSampleSelect").value));$("ebSampleAudio").src=previewUrl;$("ebSampleAudio").hidden=false;});
$("ebSampleUse").onclick=()=>bankAction(async()=>{const bank=await getBank(),x=bank.samples.find(x=>x.id===$("ebSampleSelect").value);if(!x)return;bank.overrides[x.kind]=x.id;$("ebBankInfo").textContent="Ustawiono: "+(x.family||x.id)+(["fm","brass","pluck","pad","bell","tom"].includes(x.kind)?" · automatyczny dobór nuty":"");});
function say(s){$("ebStatus").textContent=s;$("ebSourceStatus").textContent=s;}
function enable(){for(const id of ids)$(id).disabled=busy;$("ebBankShare").disabled=busy||!packBlob;$("ebAnalyze").disabled=busy||!vocal;$("ebBase").disabled=busy||!vocal;$("ebRender").disabled=busy||!vocal||!baseBlob;$("ebAnalyze").disabled=busy||!vocal||(!baseBlob&&!reference);$("ebPitch").disabled=busy||!baseBlob;}
function progress(p){$("ebProgress").value=p;$("ebPitchProgress").value=p;}
function lock(v){busy=v;$("ebProgress").hidden=!v;$("ebPitchProgress").hidden=!v;if(v)progress(0);enable();}
function clear(){for(const id of ["ebMix","ebBacking","ebStretched"]){$(id).pause();$(id).removeAttribute("src");$(id).load();}for(const u of urls)URL.revokeObjectURL(u);urls=[];blobs=[];$("ebSaveStatus").textContent="";$("ebOutput").hidden=true;$("ebArrangement").textContent="";}
async function decode(blob){const ctx=new OfflineAudioContext(2,1,SR),b=await ctx.decodeAudioData(await blob.arrayBuffer());const left=b.getChannelData(0),right=b.getChannelData(Math.min(1,b.numberOfChannels-1));return [left,right];}
function asWav(ch){return encodeWav({numberOfChannels:2,sampleRate:SR,length:ch[0].length,duration:ch[0].length/SR,getChannelData:i=>ch[i]});}
function resetPitch(){transcription=null;$("ebPitchInfo").textContent="Nie rozpoznano jeszcze nut.";$("ebPitchGain").value="0";}
function resetAnalysis(){resetPitch(); $("ebAnalysis").textContent="Brak analizy. Możesz wpisać tempo i akordy ręcznie."; $("ebOriginalBpm").value=120;$("ebStart").value=0;$("ebKey").value="";$("ebChords").value="Am F C G";}
async function loadVocal(blob,name,ref=null,offset=0,instrumental=null){
 if(busy)return;lock(true);clear();vocal=null;baseBlob=instrumental;reference=ref;refOffset=offset;resetAnalysis();$("ebBase").value="";$("ebBaseInfo").textContent=baseBlob?"Oryginalny instrumental przeniesiony z separacji.":"Wczytaj instrumental z tej samej separacji.";
 $("ebReference").value="";$("ebRefInfo").textContent=reference?"Używam oryginalnego utworu z separacji.":"Opcjonalnie wczytaj oryginał do analizy.";
 if(vocalURL){$("ebVocalPlayer").pause();$("ebVocalPlayer").removeAttribute("src");$("ebVocalPlayer").load();URL.revokeObjectURL(vocalURL);vocalURL=null;}
 try{
  say("Wczytuję wokal…");vocal=await decode(blob);vocalName=name.replace(/\.[^.]+$/,"");
  vocalURL=URL.createObjectURL(blob);$("ebVocalPlayer").src=vocalURL;$("ebVocalPlayer").hidden=false;
  $("ebVocalInfo").textContent=name+" · "+(vocal[0].length/SR).toFixed(1)+" s";
  say(baseBlob?"Obie ścieżki gotowe. Przeprowadź analizę.":"Wokal gotowy. Wczytaj oryginalny instrumental.");
 }catch(e){$("ebVocalInfo").textContent="Nie wczytano wokalu.";say("Błąd: "+e.message);}finally{lock(false);}
}
$("ebVocal").onchange=()=>{const f=$("ebVocal").files[0];if(f)loadVocal(f,f.name);};
$("ebBase").onchange=()=>{const f=$("ebBase").files[0];if(f){baseBlob=f;clear();resetAnalysis();$("ebBaseInfo").textContent=f.name+" · "+(f.size/1048576).toFixed(1)+" MB";say("Instrumental gotowy. Przeprowadź analizę.");enable();}};
$("ebReference").onchange=()=>{const f=$("ebReference").files[0];if(f){reference=f;refOffset=0;$("ebRefInfo").textContent=f.name+" · zakładam, że zaczyna się razem z wokalem.";resetAnalysis();enable();}};
window.addEventListener("tojo-vocal",e=>{const d=e.detail;if(busy)return;$("ebVocal").value="";loadVocal(d.blob,d.name,d.reference,d.offset,d.instrumental);$("eurobeat").scrollIntoView({block:"start",behavior:"smooth"});});
$("ebAnalyze").onclick=async()=>{
 if(!vocal||busy)return;lock(true);
 try{
  say("Analizuję tempo i akordy…");
  const source=reference?await decode(reference):await decode(baseBlob);
  const a=await analyze(source,reference?refOffset:0,progress);
  $("ebOriginalBpm").value=a.bpm;$("ebStart").value=a.beat.toFixed(3);$("ebKey").value=a.key;$("ebChords").value=a.chords.join(" ");
  $("ebAnalysis").textContent="Szacowane: "+a.bpm+" BPM · "+a.key+" · "+(reference?"oryginał":"oryginalny instrumental")+" · "+a.seconds.toFixed(0)+" s analizy. Sprawdź tempo i akordy słuchem.";
  say("Analiza gotowa. Możesz poprawić wyniki przed generowaniem.");
 }catch(e){say("Błąd analizy: "+e.message);}finally{lock(false);}
};
$("ebPitch").onclick=async()=>{
 if(busy||!baseBlob)return;lock(true);resetPitch();
 try{
  const base=await decode(baseBlob);
  const start=num("ebPitchStart",0,base[0].length/SR),seconds=$("ebPitchSeconds").value==="all"?Infinity:num("ebPitchSeconds",5,120);
  if(start>=base[0].length/SR)throw Error("Początek jest poza utworem.");
  const t=performance.now();
  transcription=await transcribe(base,start,seconds,say,progress,{model:$("ebPitchModel").files[0],wasm:$("ebPitchWasm").files[0]||($("wasmFile").files[0]?.name==="ort-wasm-simd-threaded.wasm"?$("wasmFile").files[0]:null)});
  const count=transcription.notes.length,used=transcription.melodyNotes.length;
  $("ebPitchInfo").textContent="Wykryto "+count+" nut (bas: "+transcription.bassNotes.length+", wyższe: "+used+") · MIDI "+(transcription.range?.join("–")||"brak")+" · test A4: "+(transcription.testOk?"OK":"UWAGA")+" · "+transcription.from.toFixed(1)+"–"+transcription.to.toFixed(1)+" s. Czas: "+((performance.now()-t)/1000).toFixed(1)+" s.";
  if(used&&transcription.testOk)$("ebPitchGain").value="1";
  say(count?"Basic Pitch: analiza zakończona.":"Basic Pitch nie rozpoznał nut w tym fragmencie.");
 }catch(e){resetPitch();say("Basic Pitch: "+e.message);$("ebPitchInfo").textContent="Błąd: "+e.message;}finally{lock(false);}
};
function num(id,min,max){const v=Number($(id).value);if(!Number.isFinite(v)||v<min||v>max)throw Error("Nieprawidłowa wartość: "+$(id).previousElementSibling.textContent);return v;}
$("ebRender").onclick=async()=>{
 if(!vocal||!baseBlob||busy)return;lock(true);clear();
 try{
  const engine=$("ebEngine").value;const orig=num("ebOriginalBpm",50,250);let pairedModel=null,target;
  if(engine==="paired"){say("Wczytuję model 9 par…");const response=await fetch("./models/tojo-paired-style-v1.json");if(!response.ok)throw Error("Paired StyleLab HTTP "+response.status);pairedModel=await response.json();target=pairedTempo(orig,pairedModel);$("ebTargetBpm").value=target;window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:"Paired StyleLab: "+pairedModel.trainingPairs+" par · tempo "+orig+" → "+target+" BPM · Spin poza treningiem"}));}
  else target=num("ebTargetBpm",100,200);
  const start=num("ebStart",0,vocal[0].length/SR),bars=num("ebBars",4,32),chords=parseChords($("ebChords").value),ratio=target/orig;
  // Source advances target/original samples for every output sample.
  say("Wczytuję oryginalny instrumental…");
  const base=await decode(baseBlob);
  if(Math.abs(base[0].length-vocal[0].length)>SR*.5)throw Error("Wokal i instrumental mają różną długość. Wczytaj ścieżki z tej samej separacji.");
  const n=Math.min(Math.floor(bars*4*60/target*SR),Math.floor((Math.min(vocal[0].length,base[0].length)-start*SR)/ratio));if(n<SR*.5)throw Error("Za mało audio od wybranej pozycji.");
  say("Dopasowuję tempo obu ścieżek razem…");
  const stems=await stretch([...vocal,...base],start,ratio,n,p=>progress(p*.30)),v=stems.slice(0,2),original=stems.slice(2);
  say("Dodaję eurobeatowe instrumenty do oryginału…");const sections=arrangement(v,target);
  $("ebArrangement").textContent=sections.map((s,i)=>"Takt "+s.bar+" · "+$("ebChords").value.trim().split(/[\s,|]+/).filter(Boolean)[i%chords.length]+" · "+s.type).join("\n");
  const extraGain=num("ebIGain",0,2),amount=extraGain>0?num("ebRebuild",0,.95):0;
  say("Osłabiam oryginalną perkusję, zachowując część melodyczną…");
  const foundation=await reshapeRhythm(original,amount,p=>progress(.30+.35*p));
  say("Buduję sekcję rytmiczną Eurobeat…");
  window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:"Eurobeat engine selected: "+engine}));const modern=engine!=="legacy",preset=$("ebPreset").value,style=$("ebStyle").value,lead=num("ebLead",0,2),pitchGain=num("ebPitchGain",0,2),sourceBass=transcription?.testOk&&transcription.bassNotes.length&&$("ebBassSource").value==="original"?{notes:transcription.bassNotes,from:transcription.from,to:transcription.to,start,ratio}:null;
  let extra=[new Float32Array(n),new Float32Array(n)];
  if(extraGain>0&&modern){
   let plan=planArrangement({bpm:target,chords,length:n,sections,sourceBass,melody:transcription?.testOk?transcription.melodyNotes:[],start,ratio,style,preset,lead,pitchGain});
   if(engine==="ai"||engine==="stylelab"){say("Wczytuję wyuczony groove Eurobeat…");const response=await fetch("./models/tojo-groove-v1.json");if(!response.ok)throw Error("Model groove HTTP "+response.status);plan=applyLearnedGroove(plan,await response.json());window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:"TOJO AI Groove: model wyuczony na 12 MIDI; "+plan.events.length+" zdarzeń"}));}
   if(engine==="stylelab"){say("Wczytuję profil audio TurboA…");const response=await fetch("./models/tojo-turboa-style-v1.json");if(!response.ok)throw Error("StyleLab HTTP "+response.status);const profile=await response.json();plan=applyAudioStyle(plan,profile);window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:"StyleLab: "+profile.songs+" MP3 w profilu · "+profile.tempoTracks+" pomiarów tempa · mediana "+profile.metrics.tempoEstimate[1]+" BPM · akcenty zastosowane"}));}
   let gains=Object.fromEntries([["drums","ebDrumsGain"],["bass","ebBassGain"],["upbeat","ebUpbeatGain"],["pad","ebPadGain"],["brass","ebBrassGain"],["fx","ebFxGain"]].map(([role,id])=>[role,num(id,0,2)]));
   if(pairedModel){plan=pairedAccents(plan,pairedModel);gains=pairedGains(gains,pairedModel);window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:"Paired StyleLab: dopasowano akcenty i proporcje podkładu z 9 par"}));}
   $("ebArrangement").textContent=plan.labels.map(x=>"Takt "+x.bar+" · "+x.type).join("\n")+"\n\nZdarzenia: "+Object.entries(plan.counts).map(([k,v])=>k+": "+v).join(" · ")+"\nBas z oryginału: "+plan.sourceCount+" kroków";
   window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:(engine==="paired"?"Paired StyleLab arrangement: ":engine==="stylelab"?"StyleLab arrangement: ":engine==="ai"?"AI Groove arrangement: ":"Engine 0.3: ")+JSON.stringify(plan.counts)+"; bas z oryginału: "+plan.sourceCount}));
   let sampleBank=null;
   if(engine==="sample"||engine==="ai"||engine==="stylelab"||engine==="paired"){say("Wczytuję bibliotekę nagranych brzmień…");sampleBank=await getBank();populateBank(sampleBank);say("Renderuję próbki instrumentów…");}
   extra=await renderArrangement(plan,n,{preset,gains,sampleBank,onSampleStats:stats=>{if(!sampleBank)return;const line="Sample Engine: "+stats.sampled+" zdarzeń z próbek, "+stats.fallback+" z syntezy zastępczej";$("ebArrangement").textContent+="\n"+line;window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:line}));}},p=>progress(.65+p*.30));
  }else if(extraGain>0)extra=await backing(target,chords,n,style,p=>progress(.65+p*.30),{sections,preset,lead,sourceBass});
  const i=enrichInstrumental(foundation,extra,target,num("ebBaseGain",.4,2),extraGain,extraGain>0?num("ebLowCut",0,.8):0);
  if(!modern&&transcription?.testOk&&pitchGain>0)addOriginalNotes(i,transcription.melodyNotes,start,ratio,pitchGain);
  const safeI=peakGuard(i),m=peakGuard(mix(v,safeI,num("ebVGain",0,2),1));say("Przygotowuję pliki WAV…");
  const name=vocalName+"-"+target+"bpm";
  for(const [data,player,link,suffix] of [[m,"ebMix","ebMixSave","remix"],[safeI,"ebBacking","ebBackingSave","instrumental"],[v,"ebStretched","ebStretchedSave","vocals"]]){
   const blob=asWav(data);blobs.push({blob,name:name+"-"+suffix+".wav"});const url=URL.createObjectURL(blob);urls.push(url);$(player).src=url;$(link).href=url;$(link).download=name+"-"+suffix+".wav";
  }
  progress(1);$("ebOutput").hidden=false;say("Gotowe: "+(n/SR).toFixed(1)+" s · "+target+" BPM · oryginalna harmonia jako baza.");
 }catch(e){clear();say("Błąd: "+e.message);}finally{lock(false);}
};
for(const [id,i] of [["ebMixShare",0],["ebBackingShare",1],["ebStretchedShare",2]])$(id).onclick=()=>{const b=blobs[i];if(b)shareWav(b.blob,b.name,s=>$("ebSaveStatus").textContent=s);};
const players=["original","vocals","instrumental","ebVocalPlayer","ebMix","ebBacking","ebStretched","ebSampleAudio"];
for(const id of players)$(id).addEventListener("play",()=>{for(const other of players)if(other!==id)$(other).pause();});
enable();