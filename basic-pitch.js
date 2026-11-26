// Spotify Basic Pitch 1.0.1: local inference; no audio upload.
const PACKAGE="https://esm.sh/@spotify/basic-pitch@1.0.1?deps=@tensorflow/tfjs@3.21.0";
const TF="https://esm.sh/@tensorflow/tfjs@3.21.0";
const MODEL="https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json";
export async function transcribe(ch,start,seconds,onStatus=()=>{},onProgress=()=>{}){
 const sr=44100,offset=Math.round(start*sr),n=Math.floor(Math.min(seconds*sr,ch[0].length-offset)/2);
 if(n<22050)throw Error("Potrzeba przynajmniej sekundy instrumentalu.");
 const mono=new Float32Array(n);
 for(let i=0;i<n;i++){const p=offset+i*2;mono[i]=(ch[0][p]+ch[1][p]+ch[0][p+1]+ch[1][p+1])*.25;}
 onStatus("Ładuję bibliotekę Basic Pitch…");
 const [tf,bp]=await Promise.all([import(TF),import(PACKAGE)]);
 if(!await tf.setBackend("cpu"))throw Error("Nie udało się uruchomić procesora TensorFlow.");
 await tf.ready();
 onStatus("Pobieram model Basic Pitch…");
 const model=await tf.loadGraphModel(MODEL);
 const frames=[],onsets=[];
 try{
  const pitch=new bp.BasicPitch(Promise.resolve(model));
  onStatus("Rozpoznaję nuty oryginalnego instrumentalu…");
  await pitch.evaluateModel(mono,(f,o)=>{for(const row of f)frames.push(row);for(const row of o)onsets.push(row);},onProgress);
  const notes=bp.noteFramesToTime(bp.outputToNotesPoly(frames,onsets,.35,.30,7))
   .map(x=>({start:x.startTimeSeconds+start,duration:x.durationSeconds,pitch:x.pitchMidi,amp:x.amplitude}))
   .filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.duration)&&Number.isFinite(x.pitch)&&Number.isFinite(x.amp)&&x.duration>0&&x.start<start+n/22050&&x.pitch>=21&&x.pitch<=108)
   .sort((a,b)=>a.start-b.start);
  return {notes,from:start,to:start+n/22050};
 }finally{model.dispose();}
}
export function addOriginalNotes(extra,notes,start,ratio,gain){
 const sr=44100,n=extra[0].length;if(gain<=0)return;
 // The detected notes retain their relative timing and pitch in the remix.
 for(const note of notes){
  const a=(note.start-start)/ratio,b=(note.start+note.duration-start)/ratio;
  if(b<=0||a>=n/sr||note.pitch<48||note.pitch>90)continue;
  const first=Math.max(0,Math.round(a*sr)),last=Math.min(n,Math.round(b*sr)),h=440*2**((note.pitch-69)/12),amp=.085*gain*Math.min(1,Math.max(.12,note.amp));
  for(let i=first;i<last;i++){const t=i/sr-a,release=b-i/sr,env=Math.min(1,t/.012,release/.035),p=2*Math.PI*h*t;
   const x=(Math.sin(p)+.44*Math.sin(p*2)+.23*Math.sin(p*3)+.10*Math.sin(p*4))*.55*amp*Math.max(0,env);
   extra[0][i]+=x;extra[1][i]+=x;
  }
 }
}