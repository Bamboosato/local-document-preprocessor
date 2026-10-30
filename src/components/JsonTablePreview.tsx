import {useMemo,useState} from 'react';
import {MarkdownPreview} from './MarkdownPreview';
import {jsonTablePagePreview} from '../json/outputPreview';

export function JsonTablePreview({markdown,rows}:{markdown:string;rows:number}){
  const [index,setIndex]=useState(0),last=Math.max(0,Math.ceil(rows/100)-1),page=Math.min(index,last);
  const preview=useMemo(()=>jsonTablePagePreview(markdown,page),[markdown,page]);
  return <section aria-label="JSON表の表示">
    <p>{rows===0?0:page*100+1}〜{Math.min((page+1)*100,rows)} / {rows}行（表示のみページ分割。コピー・ダウンロードは全行です）</p>
    <button type="button" disabled={page===0} onClick={()=>setIndex(page-1)}>表の前の100行</button>
    <button type="button" disabled={page===last} onClick={()=>setIndex(page+1)}>表の次の100行</button>
    {preview.excerpt?<><p role="status">このページは50 KiBを超えるため、Markdownの先頭10,000文字を抜粋表示します。コピー・ダウンロードは全行です。</p><pre className="plain-preview">{preview.text}</pre></>:<MarkdownPreview markdown={preview.text}/>}
  </section>;
}
