import "server-only";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TuyaFunction } from "@/types/integration";
import { DeviceControlError } from "./device-capabilities";
import { applyChannelLabels, parseTuyaChannelNames } from "./device-preferences";
import { tuyaCloudRequest } from "./tuya";

export async function fetchTuyaChannelNames(deviceId:string, functions:TuyaFunction[]) {
  const list=await tuyaCloudRequest<unknown>("GET",`/v1.0/devices/${encodeURIComponent(deviceId)}/multiple-names`);
  return parseTuyaChannelNames(list,functions);
}

/** Reads metadata only; never issues PUT/update-name or a physical command. */
export async function importChannelNames(id:string) {
  const [device]=await db.select().from(devices).where(eq(devices.id,id));
  if(!device?.tuyaDeviceId)throw new DeviceControlError("No Tuya device is linked.","DEVICE_NOT_LINKED",404);
  const names=await fetchTuyaChannelNames(device.tuyaDeviceId,device.integration?.functions||[]);
  const updated=await db.transaction(async tx=>{
    const [current]=await tx.select().from(devices).where(eq(devices.id,id)).for("update");
    if(!current)throw new DeviceControlError("Device no longer exists.","NOT_FOUND",404);
    const integration={...current.integration,source:current.integration?.source||"smartlife" as const,tuyaChannelNames:names,channelNamesSyncedAt:new Date().toISOString(),channelNamesError:undefined};
    const [row]=await tx.update(devices).set({integration,state:applyChannelLabels(current.state,integration)}).where(eq(devices.id,id)).returning();
    return row;
  });
  return {data:updated,imported:Object.keys(names).length,message:Object.keys(names).length?`Imported ${Object.keys(names).length} Tuya gang names. Local renames were preserved.`:"Tuya returned no gang names for this device. You can name them locally."};
}
