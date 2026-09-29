import {DeviceControlError} from "./device-capabilities";
import type {InfraredBinding,InfraredKey} from "@/types/integration";
const number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:typeof v==="string"&&v.trim()&&Number.isFinite(Number(v))?Number(v):undefined;
const boolean=(v:unknown)=>v===true||v==="true"||v===1?true:v===false||v==="false"||v===0?false:undefined;

export interface RemoteDefinition {remote_id:string;remote_name:string;category_id:number;remote_index?:number;brand_name?:string;brand_id?:number}
export function normalizeIrProfile(hubId:string,remote:RemoteDefinition,payload:Record<string,unknown>):InfraredBinding {
 const category=number(payload.category_id)??number(remote.category_id);
 if(!hubId||!remote.remote_id||category===undefined)throw new DeviceControlError("Incomplete Tuya IR pairing metadata.","IR_PROFILE_INVALID");
 const keyIndex=number(payload.remote_index),pairedIndex=number(remote.remote_index);
 if(keyIndex!==undefined&&pairedIndex!==undefined&&keyIndex!==pairedIndex)throw new DeviceControlError("Tuya's paired remote and key-library indexes do not match. Refresh the paired profile in Tuya before sending; no signal sent.","IR_PROFILE_MISMATCH",409);
 if(number(remote.category_id)!==undefined&&number(payload.category_id)!==undefined&&number(remote.category_id)!==number(payload.category_id))throw new DeviceControlError("Tuya returned a mismatched IR category. No command sent.","IR_PROFILE_MISMATCH",409);
 const keys:InfraredKey[]=Array.isArray(payload.key_list)?payload.key_list.flatMap((k:Record<string,unknown>)=>typeof k.key!=="string"||!k.key?[]:[{key:k.key,key_id:number(k.key_id),key_name:typeof k.key_name==="string"?k.key_name:undefined,standard_key:boolean(k.standard_key)}]):[];
 const keyRange:InfraredBinding["keyRange"]=Array.isArray(payload.key_range)?payload.key_range.flatMap((range:Record<string,unknown>)=>{
   const mode=number(range.mode);if(mode===undefined)return [];
   return [{mode,temp_list:Array.isArray(range.temp_list)?range.temp_list.map((t:Record<string,unknown>)=>({temp:number(t.temp)??null,fan_list:Array.isArray(t.fan_list)?t.fan_list.flatMap((f:Record<string,unknown>|number)=>{const n=number(typeof f==="object"?f.fan:f);return n===undefined?[]:[{fan:n}];}):[]})):[]}];
 }):[];
 return {hubId,remoteId:remote.remote_id,categoryId:category,remoteIndex:keyIndex??pairedIndex,brandName:remote.brand_name,brandId:number(payload.brand_id)??number(remote.brand_id),singleAir:boolean(payload.single_air),duplicatePower:boolean(payload.duplicate_power),keys,keyRange,available:true,definitionVersion:2,checkedAt:new Date().toISOString()};
}
export function pairedRemote(remotes:RemoteDefinition[],binding:InfraredBinding) {
 const remote=remotes.find(r=>r.remote_id===binding.remoteId);
 if(!remote)throw new DeviceControlError("This IR remote is not paired to the saved hub anymore. Sync the account; no command sent.","IR_REMOTE_NOT_PAIRED",409);
 return remote;
}
