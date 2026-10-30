import {useSyncExternalStore} from 'react';
import {getPwaState,subscribePwa,retryPwa,type PwaPhase} from '../pwa/client';
export const usePwaState=()=>useSyncExternalStore(subscribePwa,getPwaState,getPwaState);
const text:Record<PwaPhase,string>={
  online:'',preparing:'オフライン資産を準備しています。入力・結果は保存しません。',ready:'この世代のオフライン資産は準備済みです。',
  uncontrolled:'オフライン資産は次回起動用に準備済みです。このタブで有効にするには、入力・結果を保存して再読み込みしてください。',
  waiting:'更新の準備ができました。結果を保存して、このアプリのすべてのタブ・PWAを閉じてから再度開いてください。自動では再読み込みしません。',
  error:'更新またはオフライン準備を完了できませんでした。利用可能な旧世代と入力・結果は維持します。接続と保存設定を確認して再試行してください。旧版で制御されている場合は、結果を保存して全タブ・PWAを閉じ、再度開いてください。',
  degraded:'オフライン資産の一部を利用できません。接続と保存設定を確認して再取得してください。入力・結果はそのまま利用できます。',
  mismatch:'読み込んだページとオフライン資産が一致しないため、新しい変換を停止しました。結果を保存してすべてのタブ・PWAを閉じ、再度開いてください。',
};
export function PwaStatus({busy}:{busy:boolean}){
  const state=usePwaState();if(state.phase==='online')return null;
  return <aside className="pwa-status" aria-label="オフラインと更新の状態"><p role="status">{text[state.phase]}</p>
    {['error','degraded'].includes(state.phase)&&<button type="button" disabled={busy} onClick={()=>void retryPwa()}>オフライン資産を再取得</button>}
    {state.phase==='uncontrolled'&&<button type="button" disabled={busy} onClick={()=>window.location.reload()}>入力・結果を保存して再読み込み</button>}
  </aside>;
}
