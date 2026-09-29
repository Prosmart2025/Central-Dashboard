import {mergeCardPreferences} from "./card-preferences";
import "server-only";
import { db } from "@/db";
import { devices, rooms, scenes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DeviceControlError } from "./device-capabilities";
import { applyChannelLabels, mergeChannelOverrides, sceneActionKey } from "./device-preferences";
import type { DeviceIntegration } from "@/types/integration";

export async function updateDeviceMetadata(id:string, body:Record<string,unknown>) {
  const allowed = new Set(["name","icon","roomId","channelNames","irControlMode","sceneBindings","clearCommandError","hidden","cardSize"]);
  if(!Object.keys(body).length||Object.keys(body).some(k=>!allowed.has(k)))throw new DeviceControlError("Unsupported device setting.","INVALID_METADATA",400);
  return db.transaction(async tx=>{
    const [current]=await tx.select().from(devices).where(eq(devices.id,id)).for("update");
    if(!current)throw new DeviceControlError("Device not found.","NOT_FOUND",404);
    const integration:DeviceIntegration={...current.integration,source:current.integration?.source||"manual"};
    const update:Partial<typeof devices.$inferInsert>={};
    if(body.name!==undefined){if(typeof body.name!=="string"||!body.name.trim()||body.name.length>200)throw new DeviceControlError("Enter a valid device name.","INVALID_NAME",400);update.name=body.name.trim();}
    if(body.icon!==undefined){if(typeof body.icon!=="string"||!body.icon.trim()||body.icon.length>80)throw new DeviceControlError("Invalid icon.","INVALID_ICON",400);update.icon=body.icon;}
    if(body.roomId!==undefined){
      if(typeof body.roomId!=="string")throw new DeviceControlError("Choose an existing room.","INVALID_ROOM",400);
      const [room]=await tx.select().from(rooms).where(eq(rooms.id,body.roomId));
      if(!room||room.id==="all")throw new DeviceControlError("Choose an existing room.","INVALID_ROOM",400);
      update.roomId=room.id;integration.roomOverride=true;
    }
    if(body.channelNames!==undefined) integration.channelNames=mergeChannelOverrides(integration.channelNames,body.channelNames,integration.functions||[]);
    if(body.clearCommandError!==undefined){
      if(body.clearCommandError!==true||integration.command?.code!=="IR_CONTROL_QUOTA")throw new DeviceControlError("There is no quota error to clear.","NO_QUOTA_ERROR",400);
      integration.command=undefined;
    }
    if(body.irControlMode!==undefined){
      if(!integration.infrared||!["direct","scenes"].includes(String(body.irControlMode)))throw new DeviceControlError("Choose Direct IR or Tuya scenes for an IR device.","INVALID_IR_MODE",400);
      integration.irControlMode=body.irControlMode as "direct"|"scenes";
    }
    if(body.homeAssistantEntityId!==undefined){
      if(!integration.infrared)throw new DeviceControlError("Home Assistant mapping is available for IR cards.","INVALID_HA_MAPPING",400);
      if(body.homeAssistantEntityId===null||body.homeAssistantEntityId==="") integration.homeAssistantEntityId=undefined;
      else if(typeof body.homeAssistantEntityId!=="string"||!/^(climate|remote|switch|light|fan|cover)\.[a-z0-9_]+$/.test(body.homeAssistantEntityId))throw new DeviceControlError("Choose a valid Home Assistant entity.","INVALID_HA_ENTITY",400);
      else integration.homeAssistantEntityId=body.homeAssistantEntityId;
    }
    if(body.sceneBindings!==undefined){
      if(!integration.infrared||!Array.isArray(body.sceneBindings)||body.sceneBindings.length>100)throw new DeviceControlError("Invalid IR scene mappings.","INVALID_SCENE_BINDINGS",400);
      const savedScenes=await tx.select().from(scenes);
      const seen=new Set<string>();
      integration.sceneBindings=body.sceneBindings.map((entry:unknown)=>{
        if(!entry||typeof entry!=="object"||Array.isArray(entry))throw new DeviceControlError("Invalid scene mapping.","INVALID_SCENE_BINDING",400);
        const item=entry as {request?:unknown;sceneId?:unknown};
        if(!item.request||typeof item.request!=="object"||Array.isArray(item.request)||typeof item.sceneId!=="string")throw new DeviceControlError("Choose a Tuya scene and exact action.","INVALID_SCENE_BINDING",400);
        const request=item.request as Record<string,unknown>;const key=sceneActionKey(request);
        if(seen.has(key))throw new DeviceControlError("Assign only one scene to each action.","DUPLICATE_SCENE_ACTION",400);seen.add(key);
        const scene=savedScenes.find(s=>s.id===item.sceneId&&s.integration?.source==="smartlife"&&s.integration?.enabled!==false);
        if(!scene||!scene.integration?.sceneId||!scene.integration.homeId||(integration.homeId&&integration.homeId!==scene.integration.homeId))throw new DeviceControlError("Choose an enabled Tuya scene from this device's home.","INVALID_SCENE",400);
        if(request.remoteKey!==undefined&&!integration.infrared?.keys.some(k=>k.key===request.remoteKey))throw new DeviceControlError("This remote key is not supported.","INVALID_SCENE_ACTION",400);
        return {request:JSON.parse(key) as Record<string,unknown>,sceneId:scene.id};
      });
    }
    update.integration=mergeCardPreferences(integration,body);update.state=applyChannelLabels(current.state,integration);
    const [row]=await tx.update(devices).set(update).where(eq(devices.id,id)).returning();
    return row;
  });
}
