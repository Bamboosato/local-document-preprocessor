export type JsonStyle='items'|'records'|'mermaid';
export interface JsonSettings {pointer:string;style:JsonStyle}
export const defaultJsonSettings:JsonSettings={pointer:'',style:'items'};
export const isJsonFile=(name:string)=>/\.json$/i.test(name);
export function pointerLabel(pointer:string){let text='',count=0;for(const cp of pointer){if(++count>300)return JSON.stringify(text)+'…（抜粋）';text+=cp;}return JSON.stringify(text);}
export interface JsonRow {pointer:string;name:string;type:string;container:boolean;preview:string}
export interface JsonPage {pointer:string;type:string;rows:JsonRow[];total:number;offset:number;valid:boolean;reason?:string}
export type JsonOperation='inspect'|'browse'|'convert';
export interface JsonRequest {id:string;operation:JsonOperation;fileId:string;fileName:string;buffer:ArrayBuffer;settings:JsonSettings;offset:number}
