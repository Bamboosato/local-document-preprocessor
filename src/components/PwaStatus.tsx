import {useSyncExternalStore} from 'react';
import {getPwaState,subscribePwa,retryPwa,type PwaPhase} from '../pwa/client';
export const usePwaState=()=>useSyncExternalStore(subscribePwa,getPwaState,getPwaState);
const text:Record<Exclude<PwaPhase,'online'|'preparing'|'ready'>,string>={
  uncontrolled:'ネットなしで使うには、必要な入力や結果を保存してから、このページを開き直してください。',
  waiting:'更新の準備ができました。アプリのタブとウィンドウをすべて開き直してください。',
  error:'アプリの準備に失敗しました。ネット接続を確認して、もう一度お試しください。',
  degraded:'ネットなしでは一部の機能を使えません。ネットにつないで、もう一度お試しください。',
  mismatch:'変換を始められません。必要な結果を保存し、このアプリのタブとウィンドウをすべて閉じて開き直してください。',
};
export function PwaStatus({busy}:{busy:boolean}){
  const state=usePwaState();if(state.phase==='online'||state.phase==='preparing'||state.phase==='ready')return null;
  return <aside className="pwa-status" aria-label="オフラインと更新の状態"><p role="status">{text[state.phase]}</p>
    {['error','degraded'].includes(state.phase)&&<button type="button" disabled={busy} onClick={()=>void retryPwa()}>もう一度試す</button>}
    {state.phase==='uncontrolled'&&<button type="button" disabled={busy} onClick={()=>window.location.reload()}>このページを開き直す</button>}
  </aside>;
}
