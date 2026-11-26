// Paired StyleLab v1: small-data fitted tempo + measured accent and conservative backing gains.
export function pairedTempo(originalBpm,model){
 if(model?.kind!=="tojo-paired-style-v1"||!Number.isFinite(originalBpm)||originalBpm<=0)throw Error("Nieprawidłowy model lub tempo");
 let t=originalBpm;while(t<100)t*=2;while(t>200)t/=2;
 const p=model.tempo;
 return Math.round(Math.max(p.minBpm,Math.min(p.maxBpm,p.intercept+p.slope*t))*10)/10;
}
export function pairedAccents(plan,model){
 if(model?.kind!=="tojo-paired-style-v1"||!Number.isFinite(plan.step)||plan.step<=0)throw Error("Nieprawidłowy plan lub model par");
 const patterns=model.beatSubdivisionOnsetShareMean;
 const events=plan.events.map(e=>{
 const band=e.kind==="kick"?0:e.role==="bass"?1:e.kind==="closed"||e.kind==="open"?4:e.kind==="clap"?3:e.role==="upbeat"?2:null;
 if(band===null||!Number.isFinite(e.velocity))return e;
 const step=((Math.round(e.time/plan.step)%4)+4)%4;
 const gain=Math.max(.85,Math.min(1.15,1+.12*(4*patterns[band][step]-1)));
 return {...e,velocity:Math.min(1,e.velocity*gain)};
 });
 return {...plan,events,pairedStyle:true};
}
export function pairedGains(gains,model){
 // Full-mix band deltas are only proxies; don't treat them as isolated instruments.
 const r=model.medianBandEnergyRatio;
 const mapping={drums:r[0],bass:r[0],upbeat:r[4],pad:r[2],brass:r[3]};
 return Object.fromEntries(Object.entries(gains).map(([role,g])=>[role,Math.max(0,Math.min(2,g*Math.max(.85,Math.min(1.15,Math.pow(mapping[role]??1,.2)))))]));
}
