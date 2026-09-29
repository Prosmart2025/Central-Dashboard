export interface QueueResult {ok:boolean;message:string;}
export type ControlPatch = Record<string,unknown>;
interface Waiting {patch:ControlPatch; resolve:(result:QueueResult)=>void;}
const signature=(p:ControlPatch)=>JSON.stringify(Object.fromEntries(Object.entries(p).sort(([a],[b])=>a.localeCompare(b))));
const edgeKey=(patch:ControlPatch)=>patch.remoteKey!==undefined;

/** Leading-edge dispatch; no arbitrary debounce, sleep or auto-retry.
 * One request runs at a time. While it runs, latest target values replace stale
 * pending values. Relative/toggle remote keys remain discrete ordered actions.
 */
export class InstantControlQueue {
  private waiting:Waiting[]=[];
  private running=false;
  private closed=false;
  private inflight?:ControlPatch;
  private accepted:ControlPatch={};
  constructor(private send:(patch:ControlPatch)=>Promise<QueueResult>,private activity?:(pending:boolean)=>void){}
  push(patch:ControlPatch):Promise<QueueResult>{
    if(this.closed)return Promise.resolve({ok:false,message:"Controls closed before dispatch."});
    if(!Object.keys(patch).length)return Promise.resolve({ok:true,message:"No change."});
    // A later deliberate press is a new request (important for one-way IR).
    // Deduplication applies only to values queued within the same in-flight burst.
    if(!this.running)this.accepted={};
    return new Promise(resolve=>{
      // Power-off is safety-prioritised: pending temperature/mode/on requests
      // are no longer wanted, but a request already sent is never retried.
      if(patch.isOn===false){for(const w of this.waiting)w.resolve({ok:false,message:"Superseded by power off."});this.waiting=[];}
      if(patch.mode!==undefined){
        const kept:Waiting[]=[];
        for(const item of this.waiting){
          if(!edgeKey(item.patch)){delete item.patch.targetTemp;delete item.patch.fanSpeed;}
          if(Object.keys(item.patch).length)kept.push(item);else item.resolve({ok:false,message:"Superseded by the selected mode."});
        }
        this.waiting=kept;
      }
      this.waiting.push({patch:{...patch},resolve});
      this.activity?.(true);
      void this.drain();
    });
  }
  private async drain(){
    if(this.running||this.closed)return;
    this.running=true;
    try{
      while(this.waiting.length&&!this.closed){
        let batch:Waiting[];
        if(edgeKey(this.waiting[0].patch))batch=[this.waiting.shift()!];
        else{
          const edge=this.waiting.findIndex(w=>edgeKey(w.patch));
          batch=this.waiting.splice(0,edge<0?this.waiting.length:edge);
        }
        const patch=Object.assign({},...batch.map(b=>b.patch)) as ControlPatch;
        this.inflight=patch;
        let result:QueueResult;
        if(!edgeKey(patch)&&Object.entries(patch).every(([k,v])=>Object.prototype.hasOwnProperty.call(this.accepted,k)&&this.accepted[k]===v))result={ok:true,message:"Latest target already sent."};
        else{
          try{result=await this.send(patch);}catch{result={ok:false,message:"Request outcome unknown; no automatic retry was sent."};}
          if(result.ok&&!edgeKey(patch))this.accepted={...this.accepted,...patch};
        }
        for(const item of batch)item.resolve(result);
        this.inflight=undefined;
        if(!result.ok){
          // A rejected/uncertain request invalidates any assumed incremental
          // state. Stop this burst instead of hammering quota or powering back on.
          this.accepted={};for(const item of this.waiting)item.resolve({ok:false,message:"Not sent after the previous request failed. Change the control again to retry."});this.waiting=[];
          break;
        }
      }
    }finally{this.running=false;this.inflight=undefined;this.activity?.(false);}
  }
  pending(){return this.running||this.waiting.length>0;}
  close(){this.closed=true;for(const item of this.waiting)item.resolve({ok:false,message:"Control closed before the pending action was sent."});this.waiting=[];}
}
