// Unpaired audio reference: a conservative accent overlay, not a source-separated arrangement model.
export function applyAudioStyle(plan,profile){
 if(profile?.kind!=="tojo-audio-style-profile"||!Array.isArray(profile.beatSubdivisionOnsetShareMean))throw Error("Nieprawidłowy profil StyleLab");
 const patterns=profile.beatSubdivisionOnsetShareMean;
 if(patterns.length!==5||patterns.some(a=>!Array.isArray(a)||a.length!==4||a.some(x=>!Number.isFinite(x)||x<0)))throw Error("Nieprawidłowe akcenty StyleLab");
 const events=plan.events.map(e=>{
  // Frequency bands are proxies only. Preserve notes, positions and vocal/source audio.
  const band=e.kind==="kick"?0:e.role==="bass"?1:e.kind==="closed"||e.kind==="open"?4:e.kind==="clap"?3:e.role==="upbeat"?2:null;
  if(band===null)return e;
  const step=((Math.round(e.time/plan.step)%4)+4)%4;
  const gain=Math.min(1.15,Math.max(.85,1+.12*(4*patterns[band][step]-1)));
  return {...e,velocity:Math.min(1,e.velocity*gain)};
 });
 return {...plan,events,audioStyle:true};
}
