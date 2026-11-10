import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

describe('fixed Tiny page loader',()=>{
  beforeEach(()=>{vi.resetModules();vi.useFakeTimers();});
  afterEach(()=>{vi.useRealTimers();document.head.querySelectorAll('script').forEach(script=>script.remove());Reflect.deleteProperty(globalThis,'mermaid');});
  const api=()=>({initialize:vi.fn(),parse:vi.fn(),render:vi.fn()});
  it('shares a single load and initializes strict options only after the classic script completes',async()=>{
    const {loadTiny}=await import('./tinyLoader.mjs');
    const first=loadTiny(),second=loadTiny();expect(first).toBe(second);
    const scripts=document.head.querySelectorAll('script');expect(scripts).toHaveLength(1);expect(scripts[0].type).toBe('');
    const mermaid=api();Reflect.set(globalThis,'mermaid',mermaid);scripts[0].dispatchEvent(new Event('load'));
    expect(await first).toBe(mermaid);expect(mermaid.initialize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({securityLevel:'strict',htmlLabels:false,startOnLoad:false}));
    expect(document.head.querySelector('script')).toBeNull();
  });
  it('rejects failed and invalid loads, removes the script, and permits explicit retry',async()=>{
    const {loadTiny}=await import('./tinyLoader.mjs');
    const failed=expect(loadTiny()).rejects.toThrow('tiny-load');document.head.querySelector('script')!.dispatchEvent(new Event('error'));await failed;
    const invalid=expect(loadTiny()).rejects.toThrow('tiny-api');document.head.querySelector('script')!.dispatchEvent(new Event('load'));await invalid;
    const retried=loadTiny(),mermaid=api();Reflect.set(globalThis,'mermaid',mermaid);document.head.querySelector('script')!.dispatchEvent(new Event('load'));expect(await retried).toBe(mermaid);
  });
  it('expires an unresponsive load and releases its script without silently producing a library',async()=>{
    const {loadTiny}=await import('./tinyLoader.mjs');
    const failed=expect(loadTiny()).rejects.toThrow('tiny-load-timeout');
    await vi.advanceTimersByTimeAsync(14999);expect(document.head.querySelector('script')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);await failed;expect(document.head.querySelector('script')).toBeNull();
  });
});
