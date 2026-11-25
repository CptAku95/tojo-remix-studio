// Direct MDX execution: model bytes go straight to ORT, no blob: fetch.
const CDN="https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.22.0/";
const CONFIG={
 UVR_MDXNET_KARA_2:{n:5120,f:2048,primary:"instrumental",gain:1.065},
 "UVR-MDX-NET-Voc_FT":{n:7680,f:3072,primary:"vocals",gain:1.021},
 Kim_Vocal_2:{n:7680,f:3072,primary:"vocals",gain:1.009}
};
const STEP=1024,FRAMES=256,SIZE=STEP*(FRAMES-1);
const CDN_LIST=["https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",CDN,"https://unpkg.com/onnxruntime-web@1.22.0/dist/"];
async function getWasm(filename,file,log){
 if(file&&file.name!==filename)throw Error("Wymagany plik runtime: "+filename);
 const check=bytes=>{
  if(bytes.length<1000000||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)throw Error("Nieprawidłowy nagłówek lub rozmiar WASM");
  return bytes;
 };
 if(file){log("WASM: odczyt lokalnego pliku "+file.name);return check(new Uint8Array(await file.arrayBuffer()));}
 let cache=null;try{cache=await caches.open("tojo-ort-1.22.0");}catch{}
 const key=CDN_LIST[0]+filename;
 if(cache)try{const hit=await cache.match(key);if(hit){const bytes=check(new Uint8Array(await hit.arrayBuffer()));log("WASM: cache hit");return bytes;}}catch{}
 for(const base of CDN_LIST){
  const url=base+filename;
  try{
   log("WASM fetch: "+url);
   const r=await fetch(url,{mode:"cors",credentials:"omit"});
   if(!r.ok)throw Error("HTTP "+r.status);
   const bytes=check(new Uint8Array(await r.arrayBuffer()));
   if(cache)try{await cache.put(key,new Response(bytes,{headers:{"content-type":"application/wasm"}}));}catch{}
   return bytes;
  }catch(e){log("WASM fetch nieudany: "+(e?.message||e));}
 }
 throw Error("Wskaż lokalny plik "+filename+" w sekcji Runtime WASM.");
}
export async function openMDX(name,backend,readBytes,log,mark,wasmFile){
 const cfg=CONFIG[name];if(!cfg)throw Error("Nieznany model");
 const gpu=backend==="gpu"||backend==="auto"&&!!navigator.gpu;
 mark("import ORT");log("ORT 1.22.0: "+(gpu?"WebGPU build":"WASM-only build"));
 const bundle=gpu?"ort.webgpu.bundle.min.mjs":"ort.wasm.bundle.min.mjs";
 let ort;try{ort=await import(CDN+bundle);}catch(e){log("Import CDN nieudany: "+e.message);ort=await import(CDN_LIST[0]+bundle);}
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
 const filename=gpu?"ort-wasm-simd-threaded.jsep.wasm":"ort-wasm-simd-threaded.wasm";
 mark("odczyt runtime WASM");
 const wasm=await getWasm(filename,wasmFile,log);
 log("WASM: "+wasm.byteLength+" B; magic 00 61 73 6d; przekazanie bezpośrednio jako wasmBinary");
 ort.env.wasm.wasmBinary=wasm;
 ort.env.wasm.wasmPaths={mjs:CDN+(gpu?"ort-wasm-simd-threaded.jsep.mjs":"ort-wasm-simd-threaded.mjs")};
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
 let calls=0,done=0,skipped=0;
 for(const start of starts){
   mark("FFT / ONNX chunk "+(done+1)+"/"+starts.length);
   const block=new Float32Array(2*SIZE);
   const from=Math.max(0,start),to=Math.min(len,start+SIZE);
   let nonzero=false;
   for(let c=0;c<2;c++)for(let i=from;i<to;i++){const x=channels[c][i];if(x!==0)nonzero=true;block[c*SIZE+i-start]=x/peak;}
   if(!nonzero){
    for(let i=from;i<to;i++)weight[i]+=window[i-start];
    skipped++;done++;log("Fragment "+done+": całkowita cisza, pominięto ONNX");progress(done/starts.length);await new Promise(r=>setTimeout(r,0));continue;
   }
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
    log("ONNX run "+(calls+1)+": "+prediction.dims.join("×")+(total<1e-12?", widmo wejściowe bliskie zeru; pominięto względne statystyki":", różnica widma "+Math.sqrt(diff/total).toFixed(5)+", energia "+Math.sqrt(energy/total).toFixed(5)));
    mark("inverse STFT "+(calls+1));const wave=fft.inverse(p,1);
    if(wave.length!==2*SIZE)throw Error("Nieoczekiwany rozmiar ISTFT");
    for(let i=from;i<to;i++){const j=i-start,w=window[j];weight[i]+=w;for(let c=0;c<2;c++){const x=wave[c*SIZE+j];if(!Number.isFinite(x))throw Error("ISTFT zwrócił NaN");sum[c][i]+=x*w;}}
   }finally{tensor.dispose?.();if(outputs)for(const o of Object.values(outputs))o.dispose?.();}
   calls++;done++;progress(done/starts.length);await new Promise(r=>setTimeout(r,0));
 }
 const primary=sum,secondary=[new Float32Array(len),new Float32Array(len)];
 for(let c=0;c<2;c++)for(let i=0;i<len;i++){primary[c][i]=primary[c][i]/Math.max(1e-8,weight[i])*peak*cfg.gain;secondary[c][i]=channels[c][i]-primary[c][i];}
 log("Rzeczywiste wywołania session.run: "+calls+"; pominięte puste fragmenty: "+skipped);
 return cfg.primary==="vocals"?[primary,secondary]:[secondary,primary];
}
