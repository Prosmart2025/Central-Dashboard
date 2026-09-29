import type { DeviceIntegration } from "@/types/integration";
import { DeviceControlError } from "./device-capabilities";

export type CardSize = "standard" | "wide" | "large";
export function isCardSize(value:unknown):value is CardSize {return value === "standard" || value === "wide" || value === "large";}
export function cardSpanClass(value?:string) {
  if(value==="wide")return "sm:col-span-2";
  if(value==="large")return "sm:col-span-2 sm:row-span-2";
  return "";
}
export function cardHeightClass(value?:string){return value==="large"?"sm:min-h-[360px] h-full":"";}
export function mergeCardPreferences(current:DeviceIntegration|undefined|null,input:Record<string,unknown>):DeviceIntegration {
  const result:DeviceIntegration={...current,source:current?.source||"manual"};
  if(input.cardSize!==undefined){if(!isCardSize(input.cardSize))throw new DeviceControlError("Choose Standard, Wide or Large card size.","INVALID_CARD_SIZE",400);result.cardSize=input.cardSize;}
  if(input.hidden!==undefined){if(typeof input.hidden!=="boolean")throw new DeviceControlError("Hidden must be true or false.","INVALID_CARD_VISIBILITY",400);result.hidden=input.hidden;result.hiddenAt=input.hidden?new Date().toISOString():undefined;}
  return result;
}
/** User preferences win over imported metadata, including concurrent syncs. */
export const PANEL_PREFERENCE_KEYS = ["hidden","hiddenAt","cardSize","channelNames","irControlMode","sceneBindings","homeAssistantEntityId","layoutOverride"] as const;
export function mergeImportedIntegration(current:DeviceIntegration|undefined|null,incoming:DeviceIntegration):DeviceIntegration {
  const next={...current,...incoming};
  for(const key of PANEL_PREFERENCE_KEYS)if(current&&Object.prototype.hasOwnProperty.call(current,key)) (next as Record<string,unknown>)[key]=current[key];
  return next;
}
export function isCardHidden(device:{integration?:DeviceIntegration|null}){return device.integration?.hidden===true;}
