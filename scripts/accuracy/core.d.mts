type Box={x:number;y:number;w:number;h:number};
type Piece={id:string;attributes?:Record<string,unknown>;bbox?:Box};
type Review={complete:boolean;matches?:{expectedId:string;predictionId:string;attributes?:Record<string,boolean>}[];products?:{expectedId:string;productId:string;grade:number|null}[]};
type Entry={id:string;phase:string;reserved:number;actual?:number;status:string;externalRunId?:string};
export function boxIoU(a?:Box,b?:Box):number;
export function scoreCase(expected:Piece[],predictions:Piece[],rankings:Record<string,{id:string}[]>,review:Review):Record<string,number|null>;
export class SpendLedger{cap:number;pilotCap:number;entries:Entry[];constructor(options?:{cap?:number;pilotCap?:number;entries?:Entry[]});reserve(id:string,amount:number,phase:string):void;settle(id:string,amount:number):void;snapshot():{cap:number;pilotCap:number;entries:Entry[]};}
export function redact(value:unknown,secrets?:string[]):unknown;
export function cacheKey(url:string,body?:unknown):string;
