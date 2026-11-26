// Spotify Basic Pitch ICASSP 2022 ONNX, CPU/WASM.
// Original model: https://github.com/spotify/basic-pitch (Apache-2.0).
const MODEL="https://raw.githubusercontent.com/spotify/basic-pitch/main/basic_pitch/saved_models/icassp_2022/nmp.onnx";
const CDNS=["https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.22.0/","https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"];
const SR=22050,W=43844,H=36164,PAD=3840,BINS=88;
const pause=()=>new Promise(r=>setTimeout(r,0));
const log=s=>window.dispatchEvent(new CustomEvent("tojo-diagnostic",{detail:"Basic Pitch: "+s}));
async function bytes(file,urls,what){
 if(file){log(what+" lokalny: "+file.name+" ("+file.size+" B)");return new Uint8Array(await file.arrayBuffer());}
 for(const url of urls){try{log(what+" fetch: "+url);const r=await fetch(url);if(!r.ok)throw Error("HTTP "+r.status);return new Uint8Array(await r.arrayBuffer());}catch(e){log(what+" fetch: "+e.message);}}
 throw Error("Nie można pobrać "+what+". Wskaż pobrany plik lokalny.");
}
// Streaming note decoder: preserve active notes across inference windows.
export function noteDecoder(from,duration,sensitive=false){
 const notes=[],dt=H/142/SR,states=Array.from({length:BINS},()=>({begin:-1,sum:0,num:0,quiet:0,prev:0}));
 let count=0;
 function finish(p,end){const s=states[p];if(s.begin>=0&&end-s.begin>=6){const a=s.begin*dt,b=Math.min(duration,end*dt);if(b>a)notes.push({start:from+a,duration:b-a,pitch:p+21,amp:s.sum/Math.max(1,s.num)});}s.begin=-1;s.sum=0;s.num=0;s.quiet=0;}
 return {
  push(frames,onsets,limit=frames.length/BINS){
   for(let t=0;t<limit;t++,count++)for(let p=0;p<BINS;p++){
    const j=t*BINS+p,f=frames[j],o=onsets[j],s=states[p];
    if(s.begin>=0&&count-s.begin>=6&&o>.55&&s.prev<=.55&&f>.3)finish(p,count);
    if(s.begin<0&&(f>(sensitive?.34:.45)||o>.5&&f>(sensitive?.20:.25)))s.begin=count;
    if(s.begin>=0){if(f<(sensitive?.23:.3)){s.quiet++;if(s.quiet>=4)finish(p,count-s.quiet+1);}else{s.quiet=0;s.sum+=f;s.num++;}}
    s.prev=o;
   }
  },
  finish(){for(let p=0;p<BINS;p++)finish(p,count-states[p].quiet);return notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);}
 };
}
export function extractNotes(frames,onsets,from,duration,sensitive=false){const d=noteDecoder(from,duration,sensitive);d.push(frames,onsets);return d.finish();}
// Cascaded high-pass at 180 Hz; capped gain so we do not amplify silence excessively.
export function focusMelody(mono,inPlace=false){
 const result=inPlace?mono:new Float32Array(mono.length),alpha=Math.exp(-2*Math.PI*180/SR);
 let x1=0,y1=0,x2=0,y2=0,peak=0;
 for(let i=0;i<mono.length;i++){const x=mono[i],a=alpha*(y1+x-x1),b=alpha*(y2+a-x2);x1=x;y1=a;x2=a;y2=b;result[i]=b;peak=Math.max(peak,Math.abs(b));}
 const gain=Math.min(4,.85/Math.max(peak,1e-8));for(let i=0;i<result.length;i++)result[i]*=gain;
 return result;
}
export async function transcribe(ch,start,seconds,onStatus=()=>{},onProgress=()=>{},files={}){
 let stage="przygotowanie audio",session;
 const say=s=>{stage=s;onStatus(s);log(s);};
 try{
 const offset=Math.round(start*44100),n=Math.floor(Math.min(seconds*44100,ch[0].length-offset)/2);
 if(n<SR)throw Error("Potrzeba przynajmniej sekundy instrumentalu.");
 const mono=new Float32Array(n);
 for(let i=0;i<n;i++){const p=offset+i*2;mono[i]=(ch[0][p]+ch[1][p]+ch[0][p+1]+ch[1][p+1])*.25;}
 let peak=0,sq=0;for(const v of mono){peak=Math.max(peak,Math.abs(v));sq+=v*v;}
 log("Zakres analizy: "+start.toFixed(2)+"–"+(start+n/SR).toFixed(2)+" s; "+(n/SR).toFixed(2)+" s audio");
 log("Audio mono: peak "+peak.toFixed(5)+" · RMS "+Math.sqrt(sq/n).toFixed(5));
 say("Import ONNX Runtime 1.22.0 (CPU)");let ort,last;
 for(const cdn of CDNS)try{ort=await import(cdn+"ort.wasm.bundle.min.mjs");break;}catch(e){last=e;log("Import nieudany: "+e.message);}
 if(!ort)throw last||Error("Import ORT nieudany");
 say("Odczyt runtime WASM");
 const wasm=await bytes(files.wasm,CDNS.map(c=>c+"ort-wasm-simd-threaded.wasm"),"runtime WASM");
 if(wasm[0]!==0||wasm[1]!==97||wasm[2]!==115||wasm[3]!==109)throw Error("Nieprawidłowy plik WASM");
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmBinary=wasm;
 ort.env.wasm.wasmPaths={mjs:CDNS[0]+"ort-wasm-simd-threaded.mjs"};
 say("Odczyt modelu Basic Pitch ONNX");
 const model=await bytes(files.model,[MODEL],"model ONNX");
 if(model.length<10000||model[0]!==8)throw Error("Plik nie wygląda jak model ONNX");
 say("Tworzenie sesji Basic Pitch");session=await ort.InferenceSession.create(model,{executionProviders:["wasm"],graphOptimizationLevel:"basic"});
 log("Wejścia: "+session.inputNames.join(", ")+"; wyjścia: "+session.outputNames.join(", "));
 const noteName="StatefulPartitionedCall:1",onsetName="StatefulPartitionedCall:2";
 if(!session.outputNames.includes(noteName)||!session.outputNames.includes(onsetName))throw Error("Nieznany format wyjść Basic Pitch");
 say("Test kontrolny A4 / 440 Hz");
 const tone=new Float32Array(W);
 for(let i=PAD;i<Math.min(W,PAD+SR);i++){const t=(i-PAD)/SR,env=Math.max(0,Math.min(1,t/.02,(1-t)/.08));tone[i]=env*(.45*Math.sin(2*Math.PI*440*t)+.12*Math.sin(2*Math.PI*880*t)+.05*Math.sin(2*Math.PI*1320*t));}
 const testInput=new ort.Tensor("float32",tone,[1,W,1]);let testOut,testOk=false;
 try{
  testOut=await session.run({[session.inputNames[0]]:testInput},[noteName,onsetName]);
  const scores=new Float64Array(BINS),f=testOut[noteName].data;
  for(let t=20;t<85;t++)for(let p=0;p<BINS;p++)scores[p]+=f[t*BINS+p];
  const ranked=Array.from(scores,(v,p)=>({p:p+21,v:v/65})).sort((a,b)=>b.v-a.v);
  testOk=ranked[0].p===69;
  log("TEST A4: oczekiwane MIDI 69; top "+ranked.slice(0,5).map(x=>x.p+":"+x.v.toFixed(3)).join(" / ")+" · "+(testOk?"OK":"UWAGA"));
 }finally{testInput.dispose?.();if(testOut)for(const x of Object.values(testOut))x.dispose?.();}
 const chunks=Math.ceil(n/H),count=Math.min(chunks*142,Math.ceil(n/H*142));
 async function runPass(audio,focused){
 const decoder=noteDecoder(start,n/SR,focused);
 say(focused?"Rozpoznawanie melodii (bez dominującego basu)":"Rozpoznawanie nut pełnego instrumentalu");
 for(let k=0;k<chunks;k++){
  const block=new Float32Array(W),pos=k*H-PAD;
  for(let i=0;i<W;i++)if(pos+i>=0&&pos+i<n)block[i]=audio[pos+i];
  const input=new ort.Tensor("float32",block,[1,W,1]);let out;
  try{
   const t=performance.now();out=await session.run({[session.inputNames[0]]:input},[noteName,onsetName]);
   const f=out[noteName],o=out[onsetName];
   if(f.dims.join(",")!=="1,172,88"||o.dims.join(",")!=="1,172,88")throw Error("Nieoczekiwane wymiary: "+f.dims.join("×"));
   const take=Math.max(0,Math.min(142,count-k*142));decoder.push(f.data.subarray(15*BINS,(15+take)*BINS),o.data.subarray(15*BINS,(15+take)*BINS),take);
   if(chunks<=30||k===0||(k+1)%10===0||k+1===chunks)log((focused?"Melodia ":"Pełne pasmo ")+(k+1)+"/"+chunks+" · "+((performance.now()-t)/1000).toFixed(2)+" s");
  }finally{input.dispose?.();if(out)for(const value of Object.values(out))value.dispose?.();}
  onProgress((focused?.5:0)+.5*(k+1)/chunks);await pause();
 }
 return decoder.finish();
 }
 const raw=await runPass(mono,false),focused=await runPass(focusMelody(mono,true),true);
 const bassNotes=raw.filter(x=>x.pitch<48),melodyNotes=raw.filter(x=>x.pitch>=48);
 // Merge overlapping detections of the same pitch, keeping the unfiltered result.
 for(const x of focused){if(x.pitch<48)continue;if(!melodyNotes.some(y=>y.pitch===x.pitch&&Math.min(y.start+y.duration,x.start+x.duration)-Math.max(y.start,x.start)>Math.min(y.duration,x.duration)*.35))melodyNotes.push(x);}
 const notes=[...bassNotes,...melodyNotes].sort((a,b)=>a.start-b.start);
 log("Pełne pasmo: "+raw.length+" · filtr melodii: "+focused.length+" · bas: "+bassNotes.length+" · wyższe nuty: "+melodyNotes.length);
 const hist=new Map();for(const note of notes)hist.set(note.pitch,(hist.get(note.pitch)||0)+1);
 const pitches=[...hist.keys()].sort((a,b)=>a-b),range=pitches.length?[pitches[0],pitches.at(-1)]:null;
 log("Wykryto "+notes.length+" nut; zakres MIDI "+(range?range.join("–"):"brak")+"; histogram "+pitches.map(p=>p+":"+hist.get(p)).join(" "));
 return {notes,bassNotes,melodyNotes,rawCount:raw.length,focusedCount:focused.length,from:start,to:start+n/SR,range,testOk};
 }catch(e){log("BŁĄD ["+stage+"]: "+e.message);throw Error(stage+": "+e.message);}finally{if(session)try{await session.release();}catch{}}
}
export function addOriginalNotes(extra,notes,start,ratio,gain){
 const sr=44100,n=extra[0].length;if(gain<=0)return;
 // The detected notes retain their relative timing and pitch in the remix.
 for(const note of notes){
  const a=(note.start-start)/ratio,b=(note.start+note.duration-start)/ratio;
  if(b<=0||a>=n/sr||note.pitch<21||note.pitch>108)continue;
  const first=Math.max(0,Math.round(a*sr)),last=Math.min(n,Math.round(b*sr)),h=440*2**((note.pitch-69)/12),amp=.16*gain*Math.min(1,Math.max(.12,note.amp));
  for(let i=first;i<last;i++){const t=i/sr-a,release=b-i/sr,env=Math.min(1,t/.012,release/.035),p=2*Math.PI*h*t;
   const brass=q=>(Math.sin(q)+.48*Math.sin(q*2)+.32*Math.sin(q*3)+.24*Math.sin(q*4)+.17*Math.sin(q*5)+.1*Math.sin(q*6))*.48;
   const envelope=Math.max(0,env)*(.72+.28*Math.exp(-t*9)),a=brass(p),l=(a*.65+brass(p*.994)*.35)*envelope*amp,r=(a*.65+brass(p*1.006)*.35)*envelope*amp;
   extra[0][i]+=l;extra[1][i]+=r;
  }
 }
}