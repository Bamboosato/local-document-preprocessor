export type JsonStyle='items'|'records'|'mermaid';
export interface JsonSettings {pointer:string;style:JsonStyle}
export const defaultJsonSettings:JsonSettings={pointer:'',style:'items'};
export const isJsonFile=(name:string)=>/\.json$/i.test(name);
export function pointerLabel(pointer:string){let text='',count=0;for(const cp of pointer){if(++count>300)return JSON.stringify(text)+'…（抜粋）';text+=cp;}return JSON.stringify(text);}
export interface JsonRow {pointer:string;name:string;type:string;container:boolean;preview:string}
export interface JsonPage {pointer:string;type:string;rows:JsonRow[];total:number;offset:number;valid:boolean;reason?:string}
export interface JsonView {expanded:string[];pages:Record<string,number>;start:number;detailPage:number;detailOpen:boolean;scrollTop?:number}
export const initialJsonView = ():JsonView => ({expanded:[''],pages:{},start:0,detailPage:0,detailOpen:false});
export interface JsonTreeRow {kind:'node'|'pager';pointer:string;name:string;type:string;depth:number;count:number;expanded:boolean;page:number;selectable:boolean}
export interface JsonSuitability {style:JsonStyle;valid:boolean;reason:string;count:string}
export interface JsonTargetPage {view:JsonView;rows:JsonTreeRow[];total:number;selectedIndex:number;pointer:string;type:string;childCount:number;children:JsonRow[];detail:string;truncated:boolean;styles:JsonSuitability[]}
export type JsonOperation='inspect'|'browse'|'target'|'convert';
export interface JsonRequest {id:string;operation:JsonOperation;fileId:string;fileName:string;buffer:ArrayBuffer;settings:JsonSettings;offset:number;view?:JsonView;reveal?:boolean}
