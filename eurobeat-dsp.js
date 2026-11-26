const SR=44100, TAU=2*Math.PI;
const NOTES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const MAJOR=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const freq=m=>440*2**((m-69)/12);
const pause=()=>new Promise(r=>setTimeout(r,0));
function fft(re,im){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
 for(let k=2;k<=n;k*=2){const a=-TAU/k,wr=Math.cos(a),wi=Math.sin(a);
  for(let i=0;i<n;i+=k){let ur=1,ui=0;for(let j=0;j<k/2;j++){const p=i+j,q=p+k/2,tr=ur*re[q]-ui*im[q],ti=ur*im[q]+ui*re[q];re[q]=re[p]-tr;im[q]=im[p]-ti;re[p]+=tr;im[p]+=ti;const t=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=t;}}
 }
}
function downmix(ch,start=0,seconds=60){const offset=Math.max(0,Math.floor(start*SR)),n=Math.max(0,Math.min(Math.floor(seconds*SR/4),Math.floor((ch[0].length-offset)/4)));const a=new Float32Array(n);for(let i=0;i<n;i++){let x=0;for(let j=0;j<4;j++)x+=(ch[0][offset+i*4+j]+ch[1][offset+i*4+j])*.125;a[i]=x;}return a;}
function corr(a,b){const ma=a.reduce((s,x)=>s+x,0)/a.length,mb=b.reduce((s,x)=>s+x,0)/b.length;let aa=0,bb=0,ab=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;aa+=x*x;bb+=y*y;ab+=x*y;}return ab/Math.sqrt(aa*bb+1e-20);}
function keyFor(c){let best={root:0,minor:false,score:-Infinity};for(let root=0;root<12;root++)for(const minor of [false,true]){const profile=Array.from({length:12},(_,i)=>(minor?MINOR:MAJOR)[(i-root+12)%12]);const score=corr(c,profile);if(score>best.score)best={root,minor,score};}return best;}
function chordFor(c,key){let best={score:-Infinity,root:key.root,minor:key.minor};const total=c.reduce((a,b)=>a+b,0);if(total<1e-8)return NOTES[key.root]+(key.minor?"m":"");for(let r=0;r<12;r++)for(const minor of [false,true]){const third=(r+(minor?3:4))%12,fifth=(r+7)%12;const score=(1.25*c[r]+c[third]+.8*c[fifth]-.28*(total-c[r]-c[third]-c[fifth]))/total+(r===key.root?.035:0);if(score>best.score)best={score,root:r,minor};}return NOTES[best.root]+(best.minor?"m":"");}
export async function analyze(ch,offset=0,onProgress=()=>{}){
 const a=downmix(ch,offset,600),rate=SR/4,N=2048,H=256;
 if(a.length<rate*2)throw Error("Do analizy potrzeba przynajmniej 2 sekund muzyki.");
 const re=new Float64Array(N),im=new Float64Array(N),prev=new Float64Array(N/2),win=Float64Array.from({length:N},(_,i)=>.5-.5*Math.cos(TAU*i/N));
 const flux=[],chroma=new Float64Array(12),frames=[];
 for(let p=0,k=0;p+N<=a.length;p+=H,k++){
  im.fill(0);for(let i=0;i<N;i++)re[i]=a[p+i]*win[i];fft(re,im);
  let f=0;for(let b=2;b<N/2;b++){const v=Math.log1p(Math.hypot(re[b],im[b]));f+=Math.max(0,v-prev[b])*(b<30?2:1);prev[b]=v;}
  flux.push(f);
  if(k%4===0){const c=new Float64Array(12);for(let b=9;b<370;b++){
    const m=Math.hypot(re[b],im[b]),l=Math.hypot(re[b-1],im[b-1]),rr=Math.hypot(re[b+1],im[b+1]);if(m<=l||m<=rr||m<.03)continue;
    const delta=clamp(.5*(l-rr)/(l-2*m+rr||-1),-.5,.5),hz=(b+delta)*rate/N,midi=69+12*Math.log2(hz/440),pc=(Math.round(midi)%12+12)%12;
    c[pc]+=Math.sqrt(m)*Math.max(0,1-Math.abs(midi-Math.round(midi)));
   }const sum=c.reduce((x,y)=>x+y,0);if(sum>0){for(let i=0;i<12;i++){c[i]/=sum;chroma[i]+=c[i];}frames.push({time:(p+N/2)/rate,c});}}
  if(k%120===0){onProgress(p/a.length);await pause();}
 }
 const hz=rate/H,mean=flux.reduce((s,x)=>s+x,0)/flux.length;
 const x=flux.map(v=>Math.max(0,v-mean*.7));let best={bpm:120,score:-Infinity};
 function lagScore(l){let ab=0,aa=0,bb=0;for(let i=l;i<x.length;i++){ab+=x[i]*x[i-l];aa+=x[i]*x[i];bb+=x[i-l]*x[i-l];}return ab/Math.sqrt(aa*bb+1e-20);}
 for(let bpm=65;bpm<=190;bpm+=.5){const l=Math.round(60*hz/bpm);if(l*2>=x.length)continue;const s=lagScore(l)+.35*lagScore(2*l)+.04*(1-Math.abs(bpm-122)/70);if(s>best.score)best={bpm,score:s};}
 const period=60/best.bpm;let phase=0,phaseScore=-1;
 for(let q=0;q<period;q+=1/hz){let s=0;for(let i=0;i<x.length;i++){const t=(i*H+N/2)/rate,d=Math.abs(((t-q+period/2)%period+period)%period-period/2);if(d<.065)s+=x[i]*(1-d/.065);}if(s>phaseScore){phaseScore=s;phase=q;}}
 const key=keyFor(chroma),chords=[],count=Math.min(512,Math.max(1,Math.ceil((a.length/rate-phase)/(4*period))));
 const bins=Array.from({length:count},()=>new Float64Array(12));
 for(const f of frames){const b=Math.floor((f.time-phase)/(4*period));if(b>=0&&b<count)for(let i=0;i<12;i++)bins[b][i]+=f.c[i];}
 for(const c of bins)chords.push(c.some(v=>v>0)?chordFor(c,key):(chords.at(-1)||NOTES[key.root]+(key.minor?"m":"")));
 onProgress(1);return {bpm:Math.round(best.bpm*10)/10,beat:phase,key:NOTES[key.root]+(key.minor?"m":""),keyScore:key.score,tempoScore:best.score,chords:chords.length?chords:[NOTES[key.root]+(key.minor?"m":"")],seconds:a.length/rate};
}
export function parseChords(s){
 const tokens=s.trim().split(/[\s,|]+/).filter(Boolean);
 if(!tokens.length||tokens.length>512)throw Error("Wpisz od 1 do 512 akordów, np. Am F C G.");
 return tokens.map(v=>{const m=/^([A-Ga-g])([#b]?)(m|min)?$/.exec(v);if(!m)throw Error("Nieobsługiwany akord: "+v);const base=NOTES.indexOf(m[1].toUpperCase());return {root:(base+(m[2]==="#"?1:m[2]==="b"?-1:0)+12)%12,minor:!!m[3]};});
}
// WSOLA: local waveform alignment, preserving pitch better than changing playback speed.
export async function stretch(ch,start,ratio,length,onProgress=()=>{}){
 const W=2048,H=1024,R=384,step=8,origin=Math.round(start*SR),out=ch.map(()=>new Float32Array(length));
 if(ch.length!==2&&ch.length!==4)throw Error("Nieprawidłowa liczba kanałów");
 if(Math.abs(ratio-1)<1e-7){for(let c=0;c<ch.length;c++)out[c].set(ch[c].subarray(origin,origin+length));onProgress(1);return out;}
 const win=Float32Array.from({length:W},(_,i)=>.5-.5*Math.cos(TAU*(i+.5)/W)),weight=new Float32Array(length);
 const read=(c,i)=>i>=origin&&i<ch[c].length?ch[c][i]:0;
 for(let p=0,k=0;p<length;p+=H,k++){
  const expected=origin+Math.round(p*ratio);let at=expected,best=-Infinity;
  if(p>0&&expected<ch[0].length){
   for(let shift=-R;shift<=R;shift+=step){const pos=expected+shift;if(pos<origin)continue;let ab=0,aa=0,bb=0;
    for(let j=64;j<H-64&&p+j<length;j+=16){if(weight[p+j]<.01)continue;let a=0,b=0;for(let c=0;c<ch.length;c++){a+=out[c][p+j]/weight[p+j];b+=read(c,pos+j);}a/=ch.length;b/=ch.length;ab+=a*b;aa+=a*a;bb+=b*b;}
    const score=ab/Math.sqrt(aa*bb+1e-14)-.012*Math.abs(shift)/R;if(score>best){best=score;at=pos;}
   }
  }
  for(let j=0;j<W&&p+j<length;j++){const w=win[j];weight[p+j]+=w;for(let c=0;c<ch.length;c++)out[c][p+j]+=read(c,at+j)*w;}
  if(k%80===0){onProgress(p/length);await pause();}
 }
 for(let i=0;i<length;i++){const w=Math.max(weight[i],1e-8);for(let c=0;c<ch.length;c++)out[c][i]/=w;}onProgress(1);return out;
}
const T=2048,tables={};
function oscillator(kind,h){
 const band=Math.max(1,Math.min(24,Math.floor(17000/h))),key=kind+band;
 if(!tables[key]){const a=new Float32Array(T);let max=0;for(let i=0;i<T;i++){let x=0;for(let k=1;k<=band;k++){const amp=kind==="square"?(k%2?1/k:0):kind==="brass"?Math.min(1,k*.55)*Math.exp(-k/19)/k:1/k;x+=amp*Math.sin(TAU*i*k/T);}a[i]=x;max=Math.max(max,Math.abs(x));}for(let i=0;i<T;i++)a[i]/=max||1;tables[key]=a;}
 const a=tables[key],inc=h*T/SR;let p=0;return()=>{const k=p|0,f=p-k,x=a[k]*(1-f)+a[(k+1)%T]*f;p=(p+inc)%T;return x;};
}
export function arrangement(v,bpm){
 const n=v[0].length,bar=4*60/bpm*SR,count=Math.ceil(n/bar),energy=[];
 for(let b=0;b<count;b++){let sum=0,k=0;for(let i=Math.floor(b*bar);i<Math.min(n,(b+1)*bar);i+=16){sum+=(v[0][i]**2+v[1][i]**2)*.5;k++;}energy.push(Math.sqrt(sum/Math.max(1,k)));}
 const sorted=energy.slice().sort((a,b)=>a-b),ref=sorted[Math.floor((sorted.length-1)*.75)]||.01,peak=Math.max(...energy,1e-8);
 return energy.map((e,i)=>{const silent=e<Math.max(.004,peak*.075),loud=e>Math.max(.008,ref*.8);return {bar:i+1,type:silent?"Riff / przerwa":loud?"Mocna sekcja":(energy[i+1]||0)>e*1.5?"Narastanie":"Zwrotka",energy:e,lead:silent?1:loud?.24:.12,power:silent||loud?1:.70};});
}
// Pick the original bass pitch closest to this sixteenth-note cell.
// Preserve pitch class, with octave alternation in Eurobeat rhythm.
export function bassAt(notes,t,step){
 let best=null,score=-Infinity;
 for(const n of notes){
  const overlap=Math.min(t+step,n.start+n.duration)-Math.max(t,n.start);
  if(overlap<=0)continue;
  const value=overlap/step+.25*(n.amp||0)-.003*n.pitch;
  if(value>score){score=value;best=n;}
 }
 return best?best.pitch:null;
}
export async function backing(bpm,chords,length,style,onProgress=()=>{},opts={}){
 const out=[new Float32Array(length),new Float32Array(length)],beat=60/bpm,sections=opts.sections||[],sourceBass=opts.sourceBass||null,preset=opts.preset||"classic",dark=preset==="dark",race=preset==="race",leadAmount=Number(opts.lead??1);
 let seed=123456;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 function add(at,dur,amp,pan,voice){const start=Math.round(at*SR),n=Math.min(Math.round(dur*SR),length-start),l=Math.sqrt((1-pan)/2)*amp,r=Math.sqrt((1+pan)/2)*amp;for(let i=0;i<n;i++){const v=voice(i/SR);out[0][start+i]+=v*l;out[1][start+i]+=v*r;}}
 const env=(t,d,a=.004)=>Math.min(1,t/a)*Math.max(0,Math.min(1,(d-t)/.022));
 function synth(at,d,h,amp,pan,kind,detune=.007){const a=oscillator(kind,h),b=oscillator(kind,h*(1+detune)),c=oscillator(kind,h*(1-detune));let low=0;add(at,d,amp,pan,t=>{const x=.5*a()+.25*b()+.25*c();low+=(x-low)*(dark?.18:.32);return env(t,d,.012)*(low*.72+x*.28);});}
 const riff=[0,7,12,7,0,2,7,12,7,0,7,12,0,7,2,0],bass=[0,12,0,12,0,12,7,12,0,12,0,12,0,7,12,7],total=Math.ceil(length/SR/beat);
 for(let b=0;b<total;b++){
  const at=b*beat,bar=Math.floor(b/4),ch=chords[bar%chords.length],root=36+ch.root,third=ch.minor?3:4,sec=sections[bar]||{power:1,lead:.55},pow=sec.power;
  add(at,.26,.82,0,t=>Math.sin(TAU*(48*t+2.6*(1-Math.exp(-t*65))))*Math.exp(-t*15)+.10*noise()*Math.exp(-t*125));
  if(b%2===1){let last=0;add(at,.19,.32,0,t=>{const n=noise(),hp=n-last;last=n;return (.63*hp+.27*Math.sin(TAU*185*t))*Math.exp(-t*25);});}
  for(let j=0;j<(race?4:2);j++){let prev=0;const frac=j/(race?4:2),off=frac===.5;add(at+frac*beat,off?.17:.055,off?.17:.065,off?.4:-.35,t=>{const n=noise(),v=(n-prev)*.55;prev=n;return v*Math.exp(-t*(off?22:78));});}
  for(let j=0;j<4;j++){
   let pitch=root+bass[(b%4)*4+j];
   if(sourceBass){const t=sourceBass.start+(at+j*beat/4)*sourceBass.ratio,step=beat/4*sourceBass.ratio;
    if(t>=sourceBass.from&&t+step<=sourceBass.to+.02){const original=bassAt(sourceBass.notes,t,step);if(original===null)continue;pitch=original;while(pitch<33)pitch+=12;while(pitch>47)pitch-=12;if(j%2===1)pitch+=12;}
   }
   const d=beat*(race?.235:.21),h=freq(pitch),o=oscillator("saw",h),sub=oscillator("square",h/2);let low=0;add(at+j*beat/4,d,.36*pow,0,t=>{const x=o();low+=(x-low)*(.035+.24*Math.exp(-t*26));return env(t,d)*(j===0?Math.min(1,.25+t*16):1)*(.65*low+.35*sub());});}
  if(style!=="rhythm"){
   const d=beat*(race?.36:.42);for(const interval of [0,third,7])synth(at+beat*.5,d,freq(60+ch.root+interval),.105*pow,interval===0?-.5:.5,"brass");
   if(style==="lead"||style==="auto"){
    const level=style==="lead"?Math.max(.48,sec.lead):sec.lead;
    for(let j=0;j<2;j++){const degree=riff[(b%8)*2+j],h=freq(72+ch.root+(degree===2?third:degree)),d=beat*.43,gain=.19*level*leadAmount;
     if(gain>0){synth(at+j*beat*.5,d,h,gain,-.22,"brass",race?.013:.006);synth(at+j*beat*.5+beat*.005,d,h,gain*.55,.55,"saw",.011);if(sec.lead>.7)synth(at+j*beat*.5,d,h*2,gain*.24,.1,"brass");}
    }
   }
  }
  if(b%4===0&&bar%4===0){let last=0;add(at,.7,.11,0,t=>{const n=noise(),v=n-last;last=n;return v*Math.exp(-t*7);});}
  if(b%16===15)for(let j=1;j<4;j++)add(at+j*beat/4,.075,.16+j*.025,0,t=>(noise()*.65+Math.sin(TAU*190*t)*.35)*Math.exp(-t*45));
  if(b%8===0){onProgress(b/total);await pause();}
 }
 for(let c=0;c<2;c++)for(let i=0;i<length;i++){const x=out[c][i];out[c][i]=x/(1+.38*Math.abs(x));}
 onProgress(1);return out;
}
// Retain the original instrumental as the base. Optional gentle low-band
// attenuation makes room for the added bass; no source replacement.
export function enrichInstrumental(original,extra,bpm,baseGain,extraGain,lowCut=0){
 const n=original[0].length,out=[new Float32Array(n),new Float32Array(n)];
 const alpha=1-Math.exp(-2*Math.PI*150/SR);
 for(let c=0;c<2;c++){let low=0;for(let i=0;i<n;i++){
  const x=original[c][i];low+=alpha*(x-low);
  out[c][i]=(x-clamp(lowCut,0,.8)*low)*baseGain+extra[c][i]*extraGain;
 }}
 let peak=0;for(const ch of out)for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(ch[i]));
 const scale=Math.min(1,.96/Math.max(peak,1e-8));for(const ch of out)for(let i=0;i<n;i++)ch[i]*=scale;
 return out;
}
export function mix(v,inst,vGain,iGain){
 const n=v[0].length,output=[new Float32Array(n),new Float32Array(n)];let peak=0;
 for(let c=0;c<2;c++)for(let i=0;i<n;i++){const x=v[c][i]*vGain+inst[c][i]*iGain;output[c][i]=x;peak=Math.max(peak,Math.abs(x));}
 const scale=Math.min(1,.96/Math.max(1e-8,peak));for(const c of output)for(let i=0;i<n;i++)c[i]*=scale;return output;
}
export {SR};