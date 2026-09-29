import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { devices, activityLogs, scenes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { DeviceControlError, commandsMatch, isCloudDevice, stateFromSpecification, valuesOf } from "./device-capabilities";
import { applyChannelLabels, controlFailure, resolveControlRoute, hasReusableCapabilities } from "./device-preferences";
import { dispatchStandardControl } from "./control-execution";
import { getSmartLifeDeviceDetails, getSmartLifeSpecification, loadSmartLifeSession, sendSmartLifeCommands, triggerSmartLifeScene } from "./smartlife";
import { getTuyaDeviceFunctions, getTuyaDeviceStatus, isTuyaConfigured, sendTuyaCommands } from "./tuya";
import { getInfraredAcState, sendInfraredCommand } from "./infrared";
import { isIrQuotaPaused } from "./ir-quota";
import { sendHomeAssistantControl, getHomeAssistantEntity } from "./home-assistant";
import { mapHomeAssistantState } from "./home-assistant-mapping";
import type { DeviceState } from "@/types/smart-home";
import type { DeviceIntegration, TuyaSpecification } from "@/types/integration";

export type StoredDevice=typeof devices.$inferSelect;
type Command=NonNullable<DeviceIntegration["command"]>;
function localState(state:DeviceState,updates:Record<string,unknown>):DeviceState {
  const next={...state};
  for(const [key,value] of Object.entries(updates))if(!["channelCode","channelValue","motorCode"].includes(key))(next as Record<string,unknown>)[key]=value;
  if(updates.channelCode&&typeof updates.channelValue==="boolean"){
    next.channels=state.channels?.map(c=>c.code===updates.channelCode?{...c,isOn:updates.channelValue as boolean}:c);
    next.isOn=next.channels?.some(c=>c.isOn);
  }else if(typeof updates.isOn==="boolean")next.channels=state.channels?.map(c=>({...c,isOn:updates.isOn as boolean}));
  return next;
}

/** Merge with the latest preferences so an in-flight command cannot erase a rename. */
async function storeResult(id:string, command:Command, state?:DeviceState, patch:Partial<DeviceIntegration>={}) {
  return db.transaction(async tx=>{
    const [current]=await tx.select().from(devices).where(eq(devices.id,id)).for("update");
    if(!current)throw new DeviceControlError("Device removed during request.","NOT_FOUND",404);
    const integration:DeviceIntegration={...current.integration,source:current.integration?.source||(isCloudDevice(current)?"smartlife":"manual"),...patch,command};
    const [updated]=await tx.update(devices).set({state:applyChannelLabels(state||current.state,integration),integration,updatedAt:new Date()}).where(eq(devices.id,id)).returning();
    await tx.insert(activityLogs).values({deviceId:id,deviceName:current.name,action:command.message,type:command.status==="failed"?"system":"device",source:command.provider});
    return updated;
  });
}

/** Separate readback request: it never sends another command or IR signal. */
export async function refreshDevice(device:StoredDevice, expectedCommandId?:string) {
  if(!isCloudDevice(device))return device;
  if(device.integration?.source==="home-assistant"&&device.integration.homeAssistantEntityId){
    const entity=await getHomeAssistantEntity(device.integration.homeAssistantEntityId);
    const state=mapHomeAssistantState(entity);
    const [updated]=await db.update(devices).set({state,online:entity.state!=="unavailable",updatedAt:new Date()}).where(eq(devices.id,device.id)).returning();
    return updated;
  }
  if(!device.tuyaDeviceId)return device;
  if(expectedCommandId&&device.integration?.command?.id!==expectedCommandId)return device;
  const initialCommandId=device.integration?.command?.id;
  const consumer=await loadSmartLifeSession();
  let state:DeviceState;
  let spec:TuyaSpecification|undefined;
  let reported:Record<string,unknown>|undefined;
  let online=device.online;
  let category=device.integration?.category||"";
  if(device.integration?.infrared){
    if(device.integration.irControlMode==="scenes"||device.integration.infrared.categoryId!==5)return device;
    state={...device.state,...await getInfraredAcState(device.integration.infrared)};
  }else if(consumer){
    const [list,currentSpec]=await Promise.all([
      getSmartLifeDeviceDetails([device.tuyaDeviceId],consumer),
      hasReusableCapabilities(device.integration)?Promise.resolve({functions:device.integration?.functions,status:device.integration?.statusSchema}):getSmartLifeSpecification(device.tuyaDeviceId,consumer),
    ]);
    const remote=list.find(d=>d.id===device.tuyaDeviceId);
    if(!remote)throw new DeviceControlError("Tuya did not return this device.","DEVICE_UNAVAILABLE",409);
    spec=currentSpec;reported=valuesOf(remote.status);category=remote.category;online=remote.online??online;
    state=stateFromSpecification(spec,reported,category,device.category);
  }else{
    if(device.protocol==="Smart Life"||!isTuyaConfigured())throw new DeviceControlError("Reconnect Smart Life to refresh reported status.","SESSION_REQUIRED",409);
    const [functions,status]=await Promise.all([getTuyaDeviceFunctions(device.tuyaDeviceId),getTuyaDeviceStatus(device.tuyaDeviceId)]);
    spec={functions,status:functions};reported=valuesOf(status);state=stateFromSpecification(spec,reported,category,device.category);
  }
  return db.transaction(async tx=>{
    const [current]=await tx.select().from(devices).where(eq(devices.id,device.id)).for("update");
    // Ignore a stale status check from before a newer command.
    if(!current||current.integration?.command?.id!==initialCommandId)return current||device;
    const integration:DeviceIntegration={...current.integration,source:current.integration?.source||"smartlife",category};
    if(spec){integration.functions=spec.functions||[];integration.statusSchema=spec.status||[];if(!hasReusableCapabilities(device.integration))integration.functionsFetchedAt=new Date().toISOString();}
    if(reported)integration.reported=reported;
    const command=integration.command;
    if(command?.status==="accepted"&&reported&&command.commands?.length){
      const confirmed=commandsMatch(command.commands,reported);
      integration.command={...command,status:confirmed?"confirmed":"accepted",message:confirmed?"Tuya reported the requested state.":device.category==="curtain"?"Tuya accepted the motor request. Showing its reported position; movement is not confirmed.":"Command accepted; Tuya has not yet reported the requested state. Last reported state is shown."};
    }
    const [updated]=await tx.update(devices).set({state:applyChannelLabels(state,integration),integration,online,updatedAt:new Date()}).where(eq(devices.id,device.id)).returning();
    return updated;
  });
}

/** Acknowledge provider delivery promptly. Do not invent reported state. */
async function executeDeviceControl(id:string,updates:Record<string,unknown>) {
  const started=Date.now();const commandId=randomUUID();
  const [device]=await db.select().from(devices).where(eq(devices.id,id)).limit(1);
  if(!device)throw new DeviceControlError("Device not found.","NOT_FOUND",404);
  if(device.integration?.hidden)throw new DeviceControlError("This card is hidden. Restore it before sending commands.","CARD_HIDDEN",409);
  if(device.integration?.accountPresent===false)throw new DeviceControlError("This device is no longer in the latest Tuya account catalog. Sync or remove this card.","DEVICE_REMOVED",409);
  if(!updates||typeof updates!=="object"||Array.isArray(updates)||!Object.keys(updates).length)throw new DeviceControlError("A device action is required.","EMPTY_COMMAND",400);
  let provider="Local demo";
  const commandBase=()=>({id:commandId,at:new Date().toISOString(),provider,durationMs:Date.now()-started});
  try{
    if(!isCloudDevice(device)){
      const message="Local/demo tile updated. No physical device is linked.";
      const command:Command={...commandBase(),status:"accepted",message};
      return {success:true,confirmed:false,message,provider,verificationPending:false,commandId,data:await storeResult(id,command,localState(device.state,updates))};
    }
    const route=resolveControlRoute(device.integration,updates);
    if(route.kind!=="home-assistant"&&!device.tuyaDeviceId)throw new DeviceControlError("No Tuya ID is linked.","DEVICE_NOT_LINKED",409);
    if(route.kind==="home-assistant"){
      provider="Home Assistant";
      const sent=await sendHomeAssistantControl(route.entityId,updates);
      const message=`Home Assistant accepted ${sent.sent} service action${sent.sent===1?"":"s"}. Reported appliance state depends on that local integration.`;
      const command:Command={...commandBase(),status:"accepted",message,requested:updates};
      return {success:true,confirmed:false,message,provider,verificationPending:false,commandId,data:await storeResult(id,command)};
    }
    if(route.kind==="scene"){
      provider="Smart Life scene";
      const [scene]=await db.select().from(scenes).where(eq(scenes.id,route.sceneId));
      if(scene?.integration?.source!=="smartlife"||!scene.integration.homeId||!scene.integration.sceneId||scene.integration.enabled===false||(device.integration?.homeId&&scene.integration.homeId!==device.integration.homeId))throw new DeviceControlError("The assigned Tuya scene is unavailable. Reassign it in IR control method.","SCENE_UNAVAILABLE",409);
      await triggerSmartLifeScene(scene.integration.homeId,scene.integration.sceneId);
      const message=`Tuya accepted your assigned scene “${scene.name}”. No IR developer API was used. The appliance response is not confirmed.`;
      const command:Command={...commandBase(),status:"unconfirmed",message,requested:updates};
      return {success:true,confirmed:false,message,provider,verificationPending:false,commandId,data:await storeResult(id,command)};
    }
    if(route.kind==="infrared"){
      provider="Tuya IR";
      if(isIrQuotaPaused(device.integration?.command))throw new DeviceControlError("Direct IR is paused for this remote after Tuya rejected it with 60001001. Fix the IoT Core controllable-device entitlement, then use ‘Retry direct IR after quota change’ (the pause also lifts by itself after 10 minutes), or assign an exact Tap-to-Run scene. No new cloud request was sent.","IR_CONTROL_QUOTA",409);
      if(!device.online)throw new DeviceControlError("The linked IR hub is offline. No command sent.","DEVICE_OFFLINE",409);
      const emission = await sendInfraredCommand(device.integration!.infrared!,updates,{...device.state,...device.integration?.irLastAccepted?.state});
      const message="Tuya accepted the IR command. The appliance has no IR feedback; verify it responded.";
      const lastPlan=emission.plans[emission.plans.length-1];
      const command:Command={...commandBase(),status:"unconfirmed",message,requested:updates,
        ir:{path:lastPlan.path,body:lastPlan.body,hubId:emission.binding.hubId,remoteId:emission.binding.remoteId,remoteIndex:emission.binding.remoteIndex,profileVerifiedAt:emission.binding.checkedAt}};
      return {success:true,confirmed:false,message,provider,verificationPending:false,commandId,data:await storeResult(id,command,undefined,{infrared:emission.binding,irLastAccepted:{state:emission.requestedState as Record<string,unknown>,at:new Date().toISOString()}})};
    }
    const consumer=await loadSmartLifeSession();
    if(!consumer&&(device.protocol==="Smart Life"||!isTuyaConfigured()))throw new DeviceControlError("Reconnect Smart Life. No developer-API fallback was used.","SESSION_REQUIRED",409);
    provider=consumer?"Smart Life":"Tuya developer API";
    const dispatched=await dispatchStandardControl(device,updates,{
      loadSpec:()=>consumer?getSmartLifeSpecification(device.tuyaDeviceId!,consumer):getTuyaDeviceFunctions(device.tuyaDeviceId!).then(functions=>({functions,status:functions})),
      readState:async()=>{
        if(consumer){const list=await getSmartLifeDeviceDetails([device.tuyaDeviceId!],consumer);return list.find(d=>d.id===device.tuyaDeviceId);}
        return {category:device.integration?.category||"",online:device.online,status:await getTuyaDeviceStatus(device.tuyaDeviceId!)};
      },
      send:commands=>consumer?sendSmartLifeCommands(device.tuyaDeviceId!,commands,consumer):sendTuyaCommands(device.tuyaDeviceId!,commands),
    });
    const message="Tuya accepted the command. Checking reported status separately…";
    const command:Command={...commandBase(),status:"accepted",message,requested:updates,commands:dispatched.commands};
    const patch:Partial<DeviceIntegration>={source:consumer?"smartlife":"developer",category:dispatched.category,functions:dispatched.spec.functions||[],statusSchema:dispatched.spec.status||[]};
    if(!dispatched.capabilitiesCached)patch.functionsFetchedAt=new Date().toISOString();
    if(dispatched.preflightRead)patch.reported=dispatched.reported;
    const state=dispatched.preflightRead?stateFromSpecification(dispatched.spec,dispatched.reported,dispatched.category,device.category):undefined;
    return {success:true,confirmed:false,message,provider,verificationPending:true,commandId,data:await storeResult(id,command,state,patch)};
  }catch(error){
    const failure=controlFailure(error,provider);
    const trace=error&&typeof error==="object"&&"ir" in error?error.ir as Command["ir"]:undefined;
    const command:Command={...commandBase(),status:"failed",message:failure.message,code:failure.code,...trace?{ir:trace}:{}};
    return {success:false,confirmed:false,message:failure.message,error:failure.message,code:failure.code,httpStatus:failure.httpStatus,provider,verificationPending:false,commandId,data:await storeResult(id,command)};
  }
}

/** Serialize across serverless instances by physical resource, NOT a random delay.
 * All remotes sharing an IR hub use the same lock. Standard switches use their
 * own ID. No automatic re-send is performed when a timeout makes outcome uncertain.
 */
export async function controlDevice(id:string,updates:Record<string,unknown>){
  const [device]=await db.select().from(devices).where(eq(devices.id,id)).limit(1);
  if(!device)throw new DeviceControlError("Device not found.","NOT_FOUND",404);
  const key=device.integration?.infrared?`ir-hub:${device.integration.infrared.hubId}`:`device:${id}`;
  try {
    return await db.transaction(async tx=>{
      await tx.execute(sql`SET LOCAL lock_timeout = '12s'`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      return executeDeviceControl(id,updates);
    });
  }catch(error){
    const code=error&&typeof error==="object"&&"cause" in error?(error.cause as {code?:string})?.code:undefined;
    if(code==="55P03")throw new DeviceControlError("The device/blaster is processing another command. This request was not sent; try again.","DEVICE_BUSY",409);
    throw error;
  }
}
