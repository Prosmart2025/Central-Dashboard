import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes,activityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { triggerSmartLifeScene } from "@/lib/smartlife";
import { controlDevice } from "@/lib/device-control";
import { sendHomeAssistantControl } from "@/lib/home-assistant";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function POST(_req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    const [scene]=await db.select().from(scenes).where(eq(scenes.id,id));
    if(!scene)return NextResponse.json({success:false,error:"Scene not found"},{status:404});
    if(scene.integration?.source==="home-assistant"){
      if(!scene.integration.homeAssistantEntityId)return NextResponse.json({success:false,error:"Home Assistant scene mapping unavailable."},{status:422});
      const entity=scene.integration.homeAssistantEntityId;
      const domain=entity.split(".")[0];
      if(!["scene","script"].includes(domain))return NextResponse.json({success:false,error:"Unsupported Home Assistant scene entity."},{status:422});
      await sendHomeAssistantControl(entity,{isOn:true});
      await db.update(scenes).set({lastTriggered:new Date()}).where(eq(scenes.id,id));
      return NextResponse.json({success:true,confirmed:false,message:`Home Assistant accepted “${scene.name}”.`,updatedDevices:[]});
    }
    if(scene.integration?.source==="smartlife"){ 
      if(!scene.integration.homeId||!scene.integration.sceneId||scene.integration.enabled===false)return NextResponse.json({success:false,error:"This Tuya scene is disabled or unavailable."},{status:422});
      await triggerSmartLifeScene(scene.integration.homeId,scene.integration.sceneId);
      await db.update(scenes).set({lastTriggered:new Date()}).where(eq(scenes.id,id));
      await db.insert(activityLogs).values({deviceName:scene.name,action:"Tuya accepted the Tap-to-Run scene request. Individual appliance execution is not confirmed.",type:"scene",source:"Smart Life"});
      return NextResponse.json({success:true,confirmed:false,message:`Tuya accepted “${scene.name}”.`,updatedDevices:[]});
    }
    const results=[];
    for(const action of scene.actions){results.push(await controlDevice(action.deviceId,action.stateChanges));}
    const success=results.length>0&&results.every(r=>r.success);
    if(success)await db.update(scenes).set({lastTriggered:new Date()}).where(eq(scenes.id,id));
    return NextResponse.json({success,message:success?"Scene commands accepted.":"One or more scene commands failed.",results,updatedDevices:results.map(r=>r.data).filter(Boolean)});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error&&!error.message.includes("Failed query")?error.message:"Scene request failed."},{status:502});}
}
