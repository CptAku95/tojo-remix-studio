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
 const a=downmix(ch,offset,60),rate=SR/4,N=2048,H=256;
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
 const key=keyFor(chroma),chords=[];for(let bar=0;bar<8;bar++){const c=new Float64Array(12);for(const f of frames)if(f.time>=phase+bar*4*period&&f.time<phase+(bar+1)*4*period)for(let i=0;i<12;i++)c[i]+=f.c[i];if(c.some(v=>v>0))chords.push(chordFor(c,key));}
 onProgress(1);return {bpm:Math.round(best.bpm*10)/10,beat:phase,key:NOTES[key.root]+(key.minor?"m":""),keyScore:key.score,tempoScore:best.score,chords:chords.length?chords:[NOTES[key.root]+(key.minor?"m":"")],seconds:a.length/rate};
}
export function parseChords(s){
 const tokens=s.trim().split(/[\s,|]+/).filter(Boolean);
 if(!tokens.length||tokens.length>32)throw Error("Wpisz od 1 do 32 akordów, np. Am F C G.");
 return tokens.map(v=>{const m=/^([A-Ga-g])([#b]?)(m|min)?$/.exec(v);if(!m)throw Error("Nieobsługiwany akord: "+v);const base=NOTES.indexOf(m[1].toUpperCase());return {root:(base+(m[2]==="#"?1:m[2]==="b"?-1:0)+12)%12,minor:!!m[3]};});
}
// WSOLA: local waveform alignment, preserving pitch better than changing playback speed.
export async function stretch(ch,start,ratio,length,onProgress=()=>{}){
 const W=2048,H=1024,R=384,step=8,origin=Math.round(start*SR),out=[new Float32Array(length),new Float32Array(length)];
 const win=Float32Array.from({length:W},(_,i)=>.5-.5*Math.cos(TAU*(i+.5)/W)),weight=new Float32Array(length);
 const read=(c,i)=>i>=origin&&i<ch[c].length?ch[c][i]:0;
 for(let p=0,k=0;p<length;p+=H,k++){
  const expected=origin+Math.round(p*ratio);let at=expected,best=-Infinity;
  if(p>0&&expected<ch[0].length){
   for(let shift=-R;shift<=R;shift+=step){const pos=expected+shift;if(pos<origin)continue;let ab=0,aa=0,bb=0;
    for(let j=64;j<H-64&&p+j<length;j+=16){if(weight[p+j]<.01)continue;const a=(out[0][p+j]+out[1][p+j])/(2*weight[p+j]),b=(read(0,pos+j)+read(1,pos+j))*.5;ab+=a*b;aa+=a*a;bb+=b*b;}
    const score=ab/Math.sqrt(aa*bb+1e-14)-.012*Math.abs(shift)/R;if(score>best){best=score;at=pos;}
   }
  }
  for(let j=0;j<W&&p+j<length;j++){const w=win[j];weight[p+j]+=w;out[0][p+j]+=read(0,at+j)*w;out[1][p+j]+=read(1,at+j)*w;}
  if(k%80===0){onProgress(p/length);await pause();}
 }
 for(let i=0;i<length;i++){const w=Math.max(weight[i],1e-8);out[0][i]/=w;out[1][i]/=w;}onProgress(1);return out;
}
export async function backing(bpm,chords,length,style,onProgress=()=>{}){
 const out=[new Float32Array(length),new Float32Array(length)],beat=60/bpm;
 let seed=123456;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 function add(at,dur,amp,pan,voice){const start=Math.round(at*SR),n=Math.min(Math.round(dur*SR),length-start);const l=Math.sqrt((1-pan)/2)*amp,r=Math.sqrt((1+pan)/2)*amp;for(let i=0;i<n;i++){const v=voice(i/SR,i);out[0][start+i]+=v*l;out[1][start+i]+=v*r;}}
 const env=(t,d,a=.004)=>Math.min(1,t/a)*Math.max(0,Math.min(1,(d-t)/.025));
 const saw=(t,h,phase=0)=>{let v=0;for(let k=1;k<=Math.min(9,Math.floor(19000/h));k++)v+=Math.sin(TAU*(h*t*k+phase*k))/k;return v*.65;};
 const notes=[0,0,7,12,0,0,7,12,0,12,7,0,0,7,12,7];
 const total=Math.ceil(length/SR/beat);
 for(let b=0;b<total;b++){
  const at=b*beat,bar=Math.floor(b/4),ch=chords[bar%chords.length],root=36+ch.root,third=ch.minor?3:4;
  add(at,.25,.68,0,t=>Math.sin(TAU*(48*t+5.7*(1-Math.exp(-t*45))))*Math.exp(-t*17)+.09*noise()*Math.exp(-t*140));
  if(b%2===1)add(at,.20,.31,0,t=>(.82*noise()+.18*Math.sin(TAU*180*t))*Math.exp(-t*23));
  for(let j=0;j<2;j++){let prev=0;add(at+j*beat/2,j?.16:.065,j?.16:.09,j?.3:-.25,t=>{const n=noise(),v=(n-prev)*.6;prev=n;return v*Math.exp(-t*(j?24:62));});}
  for(let j=0;j<4;j++){const d=beat*.21,note=root+notes[(b%4)*4+j],h=freq(note);add(at+j*beat/4,d,.29,0,t=>env(t,d)*(.54*saw(t,h)+.46*Math.sin(TAU*h*t)));}
  if(style!=="rhythm"){
   const d=beat*.31;for(const interval of [0,third,7]){const h=freq(60+ch.root+interval);add(at+beat*.5,d,.075,interval===0?-.45:.45,t=>env(t,d)*(.6*saw(t,h)+.4*saw(t,h*1.006)));}
   if(style==="lead"){for(let j=0;j<2;j++){const degree=[0,7,third,7,12,7,third,7][(b%4)*2+j],h=freq(72+ch.root+degree),d=beat*.39;add(at+j*beat*.5,d,.085,-.1,t=>env(t,d)*(.55*saw(t,h)+.45*saw(t,h*.996)));}}
  }
  if(b%8===0){onProgress(b/total);await pause();}
 }
 onProgress(1);return out;
}
export function mix(v,inst,vGain,iGain){
 const n=v[0].length,output=[new Float32Array(n),new Float32Array(n)];let peak=0;
 for(let c=0;c<2;c++)for(let i=0;i<n;i++){const x=v[c][i]*vGain+inst[c][i]*iGain;output[c][i]=x;peak=Math.max(peak,Math.abs(x));}
 const scale=Math.min(1,.96/Math.max(1e-8,peak));for(const c of output)for(let i=0;i<n;i++)c[i]*=scale;return output;
}
export {SR};