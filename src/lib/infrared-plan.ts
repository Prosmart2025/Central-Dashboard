import { DeviceControlError } from "./device-capabilities";
import type { InfraredBinding } from "@/types/integration";
import type { DeviceState } from "@/types/smart-home";

// Tuya's documented AC protocol enums, not device/profile-specific overrides.
export const AC_MODES:Record<string,number>={cool:0,heat:1,auto:2,fan:3,dry:4};
export const AC_FANS:Record<string,number>={auto:0,low:1,mid:2,high:3};
export const AC_FALLBACK_MIN_TEMP=16,AC_FALLBACK_MAX_TEMP=30;
export interface InfraredRequest { path:string; body:Record<string,unknown> }
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);

/** A complete plan is validated BEFORE the first emission. No format guessing/retry. */
export function buildInfraredRequests(binding:InfraredBinding,updates:Record<string,unknown>,state:DeviceState):InfraredRequest[] {
 if(!binding.available)throw new DeviceControlError(binding.error||"IR definition unavailable. Refresh it before sending.","IR_UNAVAILABLE");
 if(!binding.hubId||!binding.remoteId)throw new DeviceControlError("Missing paired hub/remote ID.","IR_PROFILE_INVALID");
 const root=`/v2.0/infrareds/${encodeURIComponent(binding.hubId)}`;
 const remote=encodeURIComponent(binding.remoteId);
 if(updates.remoteKey!==undefined){
   if(Object.keys(updates).length!==1)throw new DeviceControlError("Send one remote key at a time.","IR_INVALID_ACTION",400);
   const key=binding.keys.find(k=>k.key===updates.remoteKey);
   if(!key)throw new DeviceControlError("This exact key is not provided by the paired remote.","IR_KEY_UNSUPPORTED");
   if(typeof key.standard_key!=="boolean")throw new DeviceControlError("Unknown key format. Refresh this IR definition.","IR_KEY_FORMAT_UNKNOWN");
   if(binding.categoryId===5){
     // Standard AC keys are fields, not TV-style commands. M/F/T need a value.
     if(key.key==="PowerOn"||key.key==="PowerOff")return [{path:`${root}/air-conditioners/${remote}/command`,body:{code:"power",value:key.key==="PowerOn"?1:0}}];
     if(["M","F","T"].includes(key.key))throw new DeviceControlError("Use the AC mode, fan or temperature controls so the required value is included.","IR_VALUE_REQUIRED");
     // The documented AC OpenAPI does not expose generic raw/swing commands.
     throw new DeviceControlError("Tuya does not expose this extra AC key through its documented IR control API. Use an explicitly assigned Tuya scene; nothing was sent.","IR_AC_KEY_UNSUPPORTED");
   }
   if(key.standard_key){
     // The standard endpoint's executable example uses camelCase; the raw-key
     // endpoint uses snake_case. Preserve exact key case (Power != power).
     const body:Record<string,unknown>={categoryId:binding.categoryId,key:key.key};
     if(binding.remoteIndex!==undefined)body.remoteIndex=binding.remoteIndex;
     return [{path:`${root}/remotes/${remote}/command`,body}];
   }
   if(!finite(key.key_id))throw new DeviceControlError("The raw IR key ID was not returned by Tuya.","IR_KEY_ID_MISSING");
   return [{path:`${root}/remotes/${remote}/raw/command`,body:{category_id:binding.categoryId,key_id:key.key_id,key:key.key}}];
 }
 if(binding.categoryId!==5)throw new DeviceControlError("Use a supported TV/Sound Bar remote key, not an AC command.","IR_KEY_REQUIRED");
 const keys=Object.keys(updates),allowed=new Set(["isOn","targetTemp","mode","fanSpeed"]);
 if(!keys.length||keys.some(k=>!allowed.has(k)))throw new DeviceControlError("Unsupported IR AC action.","IR_INVALID_ACTION",400);
 if(updates.isOn!==undefined&&typeof updates.isOn!=="boolean")throw new DeviceControlError("Power must be true or false.","IR_INVALID_ACTION",400);
 const mode=updates.mode!==undefined?AC_MODES[String(updates.mode)]:state.mode?AC_MODES[state.mode]:undefined;
 const wind=updates.fanSpeed!==undefined?AC_FANS[String(updates.fanSpeed)]:undefined;
 if(updates.mode!==undefined&&mode===undefined)throw new DeviceControlError("Unsupported AC mode.","IR_MODE_INVALID");
 if(updates.fanSpeed!==undefined&&wind===undefined)throw new DeviceControlError("Unsupported fan value.","IR_FAN_INVALID");
 const ranges=binding.keyRange||[];
 const range=mode===undefined?undefined:ranges.find(r=>r.mode===mode);
 if(updates.mode!==undefined&&ranges.length&&!range)throw new DeviceControlError("This AC profile does not support the selected mode.","IR_MODE_UNSUPPORTED");
 const rows=range?.temp_list||[];
 const hasTemp=rows.some(r=>finite(r.temp));
 const temp=updates.targetTemp!==undefined?updates.targetTemp:state.targetTemp;
 if(updates.targetTemp!==undefined){
   if(!finite(temp)||!Number.isInteger(temp))throw new DeviceControlError("The IR AC requires a whole-number temperature.","IR_TEMP_INVALID");
   if(range&&!hasTemp)throw new DeviceControlError("This AC mode has no adjustable temperature.","IR_TEMP_UNSUPPORTED");
   const allTemps=(range?rows:ranges.flatMap(r=>r.temp_list||[])).map(t=>t.temp).filter(finite);
   if(!ranges.length){
     // Tuya returned no key_range at all for this remote. Rather than lock the
     // temperature control, accept the standard AC span and let Tuya validate.
     if(temp<AC_FALLBACK_MIN_TEMP||temp>AC_FALLBACK_MAX_TEMP)throw new DeviceControlError(`Temperature must be ${AC_FALLBACK_MIN_TEMP}-${AC_FALLBACK_MAX_TEMP}C when the remote reports no supported range.`,"IR_TEMP_UNSUPPORTED");
   }else{
     if(allTemps.length&&!allTemps.includes(temp))throw new DeviceControlError("Temperature is not in the paired profile's supported range for this mode.","IR_TEMP_UNSUPPORTED");
     if(!allTemps.length)throw new DeviceControlError("Tuya has not provided a temperature range; refresh the remote definition.","IR_RANGE_MISSING");
   }
 }
 if(wind!==undefined&&range){
   const row=hasTemp?rows.find(t=>t.temp===temp):rows.find(t=>t.temp===null||!finite(t.temp));
   // Empty fan_list means unavailable in this mode, not 'all fan speeds'.
   const supported=row?.fan_list||[];
   if(!supported.some(f=>f.fan===wind))throw new DeviceControlError("This fan speed is not supported by the selected AC mode/temperature.","IR_FAN_UNSUPPORTED");
 }
 const path=`${root}/air-conditioners/${remote}/command`;
 // OFF supersedes all queued setting changes. Do not send an ON followed by OFF.
 if(updates.isOn===false)return [{path,body:{code:"power",value:0}}];
 const result:InfraredRequest[]=[];
 if(updates.isOn===true)result.push({path,body:{code:"power",value:1}});
 if(updates.mode!==undefined)result.push({path,body:{code:"mode",value:mode}});
 if(updates.targetTemp!==undefined)result.push({path,body:{code:"temp",value:temp}});
 if(updates.fanSpeed!==undefined)result.push({path,body:{code:"wind",value:wind}});
 return result;
}
/** Backwards-compatible single-action planning entry point. */
export function buildInfraredRequest(binding:InfraredBinding,updates:Record<string,unknown>,state:DeviceState):InfraredRequest {
 const plan=buildInfraredRequests(binding,updates,state);
 if(plan.length!==1)throw new DeviceControlError("This action requires ordered single-key commands. Use the sequence dispatcher.","IR_SEQUENCE_REQUIRED");
 return plan[0];
}
