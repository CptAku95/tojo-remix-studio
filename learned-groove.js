// Optional learned groove overlay. Preserve the original harmonic pitches and kick grid.
export function applyLearnedGroove(plan,model,seed=2026){
 if(model?.kind!=="tojo-groove-v1")throw Error("Nieobsługiwany model groove");
 let state=seed>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const groups=new Map(),output=[];
 for(const e of plan.events){
  const r=e.role==="bass"?"bass":e.role==="brass"?"lead":e.role==="upbeat"?"harmony":null;
  if(!r){output.push(e);continue}
  const pos=Math.round(e.time/plan.step),cell=model.roles[r]?.steps[pos%16];
  if(!cell||!Number.isFinite(cell.prob)){output.push(e);continue}
  const key=r+":"+pos;
  if(!groups.has(key))groups.set(key,rand());
  // Retain detected melodic content and the downbeat bass. Keep harmony stacks together.
  const keep=r==="lead"||r==="bass"&&pos%4===0||groups.get(key)<.35+.65*cell.prob;
  if(!keep)continue;
  const gate=Math.max(.3,Math.min(1.8,cell.gate||1)),vel=Math.max(.7,Math.min(1.2,(cell.velocity||.65)/.75));
  output.push({...e,duration:Math.min(e.duration,plan.step*gate),velocity:e.velocity*vel});
 }
 output.sort((a,b)=>a.time-b.time);
 return {...plan,events:output,counts:Object.fromEntries(Object.keys(plan.counts).map(r=>[r,output.filter(e=>e.role===r).length])),learnedGroove:true};
}
