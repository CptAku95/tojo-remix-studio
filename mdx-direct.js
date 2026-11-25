// Direct MDX execution: model bytes go straight to ORT, no blob: fetch.
const CDN="https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.22.0/";
const CONFIG={
 UVR_MDXNET_KARA_2:{n:5120,f:2048,primary:"instrumental",gain:1.065},
 "UVR-MDX-NET-Voc_FT":{n:7680,f:3072,primary:"vocals",gain:1.021},
 Kim_Vocal_2:{n:7680,f:3072,primary:"vocals",gain:1.009}
};
const STEP=1024,FRAMES=256,SIZE=STEP*(FRAMES-1);
export async function openMDX(name,backend,readBytes,log,mark){
 const cfg=CONFIG[name];if(!cfg)throw Error("Nieznany model");
 const gpu=backend==="gpu"||backend==="auto"&&!!navigator.gpu;
 mark("import ORT");log("ORT 1.22.0: "+(gpu?"WebGPU build":"WASM-only build"));
 const ort=await import(gpu?CDN+"ort.webgpu.bundle.min.mjs":CDN+"ort.wasm.min.mjs");
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=CDN;
 ort.env.logLevel="warning";
 mark("odczyt bajtów ONNX");
 const bytes=await readBytes();
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<1e6)throw Error("Niepoprawny rozmiar ONNX");
 log("ONNX: "+bytes.byteLength+" B; nagłówek "+Array.from(bytes.subarray(0,8)).map(x=>x.toString(16).padStart(2,"0")).join(" "));
 mark("ORT InferenceSession.create");log("Tworzenie sesji ONNX z Uint8Array…");
 const session=await ort.InferenceSession.create(bytes,{executionProviders:gpu?(backend==="auto"?["webgpu","wasm"]:["webgpu"]):["wasm"],graphOptimizationLevel:"basic"});
 log("Sesja ONNX gotowa. Wejścia: "+session.inputNames.join(", ")+"; wyjścia: "+session.outputNames.join(", "));
 return {session,ort,cfg};
}
export async function splitMDX(engine,channels,log,mark,progress){
 const {session,ort,cfg}=engine;
 if(channels.length!==2||channels[0].length!==channels[1].length)throw Error("Nieprawidłowe kanały");
 mark("inicjalizacja STFT");log("Inicjalizacja FFT…");
 // Reuse only the signal-processing implementation, not the old separator.
 const {PffftSTFT}=await import("web-audio-separation");
 if(typeof PffftSTFT!=="function")throw Error("Brak eksportu PffftSTFT w bibliotece FFT");
 const fft=new PffftSTFT(cfg.n,STEP,cfg.f);await fft.init();
 const len=channels[0].length,trim=cfg.n/2,stride=Math.floor(SIZE*.75);
 let peak=0;for(const ch of channels)for(let i=0;i<len;i++)peak=Math.max(peak,Math.abs(ch[i]));
 if(peak<1e-7)throw Error("Fragment jest cichy");
 const sum=[new Float32Array(len),new Float32Array(len)],weight=new Float32Array(len);
 const window=new Float32Array(SIZE);for(let i=0;i<SIZE;i++)window[i]=.5-.5*Math.cos(2*Math.PI*(i+.5)/SIZE);
 const starts=[];for(let i=-trim;i<len;i+=stride)starts.push(i);
 let calls=0;
 for(const start of starts){
   mark("FFT / ONNX chunk "+(calls+1)+"/"+starts.length);
   const block=new Float32Array(2*SIZE);
   const from=Math.max(0,start),to=Math.min(len,start+SIZE);
   for(let c=0;c<2;c++)for(let i=from;i<to;i++)block[c*SIZE+i-start]=channels[c][i]/peak;
   const spec=fft.forward(block,1,SIZE);
   if(spec.length!==4*cfg.f*FRAMES)throw Error("Nieprawidłowy tensor STFT: "+spec.length);
   const tensor=new ort.Tensor("float32",spec,[1,4,cfg.f,FRAMES]);
   let outputs;
   try{
    mark("ONNX run "+(calls+1));outputs=await session.run({[session.inputNames[0]]:tensor});
    const prediction=outputs[session.outputNames[0]],p=prediction?.data;
    if(!p||p.length!==spec.length)throw Error("Nieoczekiwany rozmiar wyjścia ONNX");
    let total=0,diff=0,energy=0;
    for(let i=0;i<p.length;i+=17){if(!Number.isFinite(p[i]))throw Error("ONNX zwrócił NaN");total+=spec[i]*spec[i];diff+=(p[i]-spec[i])**2;energy+=p[i]*p[i];}
    log("ONNX run "+(calls+1)+": "+prediction.dims.join("×")+", różnica widma "+(Math.sqrt(diff/(total+1e-20))).toFixed(5)+", energia "+(Math.sqrt(energy/(total+1e-20))).toFixed(5));
    mark("inverse STFT "+(calls+1));const wave=fft.inverse(p,1);
    if(wave.length!==2*SIZE)throw Error("Nieoczekiwany rozmiar ISTFT");
    for(let i=from;i<to;i++){const j=i-start,w=window[j];weight[i]+=w;for(let c=0;c<2;c++){const x=wave[c*SIZE+j];if(!Number.isFinite(x))throw Error("ISTFT zwrócił NaN");sum[c][i]+=x*w;}}
   }finally{tensor.dispose?.();if(outputs)for(const o of Object.values(outputs))o.dispose?.();}
   calls++;progress(calls/starts.length);await new Promise(r=>setTimeout(r,0));
 }
 const primary=sum,secondary=[new Float32Array(len),new Float32Array(len)];
 for(let c=0;c<2;c++)for(let i=0;i<len;i++){primary[c][i]=primary[c][i]/Math.max(1e-8,weight[i])*peak*cfg.gain;secondary[c][i]=channels[c][i]-primary[c][i];}
 log("Rzeczywiste wywołania session.run: "+calls);
 return cfg.primary==="vocals"?[primary,secondary]:[secondary,primary];
}
