import type {SmartDevice} from "@/types/smart-home";
import {specificationValues} from "./device-capabilities";
import {AC_MODES,AC_FANS,AC_FALLBACK_MIN_TEMP,AC_FALLBACK_MAX_TEMP} from "./infrared-plan";
const noRanges=(device:SmartDevice)=>!(device.integration?.infrared?.keyRange?.length);

export function climateModes(device:SmartDevice):string[]{
 const ir=device.integration?.infrared;
 if(ir?.categoryId===5){
   if(noRanges(device))return Object.keys(AC_MODES);
   return [...new Set((ir.keyRange||[]).map(r=>Object.keys(AC_MODES).find(k=>AC_MODES[k]===r.mode)).filter((m):m is string=>!!m))];
 }
 return specificationValues(device.integration?.functions?.find(f=>["mode","work_mode","mode_type"].includes(f.code))).range||[];
}
export function climateTemperatures(device:SmartDevice,mode:string):number[]{
 const ir=device.integration?.infrared;
 if(ir?.categoryId===5&&noRanges(device))return mode==="fan"?[]:Array.from({length:AC_FALLBACK_MAX_TEMP-AC_FALLBACK_MIN_TEMP+1},(_,i)=>AC_FALLBACK_MIN_TEMP+i);
 if(ir?.categoryId===5)return [...new Set((ir.keyRange?.find(r=>r.mode===AC_MODES[mode])?.temp_list||[]).map(t=>t.temp).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)))].sort((a,b)=>a-b);
 const fn=device.integration?.functions?.find(f=>["temp_set","target_temperature","temp_set_f"].includes(f.code));if(!fn)return [];
 const {min,max,step=1,scale=0}=specificationValues(fn);
 if(min===undefined||max===undefined||!Number.isFinite(min)||!Number.isFinite(max)||max<min||step<=0)return [];
 const length=Math.floor((max-min)/step)+1;if(length>1000)return [];
 return Array.from({length},(_,i)=>{const n=(min+i*step)/10**scale;return Number((fn.code==="temp_set_f"?(n-32)*5/9:n).toFixed(3));});
}
export function climateFans(device:SmartDevice,mode:string,temperature:number):string[]{
 const ir=device.integration?.infrared;
 if(ir?.categoryId===5&&noRanges(device))return Object.keys(AC_FANS);
 if(ir?.categoryId===5){
   const rows=ir.keyRange?.find(r=>r.mode===AC_MODES[mode])?.temp_list||[];
   const row=rows.find(t=>t.temp===temperature)||rows.find(t=>t.temp===null);
   return [...new Set((row?.fan_list||[]).map(f=>Object.keys(AC_FANS).find(k=>AC_FANS[k]===f.fan)).filter((v):v is string=>!!v))];
 }
 return specificationValues(device.integration?.functions?.find(f=>["fan_speed_enum","fan_speed","windspeed"].includes(f.code))).range||[];
}
export function nearestTemperature(values:number[],value:number){return values.reduce((best,n)=>Math.abs(n-value)<Math.abs(best-value)?n:best,values[0]??value);}
export function climateExtras(device:SmartDevice){
 // Expose actual writable swing/oscillation DPs only; never invent an IR code.
 if(device.integration?.infrared)return [];
 return (device.integration?.functions||[]).filter(f=>/^(switch_vertical|switch_horizontal|swing|swing_mode|swing_horizontal|swing_vertical|oscillate)$/.test(f.code));
}
