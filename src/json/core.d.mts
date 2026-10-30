export interface JsonNode {type:string;value?:unknown;offset:number;length:number;children?:JsonNode[]}
export interface JsonModel {source:string;root:JsonNode;count:number}
export interface GeneratedJson {markdown:string;rows?:string[][];code?:string;labels?:string[];graph?:{labels:string[];parents:number[]}}
export const limits:Readonly<{bytes:number;depth:number;nodes:number;rows:number;columns:number;markdown:number;diagramNodes:number;label:number;code:number}>;
export class GateError extends Error {code:string;offset?:number}
export function parseBytes(bytes:Uint8Array):JsonModel;
export function parseText(text:string):JsonModel;
export function children(node:JsonNode):{key:string;node:JsonNode}[];
export function resolve(model:JsonModel,pointer:string):JsonNode;
export function literal(value:unknown):string;
export function encodeSegment(value:string):string;
export function valueText(model:JsonModel,node:JsonNode):string;
export function generate(model:JsonModel,pointer?:string,style?:string,fileName?:string):GeneratedJson;
export class ParseCache {get(id:string,bytes:Uint8Array):JsonModel;reset():void;stats():{sets:number;epoch:number;parses:number}}
