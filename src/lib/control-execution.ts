import { buildDeviceCommands, DeviceControlError, valuesOf, type DataPoints, type TuyaCommand } from "./device-capabilities";
import { hasReusableCapabilities } from "./device-preferences";
import type { DeviceIntegration, TuyaSpecification } from "@/types/integration";

interface RemoteSnapshot { category:string; online?:boolean; status?:unknown }
export interface StandardControlDependencies {
  loadSpec:()=>Promise<TuyaSpecification>;
  readState:()=>Promise<RemoteSnapshot | undefined>;
  send:(commands:TuyaCommand[])=>Promise<boolean>;
}
/** Request-count testable path: cached switches need only ONE provider send. */
export async function dispatchStandardControl(
  device:{online:boolean;integration?:DeviceIntegration|null},
  updates:Record<string,unknown>,
  api:StandardControlDependencies,
) {
  const reusable=hasReusableCapabilities(device.integration);
  const cached=device.integration;
  const freshStateRequired=!reusable || !device.online || !cached?.reported || updates.curtainPosition!==undefined;
  const [spec, snapshot]=await Promise.all([
    reusable ? Promise.resolve({functions:cached?.functions,status:cached?.statusSchema}) : api.loadSpec(),
    freshStateRequired ? api.readState() : Promise.resolve(undefined),
  ]);
  if(freshStateRequired && (!snapshot || snapshot.online===false))throw new DeviceControlError("Tuya reports this device offline or unavailable. No command was sent.","DEVICE_OFFLINE",409);
  const reported:DataPoints=snapshot?valuesOf(snapshot.status):cached?.reported||{};
  const category=snapshot?.category||cached?.category||"";
  const commands=buildDeviceCommands(spec.functions||[],reported,category,updates);
  const accepted=await api.send(commands);
  if(!accepted)throw new DeviceControlError("Tuya rejected the command. Reported state has not been changed.","COMMAND_REJECTED",502);
  return {commands,spec,reported,category,capabilitiesCached:reusable,preflightRead:freshStateRequired,online:snapshot?.online??device.online};
}
