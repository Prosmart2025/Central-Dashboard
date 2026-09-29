import {config} from "dotenv";
import {eq,inArray} from "drizzle-orm";
import assert from "node:assert/strict";
config({path:".env",quiet:true});
async function main(){
 const url=new URL(process.env.DATABASE_URL||"");if(!["127.0.0.1","localhost"].includes(url.hostname))throw new Error("Local test database only.");
 const {db,getPool}=await import("../src/db/index");const {devices,scenes}=await import("../src/db/schema");
 const suffix=Date.now().toString();const id=`fixture_names_${suffix}`,sceneId=`fixture_scene_${suffix}`;
 const functions=[{code:"switch_1",type:"Boolean"},{code:"switch_2",type:"Boolean"}];
 const call=async(body:unknown)=>{const r=await fetch(`http://localhost:3000/api/devices/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return {status:r.status,result:await r.json()};};
 try{
  await db.insert(devices).values({id,name:"Preferences test only",roomId:"living_room",category:"socket",icon:"Zap",protocol:"Smart Life",online:true,tuyaDeviceId:"FAKE_NO_PHYSICAL_DEVICE",state:{isOn:false,channels:[{code:"switch_1",label:"Gang 1",isOn:false},{code:"switch_2",label:"Gang 2",isOn:false}]},integration:{source:"smartlife",homeId:"fakehome",functions,tuyaChannelNames:{switch_1:"Tuya ceiling",switch_2:"Tuya desk"},infrared:{hubId:"fake",remoteId:"fake",categoryId:5,available:false,keys:[]}}});
  let r=await call({channelNames:{switch_2:"My reading lamp"}});assert.equal(r.status,200);assert.equal(r.result.data.state.channels[1].label,"My reading lamp");assert.equal(r.result.data.state.isOn,false);
  const row=(await db.select().from(devices).where(eq(devices.id,id)))[0];assert.equal(row.integration?.channelNames?.switch_2,"My reading lamp");
  r=await call({channelNames:{switch_9:"No such gang"}});assert.equal(r.status,400);
  r=await call({channelNames:{switch_2:""}});assert.equal(r.status,200);assert.equal(r.result.data.state.channels[1].label,"Tuya desk");
  console.log("PASS: gang name persists, invalid codes rejected, clearing override restores imported Tuya name without toggling power.");
  await db.insert(scenes).values({id:sceneId,name:"Test scene (never executed)",icon:"Sparkles",gradient:"from-cyan-500 to-blue-600",actions:[],integration:{source:"smartlife",homeId:"fakehome",sceneId:"FAKE_NO_REAL_SCENE",enabled:true}});
  r=await call({irControlMode:"scenes",sceneBindings:[{request:{isOn:true},sceneId}]});assert.equal(r.status,200);assert.equal(r.result.data.integration.irControlMode,"scenes");
  r=await call({sceneBindings:[{request:{isOn:false},sceneId:"does-not-exist"}]});assert.equal(r.status,400);
  const after=(await db.select().from(devices).where(eq(devices.id,id)))[0];assert.equal(after.state.isOn,false);assert.equal(after.integration?.sceneBindings?.length,1);
  console.log("PASS: explicit scene routing saves without executing anything; unknown scenes rejected; previous mapping retained.");
 }finally{await db.delete(devices).where(eq(devices.id,id));await db.delete(scenes).where(inArray(scenes.id,[sceneId]));await getPool().end();}
}
main().catch(e=>{console.error("Preference regression failed:",e.message);process.exitCode=1});
