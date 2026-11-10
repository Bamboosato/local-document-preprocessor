// A type query keeps this classic entry from acquiring an emitted export {}.
type JsonRequest=import('./contracts').JsonRequest;
// A classic entry can dynamically load modules in development; production Vite
// inlines them into its IIFE. Attach the handler immediately so early messages wait.
const ready=import('./jsonWorkerRuntime').catch(()=>null);
const scope=self as unknown as {onmessage:((event:MessageEvent<JsonRequest>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=async event=>{
  const runtime=await ready;
  if(runtime){await runtime.handleJsonRequest(event);return;}
  const request=event.data;
  scope.postMessage({id:request.id,operation:request.operation,fileId:request.fileId,parseGeneration:request.parseGeneration,settings:request.settings,error:'initializationFailed'});
};
