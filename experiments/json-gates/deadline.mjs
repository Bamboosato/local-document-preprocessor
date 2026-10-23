// A long one-shot timer can be delivered late. Keep a monotonic deadline,
// inspect it on short pulses, and check again when accepting async results.
export function startDeadline(milliseconds,onExpire){
  const started=performance.now(),at=started+milliseconds;
  let timer,active=true,expired=false;
  const check=()=>{
    if(!active)return expired;
    if(performance.now()>=at){active=false;expired=true;clearTimeout(timer);onExpire(performance.now()-started);return true;}
    return false;
  };
  const pulse=()=>{if(!active||check())return;timer=setTimeout(pulse,Math.min(50,Math.max(0,at-performance.now())));};
  pulse();
  return {check,cancel:()=>{active=false;clearTimeout(timer);},elapsed:()=>performance.now()-started};
}
