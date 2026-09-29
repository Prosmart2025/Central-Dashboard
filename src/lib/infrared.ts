import "server-only";
import {buildInfraredRequests, type InfraredRequest} from "./infrared-plan";
import {tuyaCloudRequest} from "./tuya";
import {DeviceControlError} from "./device-capabilities";
import {normalizeIrProfile,pairedRemote,type RemoteDefinition} from "./ir-profile";
import type {InfraredBinding} from "@/types/integration";
import type {DeviceState} from "@/types/smart-home";

export type InfraredRemote=RemoteDefinition;
const registryCache=new Map<string,{until:number;list:InfraredRemote[]}>();
export async function getInfraredRemotes(hubId:string,fresh=true){
 const cache=registryCache.get(hubId);if(!fresh&&cache&&cache.until>Date.now())return cache.list;
 const result=await tuyaCloudRequest<InfraredRemote[]>("GET",`/v2.0/infrareds/${encodeURIComponent(hubId)}/remotes`);
 if(!Array.isArray(result))throw new DeviceControlError("Tuya did not return its paired remote registry.","IR_CATALOG_ERROR",502);
 registryCache.set(hubId,{list:result,until:Date.now()+30_000});return result;
}
export async function getInfraredBinding(hubId:string,remote:InfraredRemote):Promise<InfraredBinding>{
 const result=await tuyaCloudRequest<Record<string,unknown>>("GET",`/v2.0/infrareds/${encodeURIComponent(hubId)}/remotes/${encodeURIComponent(remote.remote_id)}/keys`);
 return normalizeIrProfile(hubId,remote,result);
}
export async function verifyInfraredBinding(binding:InfraredBinding,fresh=false){
 if(!binding.available)throw new DeviceControlError(binding.error||"IR remote unavailable.","IR_UNAVAILABLE");
 const remotes=await getInfraredRemotes(binding.hubId,fresh);const remote=pairedRemote(remotes,binding);
 const changed=remote.remote_index!==binding.remoteIndex||remote.category_id!==binding.categoryId;
 const age=Date.now()-Date.parse(binding.checkedAt||"");
 if(fresh||changed||binding.definitionVersion!==2||!Number.isFinite(age)||age>30*60*1000)return getInfraredBinding(binding.hubId,remote);
 return binding;
}
export async function getInfraredAcState(binding:InfraredBinding):Promise<DeviceState>{
 const data=await tuyaCloudRequest<Record<string,unknown>>("GET",`/v2.0/infrareds/${encodeURIComponent(binding.hubId)}/remotes/${encodeURIComponent(binding.remoteId)}/ac/status`);
 const modes=["cool","heat","auto","fan","dry"] as const,speeds=["auto","low","mid","high"] as const;
 const state:DeviceState={};
 if(data.power===1||data.power==="1"||data.power===0||data.power==="0")state.isOn=String(data.power)==="1";
 if(data.temp!==undefined&&data.temp!==null&&data.temp!==""&&Number.isFinite(Number(data.temp)))state.targetTemp=Number(data.temp);
 if(data.mode!==undefined&&data.mode!==null)state.mode=modes[Number(data.mode)];
 if(data.wind!==undefined&&data.wind!==null)state.fanSpeed=speeds[Number(data.wind)];return state;
}
export interface IRDispatchResult{binding:InfraredBinding;plans:InfraredRequest[];requestedState:DeviceState;}
export async function sendInfraredCommand(binding:InfraredBinding,updates:Record<string,unknown>,state:DeviceState):Promise<IRDispatchResult>{
 const verified=await verifyInfraredBinding(binding);
 let basis=state;
 if(verified.categoryId===5){
   // Read the remote's latest complete IR state, not the last partial request.
   // This is remote state only and cannot confirm the actual room appliance.
   try{
     basis={...state,...await getInfraredAcState(verified)};
   }catch(error){
     // AC commands are absolute per field, so the last known state is enough to
     // plan them. Quota errors still surface: the send itself would fail too.
     if(String((error as {code?:unknown})?.code)==="60001001")throw error;
     basis=state;
   }
 }
 const plans=buildInfraredRequests(verified,updates,basis);
 let sent=0;
 for(const plan of plans){
   try{
     const result=await tuyaCloudRequest<boolean>("POST",plan.path,plan.body);
     if(result!==true)throw new DeviceControlError("Tuya did not accept the IR command.","IR_REJECTED",502);
     sent++;
   }catch(error){
     const trace={path:plan.path,body:plan.body,hubId:verified.hubId,remoteId:verified.remoteId,remoteIndex:verified.remoteIndex,profileVerifiedAt:verified.checkedAt};
     if(sent>0)throw Object.assign(new DeviceControlError(`${sent}/${plans.length} IR commands were accepted before the remaining request failed. No automatic retry was sent. Refresh the remote state before retrying.`,"IR_PARTIAL",502),{ir:trace});
     if(error instanceof Error)Object.assign(error,{ir:trace});
     throw error;
   }
 }
 return {binding:verified,plans,requestedState:{...basis,...updates} as DeviceState};
}
