import "server-only";
import {verifyInfraredBinding,getInfraredAcState,getInfraredRemotes} from "./infrared";
import {buildInfraredRequests,AC_MODES,AC_FANS} from "./infrared-plan";
import type {InfraredBinding} from "@/types/integration";

/** Metadata and request-plan verification only; NEVER transmits a command. */
export async function inspectInfraredPath(binding:InfraredBinding){
 const verified=await verifyInfraredBinding(binding,true);
 const remotes=await getInfraredRemotes(verified.hubId,false);
 const state=verified.categoryId===5?await getInfraredAcState(verified):{};
 const checks:Array<{action:string;ok:boolean;requests?:unknown;error?:string}>=[];
 const examine=(action:string,request:Record<string,unknown>,basis=state)=>{try{checks.push({action,ok:true,requests:buildInfraredRequests(verified,request,basis)});}catch(e){checks.push({action,ok:false,error:e instanceof Error?e.message:"Invalid plan"});}};
 if(verified.categoryId===5){
   examine("power on",{isOn:true});examine("power off",{isOn:false});
   for(const range of verified.keyRange||[]){
     const mode=Object.keys(AC_MODES).find(k=>AC_MODES[k]===range.mode);if(!mode)continue;
     examine(`mode ${mode}`,{mode});
     const row=range.temp_list?.find(t=>typeof t.temp==='number')||range.temp_list?.[0];
     if(typeof row?.temp==='number')examine(`${mode}: temperature ${row.temp}`,{targetTemp:row.temp},{...state,mode:mode as typeof state.mode});
     for(const f of row?.fan_list||[]){const fan=Object.keys(AC_FANS).find(k=>AC_FANS[k]===f.fan);if(fan)examine(`${mode}: fan ${fan}`,{fanSpeed:fan},{...state,mode:mode as typeof state.mode,...typeof row?.temp==='number'?{targetTemp:row.temp}:{}});}
   }
 }else for(const key of verified.keys)examine(key.key_name||key.key,{remoteKey:key.key});
 return {readOnly:true,physicalCommandsSent:0,pairingVerified:true,hubId:verified.hubId,remoteId:verified.remoteId,categoryId:verified.categoryId,remoteIndex:verified.remoteIndex,brand:verified.brandName,singleAir:verified.singleAir,duplicatePower:verified.duplicatePower,keyCount:verified.keys.length,modes:verified.keyRange?.map(r=>r.mode),swingExposed:verified.keys.some(k=>/swing/i.test(k.key+" "+k.key_name)),otherRemotesOnHub:remotes.filter(r=>r.remote_id!==verified.remoteId).map(r=>({name:r.remote_name,categoryId:r.category_id,remoteIndex:r.remote_index})),checks,
   limitation:"This verifies Tuya pairing metadata and the exact command plan. It does not prove the selected code library controls the physical appliance, nor that quota permits transmission."};
}
