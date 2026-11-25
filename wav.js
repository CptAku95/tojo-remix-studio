// PCM16 WAV encoder; interleaved channels, no normalization or effects.
export function encodeWav(buffer, start=0, duration=buffer.duration){
 const channels=Math.min(2,buffer.numberOfChannels), rate=buffer.sampleRate;
 const offset=Math.max(0,Math.min(buffer.length,Math.floor(start*rate)));
 const frames=Math.max(0,Math.min(buffer.length-offset,Math.floor(duration*rate)));
 if(!frames) throw new Error("Pusty fragment audio.");
 const bytes=frames*channels*2;
 if(bytes>0xffffffff-36) throw new Error("Za duży plik WAV.");
 const out=new ArrayBuffer(44+bytes), v=new DataView(out);
 const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};
 str(0,"RIFF");v.setUint32(4,36+bytes,true);str(8,"WAVE");str(12,"fmt ");
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);
 v.setUint16(34,16,true);str(36,"data");v.setUint32(40,bytes,true);
 const planes=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
 let p=44;for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){
 const x=Math.max(-1,Math.min(1,planes[c][offset+i]||0));v.setInt16(p,x<0?Math.round(x*32768):Math.round(x*32767),true);p+=2;}
 return new Blob([out],{type:"audio/wav"});
}