import {useEffect,useRef,useState} from 'react';
import type {JsonSettings,JsonPage,JsonStyle} from '../json/contracts';
import {defaultJsonSettings,pointerLabel} from '../json/contracts';
import type {JsonWorkerClient} from '../json/JsonWorkerClient';

export function JsonSelectionDialog({file,client,settings,onCancel,onConfirm}:{file:File;client:JsonWorkerClient;settings?:JsonSettings;onCancel:()=>void;onConfirm:(settings:JsonSettings)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [draft,setDraft]=useState<JsonSettings>(()=>({...settings??defaultJsonSettings}));
  const [location,setLocation]=useState(''),[offset,setOffset]=useState(0);
  const [rawPage,setPage]=useState<JsonPage>(),[pageKey,setPageKey]=useState(''),[proof,setProof]=useState(''),[message,setMessage]=useState('');
  const key=JSON.stringify([draft,location,offset]);
  const page=pageKey===key?rawPage:undefined;
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  useEffect(()=>{
    const controller=new AbortController();setPage(undefined);setMessage('対象とスタイルを確認中');
    void(async()=>{
      try{
        const viewed=await client.browse(file,{pointer:location,style:draft.style},offset,controller.signal);
        const selected=location===draft.pointer?viewed:await client.browse(file,draft,0,controller.signal);
        if(controller.signal.aborted)return;
        setPage(viewed);setPageKey(key);setProof(selected.valid?key:'');setMessage(selected.valid?'この設定で変換できます。':'対象と出力スタイルが不適合、または生成上限を超えています。選び直してください。');
      }catch{if(!controller.signal.aborted){setProof('');setMessage('JSONを再読込できませんでした。設定を閉じて再度開くか、ファイルを選び直してください。');}}
    })();return()=>controller.abort();
  },[client,file,draft,location,offset,key]);
  const navigate=(pointer:string)=>{setLocation(pointer);setOffset(0);};
  return <dialog ref={dialog} className="json-settings" aria-labelledby="json-settings-title" onCancel={event=>{event.preventDefault();onCancel();}}>
    <h2 id="json-settings-title">JSONの変換設定</h2><p>{file.name}</p>
    <p>変換対象: {draft.pointer===''?'ファイル全体（ルート）':pointerLabel(draft.pointer)}</p>
    <label>出力スタイル <select aria-label="JSON出力スタイル" value={draft.style} onChange={e=>setDraft({...draft,style:e.target.value as JsonStyle})}>
      <option value="items">項目表</option><option value="records">一覧表</option><option value="mermaid">Mermaid構造図</option>
    </select></label>
    <p>閲覧位置: {location===''?'ルート':pointerLabel(location)}</p>
    <div><button type="button" onClick={()=>navigate('')}>ルートを開く</button><button type="button" disabled={location===''} onClick={()=>navigate(location.slice(0,location.lastIndexOf('/')))}>親を開く</button><button type="button" onClick={()=>setDraft({...draft,pointer:location})}>この階層を対象にする</button></div>
    <p role="status">{message}</p>
    <p>名前・値は抜粋表示です。object・arrayは「対象にする」で一つ選択できます。</p>
    <ul className="json-node-page" aria-label="JSON階層の項目">{page?.rows.map(row=><li key={row.pointer}><span>{row.name} / {row.type} / {row.preview}</span>{row.container&&<><button type="button" aria-label={`${row.name}を開く`} onClick={()=>navigate(row.pointer)}>開く</button><button type="button" aria-label={`${row.name}を対象にする`} onClick={()=>setDraft({...draft,pointer:row.pointer})}>対象にする</button></>}</li>)}</ul>
    {page&&<p>{page.total===0?0:offset+1}〜{Math.min(offset+page.rows.length,page.total)} / {page.total}項目 <button type="button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-300))}>前の項目</button><button type="button" disabled={offset+300>=page.total} onClick={()=>setOffset(offset+300)}>次の項目</button></p>}
    <div><button type="button" onClick={onCancel}>キャンセル</button><button type="button" disabled={proof!==key} onClick={()=>{if(proof===key)onConfirm({...draft});}}>この設定に決定</button></div>
  </dialog>;
}
