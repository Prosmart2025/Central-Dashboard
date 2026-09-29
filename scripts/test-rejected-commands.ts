import {config} from "dotenv";
import {eq,inArray} from "drizzle-orm";
import assert from "node:assert/strict";
config({path:".env",quiet:true});

async function main(){
 const url=new URL(process.env.DATABASE_URL||"");
 if(!["localhost","127.0.0.1"].includes(url.hostname))throw new Error("This test may only use the disposable local database.");
 const {db,getPool}=await import("../src/db/index");
 const {devices,activityLogs,wallSettings}=await import("../src/db/schema");
 const id=`fixture_no_physical_${Date.now()}`;
 const localId=id+"_local";
 const groupId=id+"_group";
 const [settings]=await db.select().from(wallSettings).limit(1);
 const previousFavorites=settings.favorites;
 try{
  await db.insert(devices).values([
   {id,name:"Fixture blocked IR",category:"climate",roomId:"living_room",icon:"AirVent",protocol:"Smart Life",online:true,tuyaDeviceId:"not-a-real-device",state:{isOn:false},integration:{source:"smartlife",infrared:{hubId:"not-a-real-hub",remoteId:"not-a-real-remote",categoryId:5,keys:[],available:false,error:"Fixture: IR control deliberately unavailable"}}},
   {id:localId,name:"Fixture local only",category:"socket",roomId:"living_room",icon:"Zap",protocol:"Local demo",online:true,state:{isOn:false},integration:{source:"manual"}},
  ]);
  const r=await fetch(`http://localhost:3000/api/devices/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({state:{isOn:true}})});const result=await r.json();
  assert.equal(r.status,422);assert.equal(result.success,false);assert.equal(result.data.state.isOn,false);
  const [stored]=await db.select().from(devices).where(eq(devices.id,id));assert.equal(stored.state.isOn,false);assert.equal(stored.integration?.command?.status,"failed");
  console.log("PASS: rejected IR request returned 422 and did not change persisted or displayed power state.");
  await db.update(wallSettings).set({favorites:[...(previousFavorites||[]),{id:groupId,label:"Fixture group",icon:"Zap",gradient:"from-cyan-500 to-blue-600",visible:true,deviceIds:[id,localId],action:"on"}]}).where(eq(wallSettings.id,settings.id));
  const gr=await fetch(`http://localhost:3000/api/favorites/${groupId}/trigger`,{method:"POST"});const group=await gr.json();
  assert.equal(group.success,false);assert.equal(group.applied,1);assert.equal(group.total,2);assert.equal(group.results.filter((r:{ok:boolean})=>!r.ok).length,1);
  const [after]=await db.select().from(devices).where(eq(devices.id,id));assert.equal(after.state.isOn,false);
  console.log("PASS: group results include failures; only the local fixture was applied; rejected physical fixture unchanged.");
 } finally{
  await db.update(wallSettings).set({favorites:previousFavorites}).where(eq(wallSettings.id,settings.id));
  await db.delete(devices).where(inArray(devices.id,[id,localId]));
  await db.delete(activityLogs).where(inArray(activityLogs.deviceId,[id,localId]));
  await getPool().end();
 }
}
main().catch((error)=>{console.error("Rejection regression failed:",error.message);process.exitCode=1;});
