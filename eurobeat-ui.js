import {encodeWav} from "./wav.js";
import {shareWav} from "./share-wav.js";
import {transcribe,addOriginalNotes} from "./basic-pitch.js?v=029";
import {SR,analyze,parseChords,stretch,arrangement,backing,reshapeRhythm,enrichInstrumental,mix} from "./eurobeat-dsp.js?v=029";
const $=id=>document.getElementById(id);
const ids=["ebVocal","ebBase","ebReference","ebAnalyze","ebPitch","ebPitchModel","ebPitchWasm","ebPitchStart","ebPitchSeconds","ebPitchGain","ebBassSource","ebRebuild","ebOriginalBpm","ebTargetBpm","ebStart","ebKey","ebChords","ebBars","ebStyle","ebPreset","ebLead","ebVGain","ebIGain","ebBaseGain","ebLowCut","ebRender"];
let transcription=null,vocal=null,baseBlob=null,reference=null,refOffset=0,vocalName="track",busy=false,urls=[],blobs=[],vocalURL=null;
function say(s){$("ebStatus").textContent=s;$("ebSourceStatus").textContent=s;}
function enable(){for(const id of ids)$(id).disabled=busy;$("ebAnalyze").disabled=busy||!vocal;$("ebBase").disabled=busy||!vocal;$("ebRender").disabled=busy||!vocal||!baseBlob;$("ebAnalyze").disabled=busy||!vocal||(!baseBlob&&!reference);$("ebPitch").disabled=busy||!baseBlob;}
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
  const start=num("ebPitchStart",0,600),seconds=num("ebPitchSeconds",5,30);
  const base=await decode(baseBlob);
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
  const orig=num("ebOriginalBpm",50,250),target=num("ebTargetBpm",100,200),start=num("ebStart",0,vocal[0].length/SR),bars=num("ebBars",4,32),chords=parseChords($("ebChords").value),ratio=target/orig;
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
  const extra=extraGain>0?await backing(target,chords,n,$("ebStyle").value,p=>progress(.65+p*.30),{sections,preset:$("ebPreset").value,lead:num("ebLead",0,2),sourceBass:transcription?.testOk&&transcription.bassNotes.length&&$("ebBassSource").value==="original"?{notes:transcription.bassNotes,from:transcription.from,to:transcription.to,start,ratio}:null}):[new Float32Array(n),new Float32Array(n)];
  const i=enrichInstrumental(foundation,extra,target,num("ebBaseGain",.4,2),extraGain,extraGain>0?num("ebLowCut",0,.8):0);
  const pitchGain=num("ebPitchGain",0,2);
  if(transcription?.testOk&&pitchGain>0)addOriginalNotes(i,transcription.melodyNotes,start,ratio,pitchGain);
  const safeI=mix(i,[new Float32Array(n),new Float32Array(n)],1,0);const m=mix(v,safeI,num("ebVGain",0,2),1);say("Przygotowuję pliki WAV…");
  const name=vocalName+"-"+target+"bpm";
  for(const [data,player,link,suffix] of [[m,"ebMix","ebMixSave","remix"],[safeI,"ebBacking","ebBackingSave","instrumental"],[v,"ebStretched","ebStretchedSave","vocals"]]){
   const blob=asWav(data);blobs.push({blob,name:name+"-"+suffix+".wav"});const url=URL.createObjectURL(blob);urls.push(url);$(player).src=url;$(link).href=url;$(link).download=name+"-"+suffix+".wav";
  }
  progress(1);$("ebOutput").hidden=false;say("Gotowe: "+(n/SR).toFixed(1)+" s · "+target+" BPM · oryginalna harmonia jako baza.");
 }catch(e){clear();say("Błąd: "+e.message);}finally{lock(false);}
};
for(const [id,i] of [["ebMixShare",0],["ebBackingShare",1],["ebStretchedShare",2]])$(id).onclick=()=>{const b=blobs[i];if(b)shareWav(b.blob,b.name,s=>$("ebSaveStatus").textContent=s);};
const players=["original","vocals","instrumental","ebVocalPlayer","ebMix","ebBacking","ebStretched"];
for(const id of players)$(id).addEventListener("play",()=>{for(const other of players)if(other!==id)$(other).pause();});
enable();