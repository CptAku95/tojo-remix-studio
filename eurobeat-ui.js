import {encodeWav} from "./wav.js";
import {shareWav} from "./share-wav.js";
import {SR,analyze,parseChords,stretch,backing,mix} from "./eurobeat-dsp.js?v=020";
const $=id=>document.getElementById(id);
const ids=["ebVocal","ebReference","ebAnalyze","ebOriginalBpm","ebTargetBpm","ebStart","ebKey","ebChords","ebBars","ebStyle","ebVGain","ebIGain","ebRender"];
let vocal=null,reference=null,refOffset=0,vocalName="track",busy=false,urls=[],blobs=[],vocalURL=null;
function say(s){$("ebStatus").textContent=s;}
function enable(){for(const id of ids)$(id).disabled=busy;$("ebAnalyze").disabled=busy||!vocal;$("ebRender").disabled=busy||!vocal;}
function progress(p){$("ebProgress").value=p;}
function lock(v){busy=v;$("ebProgress").hidden=!v;if(v)progress(0);enable();}
function clear(){for(const id of ["ebMix","ebBacking","ebStretched"]){$(id).pause();$(id).removeAttribute("src");$(id).load();}for(const u of urls)URL.revokeObjectURL(u);urls=[];blobs=[];$("ebSaveStatus").textContent="";$("ebOutput").hidden=true;}
async function decode(blob){const ctx=new OfflineAudioContext(2,1,SR),b=await ctx.decodeAudioData(await blob.arrayBuffer());const left=b.getChannelData(0),right=b.getChannelData(Math.min(1,b.numberOfChannels-1));return [left,right];}
function asWav(ch){return encodeWav({numberOfChannels:2,sampleRate:SR,length:ch[0].length,duration:ch[0].length/SR,getChannelData:i=>ch[i]});}
function resetAnalysis(){ $("ebAnalysis").textContent="Brak analizy. Możesz wpisać tempo i akordy ręcznie."; $("ebOriginalBpm").value=120;$("ebStart").value=0;$("ebKey").value="";$("ebChords").value="Am F C G";}
async function loadVocal(blob,name,ref=null,offset=0){
 if(busy)return;lock(true);clear();vocal=null;reference=ref;refOffset=offset;resetAnalysis();
 $("ebReference").value="";$("ebRefInfo").textContent=reference?"Używam oryginalnego utworu z separacji.":"Opcjonalnie wczytaj oryginał do analizy.";
 if(vocalURL){$("ebVocalPlayer").pause();$("ebVocalPlayer").removeAttribute("src");$("ebVocalPlayer").load();URL.revokeObjectURL(vocalURL);vocalURL=null;}
 try{
  say("Wczytuję wokal…");vocal=await decode(blob);vocalName=name.replace(/\.[^.]+$/,"");
  vocalURL=URL.createObjectURL(blob);$("ebVocalPlayer").src=vocalURL;$("ebVocalPlayer").hidden=false;
  $("ebVocalInfo").textContent=name+" · "+(vocal[0].length/SR).toFixed(1)+" s";
  say("Wokal gotowy. Przeprowadź analizę lub wpisz ustawienia ręcznie.");
 }catch(e){$("ebVocalInfo").textContent="Nie wczytano wokalu.";say("Błąd: "+e.message);}finally{lock(false);}
}
$("ebVocal").onchange=()=>{const f=$("ebVocal").files[0];if(f)loadVocal(f,f.name);};
$("ebReference").onchange=()=>{const f=$("ebReference").files[0];if(f){reference=f;refOffset=0;$("ebRefInfo").textContent=f.name+" · zakładam, że zaczyna się razem z wokalem.";resetAnalysis();}};
window.addEventListener("tojo-vocal",e=>{const d=e.detail;if(busy)return;$("ebVocal").value="";loadVocal(d.blob,d.name,d.reference,d.offset);$("eurobeat").scrollIntoView({block:"start",behavior:"smooth"});});
$("ebAnalyze").onclick=async()=>{
 if(!vocal||busy)return;lock(true);
 try{
  say("Analizuję tempo i akordy…");
  const source=reference?await decode(reference):vocal;
  const a=await analyze(source,reference?refOffset:0,progress);
  $("ebOriginalBpm").value=a.bpm;$("ebStart").value=a.beat.toFixed(3);$("ebKey").value=a.key;$("ebChords").value=a.chords.join(" ");
  $("ebAnalysis").textContent="Szacowane: "+a.bpm+" BPM · "+a.key+" · "+(reference?"oryginał":"sam wokal")+" · "+a.seconds.toFixed(0)+" s analizy. Sprawdź tempo i akordy słuchem.";
  say("Analiza gotowa. Możesz poprawić wyniki przed generowaniem.");
 }catch(e){say("Błąd analizy: "+e.message);}finally{lock(false);}
};
function num(id,min,max){const v=Number($(id).value);if(!Number.isFinite(v)||v<min||v>max)throw Error("Nieprawidłowa wartość: "+$(id).previousElementSibling.textContent);return v;}
$("ebRender").onclick=async()=>{
 if(!vocal||busy)return;lock(true);clear();
 try{
  const orig=num("ebOriginalBpm",50,250),target=num("ebTargetBpm",100,200),start=num("ebStart",0,vocal[0].length/SR),bars=num("ebBars",4,16),chords=parseChords($("ebChords").value),ratio=target/orig;
  // Source advances target/original samples for every output sample.
  const n=Math.min(Math.floor(bars*4*60/target*SR),Math.floor((vocal[0].length-start*SR)/ratio));if(n<SR*.5)throw Error("Za mało wokalu od wybranej pozycji.");
  say("Dopasowuję tempo wokalu bez celowej zmiany jego wysokości…");const v=await stretch(vocal,start,ratio,n,p=>progress(p*.45));
  say("Tworzę perkusję, bas i syntezatory…");const i=await backing(target,chords,n,$("ebStyle").value,p=>progress(.45+p*.5));
  const m=mix(v,i,num("ebVGain",0,2),num("ebIGain",0,2));say("Przygotowuję pliki WAV…");
  const name=vocalName+"-"+target+"bpm";
  for(const [data,player,link,suffix] of [[m,"ebMix","ebMixSave","remix"],[i,"ebBacking","ebBackingSave","instrumental"],[v,"ebStretched","ebStretchedSave","vocals"]]){
   const blob=asWav(data);blobs.push({blob,name:name+"-"+suffix+".wav"});const url=URL.createObjectURL(blob);urls.push(url);$(player).src=url;$(link).href=url;$(link).download=name+"-"+suffix+".wav";
  }
  progress(1);$("ebOutput").hidden=false;say("Gotowe: "+(n/SR).toFixed(1)+" s · "+target+" BPM. Posłuchaj i popraw ustawienia.");
 }catch(e){clear();say("Błąd: "+e.message);}finally{lock(false);}
};
for(const [id,i] of [["ebMixShare",0],["ebBackingShare",1],["ebStretchedShare",2]])$(id).onclick=()=>{const b=blobs[i];if(b)shareWav(b.blob,b.name,s=>$("ebSaveStatus").textContent=s);};
const players=["original","vocals","instrumental","ebVocalPlayer","ebMix","ebBacking","ebStretched"];
for(const id of players)$(id).addEventListener("play",()=>{for(const other of players)if(other!==id)$(other).pause();});
enable();