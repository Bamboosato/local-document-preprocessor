export function loadTiny():Promise<{
  parse(code:string):Promise<unknown>;
  render(id:string,code:string,host:Element):Promise<{svg:string}>;
}>;
