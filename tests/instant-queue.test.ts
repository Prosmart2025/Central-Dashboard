import test from "node:test";
import assert from "node:assert/strict";
import {InstantControlQueue,type QueueResult} from "../src/lib/instant-control-queue";
const ok:QueueResult={ok:true,message:"Accepted"};
function deferred(){let resolve!:(value:QueueResult)=>void;const promise=new Promise<QueueResult>(r=>resolve=r);return {resolve,promise};}
const flush=()=>new Promise<void>(r=>setImmediate(r));

test("first AC change sends immediately; rapid changes serialize and latest wins",async()=>{
 const requests:Record<string,unknown>[]=[];const waits:ReturnType<typeof deferred>[]=[];let active=0,max=0;
 const q=new InstantControlQueue(async patch=>{requests.push(patch);active++;max=Math.max(max,active);const wait=deferred();waits.push(wait);const result=await wait.promise;active--;return result;});
 const first=q.push({targetTemp:21});assert.deepEqual(requests,[{targetTemp:21}]);
 const second=q.push({targetTemp:22}),third=q.push({targetTemp:23}),fan=q.push({fanSpeed:"high"});
 assert.equal(requests.length,1);waits[0].resolve(ok);await flush();
 assert.deepEqual(requests[1],{targetTemp:23,fanSpeed:"high"});assert.equal(max,1);
 waits[1].resolve(ok);await Promise.all([first,second,third,fan]);assert.equal(q.pending(),false);
});
test("in-flight duplicate targets coalesce, but a later deliberate retry is sent",async()=>{
 let calls=0;const first=deferred();const q=new InstantControlQueue(async()=>{calls++;return calls===1?first.promise:ok;});
 const a=q.push({targetTemp:22}),b=q.push({targetTemp:22});first.resolve(ok);await Promise.all([a,b]);assert.equal(calls,1);
 await q.push({targetTemp:22});assert.equal(calls,2);
});
test("power off supersedes pending on and temperature settings",async()=>{
 const sent:Record<string,unknown>[]=[];const first=deferred();const q=new InstantControlQueue(async p=>{sent.push(p);return sent.length===1?first.promise:ok;});
 const a=q.push({targetTemp:21}),b=q.push({targetTemp:24}),c=q.push({isOn:true}),d=q.push({isOn:false});
 first.resolve(ok);await Promise.all([a,b,c,d]);assert.deepEqual(sent,[{targetTemp:21},{isOn:false}]);
});
test("mode switch discards stale pending temperature/fan of previous mode",async()=>{
 const sent:Record<string,unknown>[]=[];const first=deferred();const q=new InstantControlQueue(async p=>{sent.push(p);return sent.length===1?first.promise:ok;});
 const a=q.push({isOn:true}),b=q.push({targetTemp:28}),c=q.push({fanSpeed:"high"}),d=q.push({mode:"dry"});first.resolve(ok);await Promise.all([a,b,c,d]);assert.deepEqual(sent,[{isOn:true},{mode:"dry"}]);
});
test("edge-triggered remote keys are not merged/deduplicated",async()=>{
 const sent:Record<string,unknown>[]=[];const first=deferred();const q=new InstantControlQueue(async p=>{sent.push(p);return sent.length===1?first.promise:ok;});
 const a=q.push({remoteKey:"Volume+"}),b=q.push({remoteKey:"Volume+"}),c=q.push({remoteKey:"Volume+"});first.resolve(ok);await Promise.all([a,b,c]);assert.equal(sent.length,3);
});
test("failed/uncertain delivery stops burst, never retries it automatically",async()=>{
 const first=deferred();let calls=0;const q=new InstantControlQueue(async()=>{calls++;return first.promise;});
 const a=q.push({targetTemp:21}),b=q.push({targetTemp:22});first.resolve({ok:false,message:"Quota"});const r=await Promise.all([a,b]);assert.equal(calls,1);assert.ok(r.every(x=>!x.ok));assert.equal(q.pending(),false);
});
test("closing card cancels unsent targets without aborting already delivered request",async()=>{
 const first=deferred();let calls=0;const q=new InstantControlQueue(async()=>{calls++;return first.promise;});const a=q.push({targetTemp:21}),b=q.push({targetTemp:24});q.close();first.resolve(ok);await Promise.all([a,b]);assert.equal(calls,1);assert.equal((await q.push({isOn:true})).ok,false);
});
