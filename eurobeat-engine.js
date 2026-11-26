// TOJO 0.3: event scheduler and role-based synthesis, derived from docs/eurobeat-rules.v1.json.
export const RULES={"clock":{"meter":[4,4],"stepsPerBar":16,"defaultBpm":156,"racingBpm":160,"swing":0,"phraseBars":[4,8,16]},"patterns":{"kick":[0,4,8,12],"snare":[4,12],"openHat":[2,6,10,14],"closedHat":[0,1,3,4,5,7,8,9,11,12,13,15],"upbeat":[2,6,10,14],"bassOctaves":[0,12,0,12],"fill":{"phraseBars":4,"steps":[13,14,15]}},"sections":{"intro":{"bars":8,"drums":0.55,"bass":0.55,"upbeat":0.4,"hook":0.35,"pad":0.7},"sabi":{"bars":8,"drums":1,"bass":1,"upbeat":0.8,"hook":1,"pad":0.65},"verse":{"bars":[8,16],"drums":0.85,"bass":0.85,"upbeat":0.55,"hook":0.08,"pad":0.4},"prechorus":{"bars":8,"drums":0.9,"bass":0.9,"upbeat":0.7,"hook":0.2,"pad":0.8},"chorus":{"bars":[8,16],"drums":1,"bass":1,"upbeat":0.85,"hook":0.3,"pad":0.8},"bridge":{"bars":8,"drums":0.55,"bass":0.55,"upbeat":0.35,"hook":0.5,"pad":0.8}},"sound":{"kick":{"decayMs":[100,160],"startHz":140,"endHz":48},"bass":{"fmRatio":2,"gate":[0.55,0.8],"releaseMs":[15,35],"sidechainRecoveryMs":[60,100]},"brass":{"detuneCents":[-9,0,9],"attackMs":[3,12],"releaseMs":[25,70],"scoopCents":[20,70]},"pad":{"highpassHz":200},"vocal":{"compressionRatio":2.5,"plateSeconds":0.7}},"mix":{"peakDbfs":-1,"center":["kick","bass","vocal"],"wide":["brass","pad"],"roleBuses":true}};

