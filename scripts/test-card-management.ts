import {config} from "dotenv";
import {eq,inArray} from "drizzle-orm";
import assert from "node:assert/strict";
config({path:".env",quiet:true});
async function main(){
 const u=new URL(process.env.DATABASE_URL||"");if(!["localhost","127.0.0.1"].includes(u.hostname))throw Error("Local fixture database only.");
 const {db,getPool}=await import("../src/db/index");const {devices}=await import("../src/db/schema");
 const {syncedIntegration}=await import("../src/lib/sync-preferences");
 const id=`fixture_hidden_${Date.now()}`;const physicalId=`fake-physical-${Date.now()}`;
 const base=`http://localhost:3000/api/devices/${id}`;
 try{
  await db.insert(devices).values({id,name:"Hidden-card test",category:"socket",roomId:"living_room",icon:"Zap",protocol:"Smart Life",online:true,tuyaDeviceId:physicalId,state:{isOn:false},integration:{source:"smartlife"}});
  let r=await fetch(base,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({cardSize:"large"})});assert.equal(r.status,200);
  r=await fetch(base,{method:"DELETE"});assert.equal(r.status,200);
  let [stored]=await db.select().from(devices).where(eq(devices.id,id));assert.ok(stored);assert.equal(stored.tuyaDeviceId,physicalId);assert.equal(stored.integration?.hidden,true);assert.equal(stored.integration?.cardSize,"large");assert.equal(stored.state.isOn,false);
  let list=await(await fetch('http://localhost:3000/api/devices')).json();assert.ok(!list.data.some((d:{id:string})=>d.id===id));
  await db.update(devices).set({name:"Imported replacement name",integration:syncedIntegration({source:"smartlife",hidden:false,cardSize:"standard"})}).where(eq(devices.id,id));
  [stored]=await db.select().from(devices).where(eq(devices.id,id));assert.equal(stored.integration?.hidden,true);assert.equal(stored.integration?.cardSize,"large");
  const hidden=await(await fetch('http://localhost:3000/api/devices/hidden')).json();assert.ok(hidden.data.some((d:{id:string})=>d.id===id));
  r=await fetch(base,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({hidden:false})});assert.equal(r.status,200);
  list=await(await fetch('http://localhost:3000/api/devices')).json();assert.ok(list.data.some((d:{id:string})=>d.id===id));
  console.log('PASS: removal hides only the dashboard record; physical ID/state unchanged; hide/size survive sync; restore works.');
  r=await fetch(base,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({cardSize:"arbitrary-css"})});assert.equal(r.status,400);
  console.log('PASS: invalid dimensions rejected; only safe responsive presets accepted.');
 }finally{await db.delete(devices).where(inArray(devices.id,[id]));await getPool().end();}
}
main().catch(e=>{console.error('Card regression failed:',e.message);process.exitCode=1});
