import {useEffect,useRef,useState} from 'react';
import type {JsonSettings,JsonView,JsonTargetPage,JsonStyle} from '../json/contracts';
import {defaultJsonSettings,pointerLabel,initialJsonView} from '../json/contracts';
import type {JsonWorkerClient} from '../json/JsonWorkerClient';

// File identity is the lifetime boundary; views contain no source or output.
const savedViews=new WeakMap<File,JsonView>();
const styleNames:Record<JsonStyle,string>={items:'項目表',records:'一覧表',mermaid:'Mermaid構造図'};
const descriptions:Record<JsonStyle,string>={items:'対象と子孫のパス・型・値を表にします。',records:'object の配列を、キーを列にした表にします。',mermaid:'対象と子孫の親子関係を構造図にします。'};
const rowHeight=48;

export function JsonSelectionDialog({file,client,settings,onCancel,onConfirm}:{file:File;client:JsonWorkerClient;settings?:JsonSettings;onCancel:()=>void;onConfirm:(settings:JsonSettings)=>void}){
  const dialog=useRef<HTMLDialogElement>(null),tree=useRef<HTMLDivElement>(null);
  const restored=useRef(false);
  const [draft,setDraft]=useState<JsonSettings>(()=>({...settings??defaultJsonSettings}));
  const [request,setRequest]=useState(()=>({view:structuredClone(savedViews.get(file)??initialJsonView()),reveal:false}));
  const [answer,setAnswer]=useState<{request:typeof request;draft:JsonSettings;page:JsonTargetPage}>();
  const [message,setMessage]=useState('対象とスタイルを確認中');
  const current=answer?.request===request&&answer.draft===draft ? answer.page : undefined;
  const visible=answer?.page;
  const valid=current?.styles.find(style=>style.style===draft.style)?.valid===true;

  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  useEffect(()=>{
    const controller=new AbortController();
    setMessage('対象とスタイルを確認中');
    void client.target(file,draft,request.view,request.reveal,controller.signal).then(page=>{
      if(controller.signal.aborted)return;
      savedViews.set(file,{...page.view,scrollTop:tree.current?.scrollTop??0});
      setAnswer({request,draft,page});
      setMessage('対象と出力スタイルの確認が完了しました。');
    }).catch(()=>{
      if(!controller.signal.aborted)setMessage('JSONを再読込できませんでした。設定を閉じて再度開くか、ファイルを選び直してください。');
    });
    return()=>controller.abort();
  },[client,file,draft,request]);

  useEffect(()=>{
    if(!current||!tree.current)return;
    if(request.reveal){
      tree.current.scrollTop=current.view.start*rowHeight;
      const radio=[...tree.current.querySelectorAll<HTMLInputElement>('input[type=radio]')].find(el=>el.value===draft.pointer);
      radio?.focus({preventScroll:true});
    }
    else if(!restored.current)tree.current.scrollTop=request.view.scrollTop??current.view.start*rowHeight;
    restored.current=true;
  },[current,request.reveal,draft.pointer]);

  const changeView=(patch:Partial<JsonView>,reveal=false)=>setRequest(previous=>({view:{...(current?.view??previous.view),...patch},reveal}));
  const changePage=(pointer:string,page:number)=>{
    changeView({pages:{...(current?.view.pages??request.view.pages),[pointer]:page},start:visible?.view.start??0});
  };
  const select=(pointer:string)=>{
    setDraft(previous=>({...previous,pointer}));
    changeView({detailPage:0});
  };
  return <dialog ref={dialog} className="json-settings" aria-labelledby="json-settings-title"
    onClick={event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onCancel();}}}
    onCancel={event=>{event.preventDefault();onCancel();}}>
    <h2 id="json-settings-title">JSONの変換設定</h2><p>{file.name}</p>
    <div className="json-selection-summary"><strong>変換対象: {draft.pointer===''?'ファイル全体（ルート）':pointerLabel(draft.pointer)}</strong>
      <button type="button" onClick={()=>changeView({},true)}>選択位置を表示</button>
    </div>
    <p role="status">{message}</p>
    <div className="json-selection-columns">
      <section aria-label="対象ツリー"><p>開閉・ページ移動は変換対象を変更しません。object・array（ルートはすべての型）から一つ選びます。</p>
        <div ref={tree} className="json-virtual-tree" aria-label="JSON階層の項目" role="group"
          onScroll={event=>{
            if(!visible)return;
            savedViews.set(file,{...visible.view,scrollTop:event.currentTarget.scrollTop});
            const first=Math.floor(event.currentTarget.scrollTop/rowHeight);
            if(first>=visible.view.start&&first+8<=visible.view.start+visible.rows.length)return;
            const start=Math.max(0,first-50);
            if(start!==request.view.start)changeView({start});
          }}>
          {visible&&<>
            <div aria-hidden="true" style={{height:visible.view.start*rowHeight}} />
            {visible.rows.map(row=><div className="json-tree-row" key={`${row.kind}:${row.pointer}`} style={{paddingLeft:Math.min(row.depth*16,64)}}>
              {row.kind==='pager'?<><span>{row.page*50+1}〜{Math.min((row.page+1)*50,row.count)} / {row.count}項目</span><button type="button" aria-label={`${row.name}の前の50項目`} disabled={row.page===0} onClick={()=>changePage(row.pointer,row.page-1)}>前</button><button type="button" aria-label={`${row.name}の次の50項目`} disabled={(row.page+1)*50>=row.count} onClick={()=>changePage(row.pointer,row.page+1)}>次</button></>:<>
                {['object','array'].includes(row.type)&&row.count>0?<button type="button" aria-label={`${row.name}を${row.expanded?'閉じる':'開く'}`} aria-expanded={row.expanded} onClick={()=>{
                  const expanded=new Set(current?.view.expanded??request.view.expanded);
                  if(row.expanded)expanded.delete(row.pointer);else expanded.add(row.pointer);
                  changeView({expanded:[...expanded],start:visible.view.start});
                }}>{row.expanded?'−':'＋'}</button>:<span className="json-toggle-space" />}
                {row.selectable?<label title={row.name}><input type="radio" name="json-target" value={row.pointer} checked={draft.pointer===row.pointer} onChange={()=>select(row.pointer)} /><span>{row.name}</span></label>:<span title={row.name}>{row.name}（参照のみ）</span>}
                <small>{row.type}</small>
              </>}
            </div>)}
            <div aria-hidden="true" style={{height:Math.max(0,visible.total-visible.view.start-visible.rows.length)*rowHeight}} />
          </>}
        </div>
      </section>
      <section className="json-target-detail" aria-label="選択対象の詳細">
        <h3>選択対象の詳細</h3>
        {current?<>
          <p>絶対 JSON Pointer（JSON文字列）</p><pre className="json-full-pointer">{JSON.stringify(current.pointer)}</pre>
          <p>対象名（JSON文字列）</p><pre className="json-full-name">{current.pointer===''?'"ファイル全体（ルート）"':JSON.stringify(current.pointer.slice(current.pointer.lastIndexOf('/')+1).replace(/~1/g,'/').replace(/~0/g,'~'))}</pre>
          <p>{current.pointer===''?'ファイル全体（ルート） / ':''}{current.type} / 直下 {current.childCount} 項目</p>
          <p>選択した要素自身と、そのすべての子孫が変換対象です。</p>
          <ul className="json-detail-children">{current.children.map(child=><li key={child.pointer}><span>{child.name}</span> / {child.type}</li>)}</ul>
          <p>{current.childCount===0?0:current.view.detailPage*10+1}〜{Math.min((current.view.detailPage+1)*10,current.childCount)} / {current.childCount}項目</p>
          <button type="button" disabled={current.view.detailPage===0} onClick={()=>changeView({detailPage:current.view.detailPage-1})}>詳細の前の10項目</button>
          <button type="button" disabled={(current.view.detailPage+1)*10>=current.childCount} onClick={()=>changeView({detailPage:current.view.detailPage+1})}>詳細の次の10項目</button>
        </>:<p>詳細を確認中</p>}
        <button type="button" aria-expanded={request.view.detailOpen} onClick={()=>changeView({detailOpen:!request.view.detailOpen})}>JSON詳細{request.view.detailOpen?'を閉じる':'を開く'}</button>
        {current&&request.view.detailOpen&&<><pre className="json-detail-source">{current.detail}</pre>{current.truncated&&<p>先頭10,000文字の抜粋です。変換出力の省略ではありません。</p>}</>}
      </section>
    </div>
    <fieldset><legend>JSON出力スタイル</legend>{(['items','records','mermaid'] as JsonStyle[]).map(style=>{
      const suitability=current?.styles.find(item=>item.style===style);
      return <div key={style} className="json-style-choice"><label><input type="radio" name="json-style" value={style} checked={draft.style===style} disabled={draft.style!==style&&!suitability?.valid} onChange={()=>setDraft({...draft,style})}/>{styleNames[style]}</label><p>{descriptions[style]} {suitability?`${suitability.count} — ${suitability.reason}`:'適合性を確認中'}</p></div>;
    })}</fieldset>
    <div className="dialog-actions"><button type="button" onClick={onCancel}>キャンセル</button><button type="button" disabled={!valid} onClick={()=>{if(valid)onConfirm({...draft});}}>この設定に決定</button></div>
  </dialog>;
}
