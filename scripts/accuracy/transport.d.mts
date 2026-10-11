export function saveJson(path:string,value:unknown):void;
export function guardedFetch(options?:{dir?:string;live?:boolean;phase?:string;secrets?:string[];fetchImpl?:typeof fetch;cap?:number}):typeof fetch;
