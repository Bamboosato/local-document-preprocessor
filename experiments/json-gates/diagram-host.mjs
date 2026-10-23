export function createDiagramController(container) {
  let frame,validator,generation=0,timer,source,mode={},state={status:'idle',validated:false,outputAllowed:false};
  const trace=[];
  const record=(status,extra={})=>{state={...state,status,...extra};trace.push({status,at:performance.now(),generation});};
  function destroy(){clearTimeout(timer);frame?.remove();frame=undefined;validator?.terminate();validator=undefined;}
  function clear(){destroy();generation++;source=undefined;state={status:'idle',validated:false,outputAllowed:false};record('cleared');}
  function render(){
    destroy();const current=++generation,nonce=crypto.randomUUID();
    frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.title='JSONの構造';frame.src='/frame.html#'+nonce;
    const started=performance.now();record('initializing',{renderCount:(state.renderCount??0)+1});
    timer=setTimeout(()=>{if(current!==generation)return;destroy();record('initialization-timeout',{elapsed:performance.now()-started});},15000);
    const onmessage=event=>{
      if(current!==generation){window.removeEventListener('message',onmessage);return;}
      if(event.source!==frame?.contentWindow || event.data.nonce!==nonce)return;
      if(event.data.kind==='ready'){
        clearTimeout(timer);record('rendering');const start=performance.now();
        timer=setTimeout(()=>{if(current!==generation)return;destroy();record('render-timeout',{elapsed:performance.now()-start});window.removeEventListener('message',onmessage);},5000);
        frame.contentWindow.postMessage({nonce,code:source.code,blockMilliseconds:mode.blockMilliseconds??0},'*');
      }else{
        clearTimeout(timer);window.removeEventListener('message',onmessage);
        if(event.data.kind==='rendered')record('rendered',{details:event.data});
        else{destroy();record('display-failed',{details:{kind:event.data.kind}});}
      }
    };
    window.addEventListener('message',onmessage);container.replaceChildren(frame);
  }
  async function show(result,options={}){
    clear();mode=options;source=result;const current=++generation,nonce=crypto.randomUUID();record('validating');
    return new Promise(resolve=>{
      const fail=reason=>{if(current!==generation)return;destroy();record('validation-failed',{validated:false,outputAllowed:false,reason:typeof reason==='string'?reason:'initialization'});resolve(false);};
      const accepted=()=>{destroy();record('validated',{validated:true,outputAllowed:true});render();resolve(true);};
      timer=setTimeout(fail,15000);
      if(options.validationContext==='frame'){
        frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.title='構文検証の試作';frame.src='/frame.html#'+nonce;
        const validationFrame=frame;
        const listener=event=>{
          if(current!==generation){window.removeEventListener('message',listener);return;}
          if(event.source!==validationFrame.contentWindow||event.data.nonce!==nonce)return;
          if(event.data.kind==='ready')validationFrame.contentWindow.postMessage({nonce,code:source.code,operation:'validate'},'*');
          else {window.removeEventListener('message',listener);if(event.data.kind==='validated')accepted();else fail('dom-validation');}
        };
        window.addEventListener('message',listener);container.replaceChildren(frame);return;
      }
      validator=new Worker(new URL('./validation-worker.mjs',import.meta.url),{type:'module'});
      validator.onerror=event=>{event.preventDefault();fail();};
      validator.onmessage=event=>{
        if(current!==generation||event.data.nonce!==nonce)return;
        if(!event.data.valid){fail(event.data.reason);return;}
        accepted();
      };
      validator.postMessage({nonce,code:source.code});
    });
  }
  return {show,clear,retry:()=>{if(!state.validated)return false;render();return true;},state:()=>({...state,trace:trace.slice(-30)}),setMode:options=>{mode=options;}};
}