const SR=44100,PI2=Math.PI*2,clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),hz=p=>440*2**((p-69)/12),pause=()=>new Promise(r=>setTimeout(r,0));
export const ROLES=["drums","bass","upbeat","pad","brass","fx"];
export function planArrangement({bpm,chords,length,sections=[],sourceBass=null,melody=[],start=0,ratio=1,style="auto",preset="classic",lead=1,pitchGain=1}){
 const step=60/bpm/4,barTime=step*16,seconds=length/SR,events=[],labels=[],P=RULES.patterns;
 const emit=(role,kind,time,duration,velocity,pitch=0,pan=0,source="pattern")=>{if(time<seconds&&duration>0&&velocity>0)events.push({role,kind,time,duration:Math.min(duration,seconds-time),velocity,pitch,pan,source});};
 const total=Math.ceil(seconds/barTime),energy=sections.map(s=>s.energy||0),ref=Math.max(.004,...energy);
 let priorPitch=null,priorAt=-Infinity,sourceCount=0;
 for(let bar=0;bar<total;bar++){
  const at=bar*barTime,ch=chords[bar%chords.length],e=energy[bar]??ref,silent=e<Math.max(.004,ref*.075),rising=!silent&&(energy[bar+1]||0)>e*1.6,loud=e>=ref*.75;
  const type=silent?"sabi":rising?"prechorus":loud?"chorus":"verse",s=RULES.sections[type];
  labels.push({bar:bar+1,type:silent?"Przerwa instrumentalna":rising?"Narastanie (szacunek)":loud?"Mocny wokal":"Wokal",profile:type});
  const root=36+ch.root,third=ch.minor?3:4,tones=[0,third,7];
  for(let k=0;k<16;k++){
   const t=at+k*step;
   if(P.kick.includes(k))emit("drums","kick",t,.18,.82*s.drums);
   if(P.snare.includes(k))emit("drums","clap",t,.16,.53*s.drums);
   if(P.openHat.includes(k))emit("drums","open",t,Math.min(.15,step*1.45),.23*s.drums,0,.32);
   if(P.closedHat.includes(k))emit("drums","closed",t,step*.55,(k%2?.09:.14)*s.drums,0,-.27);
   let p=root,src="chord";
   if(sourceBass){
    const st=start+t*ratio,span=step*ratio;
    if(st>=sourceBass.from&&st<sourceBass.to){
     let best=null,score=-1;
     for(const note of sourceBass.notes){const overlap=Math.min(st+span,note.start+note.duration)-Math.max(st,note.start);if(overlap<=0)continue;
      const q=overlap/span+.2*(note.amp||0)-.007*(note.pitch-21);if(q>score){best=note;score=q;}}
     if(best){p=best.pitch;priorPitch=p;priorAt=t;src="detected";sourceCount++;}
     else if(priorPitch!==null&&t-priorAt<step*2.1){p=priorPitch;src="held";}
    }
   }
   while(p<33)p+=12;while(p>47)p-=12;p+=P.bassOctaves[k%P.bassOctaves.length];
   emit("bass","fm",t,step*(preset==="race"?.78:.68),.43*s.bass*(k%4===0?.73:1),p,0,src);
   if(style!=="rhythm"&&P.upbeat.includes(k))for(let j=0;j<tones.length;j++)emit("upbeat","pluck",t,step*1.35,.095*s.upbeat,60+ch.root+tones[j],(j-1)*.45);
  }
  if(style!=="rhythm")for(let j=0;j<tones.length;j++)emit("pad","pad",at,barTime*.94,.035*s.pad,60+ch.root+tones[j],(j-1)*.65);
  if(bar%4===0)emit("fx","crash",at,.6,.12);
  if((bar+1)%P.fill.phraseBars===0)for(const k of P.fill.steps)emit("fx","tom",at+k*step,step*.9,.18+(k-13)*.04,48+(15-k)*3);
 }
 // Source-note lead, one candidate per grid cell, never an unrelated fixed riff.
 // This is provisional contour selection, not full motif/section recognition.
 if(style==="auto"||style==="lead"){
  let previous=null,last=-Infinity;const candidates=melody.filter(x=>x.pitch>=48&&x.pitch<=96&&x.duration>=.065);
  for(let k=0;k<Math.ceil(seconds/step);k++){
   const t=k*step,st=start+t*ratio,bar=Math.floor(t/barTime),s=RULES.sections[labels[bar]?.profile||"verse"];
   const e=energy[bar]??ref,quiet=e<Math.max(.004,ref*.075);
   let best=null,score=-Infinity;
   for(const x of candidates){const delta=Math.abs(x.start-st);if(delta>step*ratio*.55)continue;
    const q=(x.amp||.4)+Math.min(.3,x.duration*.6)-(previous===null?0:Math.min(.4,Math.abs(x.pitch-previous)*.018))-delta*.8;
    if(q>score){score=q;best=x;}}
   if(!best||t-last<step*.6)continue;
   previous=best.pitch;last=t;
   const level=style==="lead"?Math.max(.45,s.hook):s.hook;
   if(pitchGain>0)emit("brass","brass",t,clamp(best.duration/ratio,step*.7,step*5),.28*level*lead*pitchGain,best.pitch,0,"detected");
   if(quiet&&style==="auto"&&k%8===4)emit("brass","bell",t+step,step*1.4,.065*lead*pitchGain,best.pitch+12,.4,"answer");
  }
 }
 events.sort((a,b)=>a.time-b.time);return {events,labels,sourceCount,step,counts:Object.fromEntries(ROLES.map(r=>[r,events.filter(e=>e.role===r).length]))};
}
const waves={};
function osc(pitch,kind,detune=0){
 const f=hz(pitch)*2**(detune/1200),h=Math.max(1,Math.min(20,Math.floor(16000/f))),key=kind+h,N=1024;
 if(!waves[key]){const a=new Float32Array(N);let peak=0;for(let i=0;i<N;i++){let x=0;for(let k=1;k<=h;k++){const w=kind==="square"?(k%2?1/k:0):kind==="brass"?Math.min(1,k*.6)/k:1/k;x+=w*Math.sin(PI2*i*k/N);}a[i]=x;peak=Math.max(peak,Math.abs(x));}for(let i=0;i<N;i++)a[i]/=peak||1;waves[key]=a;}
 let p=0;const a=waves[key],inc=f*N/SR;return()=>{const i=p|0,v=a[i]+(a[(i+1)%N]-a[i])*(p-i);p=(p+inc)%N;return v;};
}
function voice(e,preset,noise){
 const d=e.duration,f=hz(e.pitch),attack=t=>clamp(t/.003,0,1),env=(t,a=.005,r=.025)=>clamp(t/a,0,1)*clamp((d-t)/r,0,1);
 let prev=0,lp=0;
 switch(e.kind){
 case "kick":return t=>(Math.sin(PI2*(48*t+92*(1-Math.exp(-t*75))/75))*Math.exp(-t*22)+.18*noise()*Math.exp(-t*190))*attack(t)*clamp((d-t)/.015,0,1);
 case "clap":return t=>{const x=noise(),hp=x-prev;prev=x;const bursts=Math.exp(-t*95)+.7*Math.exp(-Math.abs(t-.014)*130)+.5*Math.exp(-Math.abs(t-.027)*120);return (.32*hp*bursts+.23*Math.sin(PI2*192*t)*Math.exp(-t*27)+.17*hp*Math.exp(-t*26))*attack(t)*clamp((d-t)/.012,0,1);};
 case "open":case "closed":case "crash":return t=>{const x=noise(),hp=x-prev;prev=x;const decay=e.kind==="open"?24:e.kind==="crash"?8:75;return (.55*hp+.12*Math.sin(PI2*4273*t)*Math.sin(PI2*3017*t))*Math.exp(-t*decay)*env(t,.001,.015);};
 case "tom":return t=>Math.sin(PI2*(f*t+.8*(1-Math.exp(-t*50))))*Math.exp(-t*22)*env(t,.002,.014);
 case "fm":{const o=osc(e.pitch,"saw");return t=>{const fm=Math.sin(PI2*f*t+1.9*Math.exp(-t*35)*Math.sin(PI2*f*2*t));const x=o();lp+=(x-lp)*(.08+.30*Math.exp(-t*35));return (.55*fm+.45*lp)*env(t,.003,.018);};}
 case "pluck":{const o=osc(e.pitch,"square"),a=osc(e.pitch+12,"saw");return t=>(.55*o()+.25*a())*env(t,.004,.035)*Math.exp(-t*13);}
 case "pad":{const a=osc(e.pitch,"saw",-9),b=osc(e.pitch,"saw",9);return t=>{lp+=(.5*(a()+b())-lp)*.11;return lp*env(t,.085,.12);};}
 case "bell":return t=>(Math.sin(PI2*f*t)+.35*Math.sin(PI2*f*2.01*t)*Math.exp(-t*13))*env(t,.002,.03)*Math.exp(-t*7);
 case "brass":{const a=osc(e.pitch,"brass",-9),b=osc(e.pitch,"brass",9),c=osc(e.pitch,"brass");return t=>{const x=.32*a()+.32*b()+.36*c();lp+=(x-lp)*(preset==="dark"?.12:.3);return (.75*lp+.25*x)*env(t,.006,.045)*(.78+.22*Math.exp(-t*12));};}
 default:return ()=>0;
 }
}
export async function renderArrangement(plan,length,{preset="classic",gains={},solo="all"}={},onProgress=()=>{}){
 // Process one role at a time: independent stereo bus, no six full stereo arrays in memory.
 const out=[new Float32Array(length),new Float32Array(length)];let seed=1234567;
 const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 for(let j=0;j<ROLES.length;j++){
  const role=ROLES[j],gain=Number(gains[role]??1),bus=[new Float32Array(length),new Float32Array(length)];
  for(const e of plan.events){if(e.role!==role)continue;const gen=voice(e,preset,noise),a=Math.round(e.time*SR),n=Math.min(length-a,Math.round(e.duration*SR)),l=Math.sqrt((1-e.pan)/2)*e.velocity,r=Math.sqrt((1+e.pan)/2)*e.velocity;
   for(let i=0;i<n;i++){const v=gen(i/SR);bus[0][a+i]+=v*l;bus[1][a+i]+=v*r;}
  }
  if(solo==="all"||solo===role)for(let i=0;i<length;i++){
   const t=i/SR,phase=t%(plan.step*4),duck=(role==="bass"||role==="pad")?1-.45*Math.exp(-phase/.065):1;
   out[0][i]+=bus[0][i]*gain*duck;out[1][i]+=bus[1][i]*gain*duck;
  }
  onProgress((j+1)/ROLES.length);await pause();
 }
 return out;
}
export function peakGuard(ch,db=-1){let peak=0;for(const a of ch)for(const x of a)peak=Math.max(peak,Math.abs(x));const g=Math.min(1,10**(db/20)/Math.max(peak,1e-9));for(const a of ch)for(let i=0;i<a.length;i++)a[i]*=g;return ch;}
