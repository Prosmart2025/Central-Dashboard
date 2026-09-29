"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Flame,Snowflake,Droplets,Wind,RotateCcw,Power,Loader2,Radio} from "lucide-react";
import type {SmartDevice} from "@/types/smart-home";
import type {DeviceCommandResult} from "@/types/integration";
import {TemperatureDial} from "./TemperatureDial";
import {climateModes,climateTemperatures,climateFans,climateExtras,nearestTemperature} from "@/lib/climate-controls";
import {powerFunctions,specificationValues} from "@/lib/device-capabilities";
import {InstantControlQueue} from "@/lib/instant-control-queue";
import {isIrQuotaPaused} from "@/lib/ir-quota";

interface Props {device:SmartDevice;busy:boolean;unit?:"C"|"F";onSend:(updates:Record<string,unknown>)=>Promise<DeviceCommandResult>;onDraftChange:(updates:Record<string,unknown>)=>void}
const icons:Record<string,typeof Snowflake>={cool:Snowflake,cold:Snowflake,heat:Flame,hot:Flame,dry:Droplets,fan:Wind,wind:Wind,auto:RotateCcw};
interface Draft {target:number;mode:string;fan:string;power?:boolean;extras:Record<string,unknown>}
export function AcControlCard({device,busy,unit="C",onSend,onDraftChange}:Props){
 const accepted=device.integration?.irLastAccepted?.state||{};
 const initial:Draft={target:typeof accepted.targetTemp==="number"?accepted.targetTemp:device.state.targetTemp??22,mode:typeof accepted.mode==="string"?accepted.mode:device.state.mode||"cool",fan:typeof accepted.fanSpeed==="string"?accepted.fanSpeed:device.state.fanSpeed||"auto",power:typeof accepted.isOn==="boolean"?accepted.isOn:device.state.isOn,extras:{}};
 const [draft,setDraft]=useState<Draft>(initial);const desired=useRef(draft);
 const [sending,setSending]=useState(false);const [feedback,setFeedback]=useState("");const [failed,setFailed]=useState(false);
 const alive=useRef(true);const revision=useRef(0);const sender=useRef(onSend);sender.current=onSend;
 const queue=useRef<InstantControlQueue|null>(null);
 const ir=device.integration?.infrared;const modes=climateModes(device);
 const selectedMode=modes.includes(draft.mode)?draft.mode:modes[0]||draft.mode;
 const temperatures=climateTemperatures(device,selectedMode);const temperature=nearestTemperature(temperatures,draft.target);
 const fans=climateFans(device,selectedMode,temperature);const selectedFan=fans.includes(draft.fan)?draft.fan:fans[0]||draft.fan;
 const hasPower=Boolean(ir?.categoryId===5||powerFunctions(device.integration?.functions||[]).length);
 const quotaBlocked=Boolean(ir&&device.integration?.irControlMode!=="scenes"&&isIrQuotaPaused(device.integration?.command));
 const disabled=!device.online||Boolean(device.integration?.hidden)||quotaBlocked;
 const externalBusy=busy&&!sending;
 const extraFns=climateExtras(device);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;queue.current?.close();queue.current=null;};},[]);
 const submit=(changes:Record<string,unknown>,next:Partial<Draft>)=>{
   if(disabled||externalBusy)return;
   desired.current={...desired.current,...next};setDraft(desired.current);setFeedback("");setFailed(false);const version=++revision.current;
   if(!queue.current)queue.current=new InstantControlQueue((patch)=>sender.current(patch),pending=>{if(alive.current)setSending(pending);});
   void queue.current.push(changes).then(result=>{
     if(!alive.current||version!==revision.current)return;
     setFeedback(result.message);setFailed(!result.ok);
     // The dial remains the requested target but is explicitly marked failed,
     // never substituted for measured state or claimed to have been applied.
   });
 };
 const changeMode=(value:string)=>{
   if(value===selectedMode)return;
   const temps=climateTemperatures(device,value);const t=nearestTemperature(temps,desired.current.target);const fs=climateFans(device,value,t);const f=fs.includes(desired.current.fan)?desired.current.fan:fs[0]||desired.current.fan;
   const changes:Record<string,unknown>={mode:value};
   if(temps.length&&t!==desired.current.target)changes.targetTemp=t;
   if(fs.length&&f!==desired.current.fan)changes.fanSpeed=f;
   submit(changes,{mode:value,target:t,fan:f});
 };
 const preview=useMemo(()=>({...hasPower&&draft.power!==undefined?{isOn:draft.power}:{},...(modes.length?{mode:selectedMode}:{}),...(temperatures.length?{targetTemp:temperature}:{}),...(fans.length?{fanSpeed:selectedFan}:{})}),[hasPower,draft.power,modes.length,selectedMode,temperatures.length,temperature,fans.length,selectedFan]);
 useEffect(()=>onDraftChange(preview),[preview,onDraftChange]);
 const display=(n:number)=>unit==="F"?n*9/5+32:n;
 const last=typeof device.integration?.irLastAccepted?.state?.targetTemp==="number"?device.integration.irLastAccepted.state.targetTemp:device.state.targetTemp;
 const button="min-h-11 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-500 disabled:opacity-40";
 return <section data-testid="ac-control-card" className="relative overflow-hidden rounded-3xl border border-cyan-900/70 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 p-4">
   <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-cyan-600/10 blur-3xl"/>
   <div className="relative flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-cyan-200">{ir?<Radio className="h-4 w-4"/>:<Snowflake className="h-4 w-4"/>}{ir?"Paired Tuya infrared remote":"Climate control"}</h3><span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] text-slate-400">{device.integration?.irControlMode==="scenes"?"Assigned scenes":ir?"IR · no feedback":"Tuya status"}</span></div>
   {quotaBlocked&&<p role="alert" className="mt-3 rounded-xl border border-rose-700/50 bg-rose-950/30 p-3 text-xs leading-relaxed text-rose-200">Direct IR controls are paused for this remote because Tuya rejected it with 60001001. Direct requests are paused for 10 minutes, or until you clear the quota error below after changing the Tuya entitlement. You can also switch this remote to mapped Tap-to-Run scenes.</p>}
   <div className="relative py-2">{temperatures.length?<TemperatureDial value={temperature} values={temperatures} unit={unit} disabled={disabled||externalBusy} onChange={value=>{if(value!==desired.current.target)submit({targetTemp:value},{target:value});}} caption={failed?"Request failed · target not confirmed":sending?"Sending latest target…":"Changes send automatically"}/>:<p className="my-6 rounded-xl bg-slate-900 p-4 text-center text-xs text-slate-400">This mode has no adjustable temperature. Available mode and fan controls remain below.</p>}</div>
   <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[10px] text-slate-400"><span>{ir?"Last known / requested":"Reported target"}: {last===undefined?"Not available":`${display(last).toFixed(Number.isInteger(display(last))?0:1)}°${unit}`}</span>{!ir&&<span>Room: {device.state.currentTemp===undefined?"Not reported":`${display(device.state.currentTemp).toFixed(1)}°${unit}`}</span>}</div>
   {!!modes.length&&<fieldset className="mt-4" disabled={disabled||externalBusy}><legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Operating mode</legend><div className="flex flex-wrap gap-2">{modes.map(value=>{const Icon=icons[value]||RotateCcw;return <button type="button" key={value} aria-pressed={selectedMode===value} onClick={()=>changeMode(value)} className={`${button} flex flex-1 flex-col items-center justify-center gap-1 py-2 ${selectedMode===value?"!border-cyan-400/60 !bg-cyan-500/15 !text-cyan-100":""}`}><Icon className="h-4 w-4"/><span className="capitalize">{value}</span></button>;})}</div></fieldset>}
   {!!fans.length&&<fieldset className="mt-3" disabled={disabled||externalBusy}><legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Fan speed</legend><div className="flex flex-wrap gap-2">{fans.map(value=><button type="button" key={value} aria-pressed={selectedFan===value} onClick={()=>{if(value!==desired.current.fan)submit({fanSpeed:value},{fan:value});}} className={`${button} flex-1 capitalize ${selectedFan===value?"!border-cyan-400/60 !bg-cyan-500/10 !text-cyan-100":""}`}>{value}</button>)}</div></fieldset>}
   {hasPower&&<div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={disabled||externalBusy} aria-pressed={draft.power===true} onClick={()=>submit({isOn:true},{power:true})} className={`${button} flex items-center justify-center gap-2 ${draft.power===true?"!border-cyan-400/60":""}`}><Power className="h-4 w-4 text-cyan-300"/>{ir?"Send AC ON":"Power on"}</button><button type="button" disabled={disabled||externalBusy} aria-pressed={draft.power===false} onClick={()=>submit({isOn:false},{power:false})} className={`${button} flex items-center justify-center gap-2 ${draft.power===false?"!border-cyan-400/60":""}`}><Power className="h-4 w-4"/>{ir?"Send AC OFF":"Power off"}</button></div>}
   {extraFns.length>0&&<div className="mt-3 flex flex-wrap gap-2">{extraFns.map(fn=>{
     const value=draft.extras[fn.code]??device.integration?.reported?.[fn.code];const choices=specificationValues(fn).range;
     if(fn.type?.toLowerCase()==="boolean")return <button type="button" key={fn.code} disabled={disabled||externalBusy} aria-pressed={Boolean(value)} onClick={()=>submit({extraCode:fn.code,extraValue:!value},{extras:{...desired.current.extras,[fn.code]:!value}})} className={button}>{fn.name||fn.code.replaceAll("_"," ")}: {value?"On":"Off"}</button>;
     return choices?.length?<label key={fn.code} className="text-[11px] text-slate-400">{fn.name||fn.code}<select aria-label={fn.name||fn.code} disabled={disabled||externalBusy} value={String(value??"")} onChange={e=>submit({extraCode:fn.code,extraValue:e.target.value},{extras:{...desired.current.extras,[fn.code]:e.target.value}})} className="ml-2 min-h-11 rounded-xl bg-slate-800 p-2 text-white"><option value="" disabled>Select…</option>{choices.map(x=><option key={x}>{x}</option>)}</select></label>:null;
   })}</div>}
   {ir&&<p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">Targets update instantly and send automatically. IR has no appliance state feedback.{!(ir.keys||[]).some(k=>/swing/i.test(k.key+" "+k.key_name))?" Swing is not exposed by this Tuya IR profile.":" Additional IR keys depend on Tuya API support."}</p>}
   <p role="status" aria-live="polite" className={`mt-3 flex items-start justify-center gap-2 text-[11px] leading-relaxed ${failed?"text-rose-300":"text-slate-400"}`}>{sending&&<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin"/>}{sending?"Sending… latest changes are queued, not duplicated.":feedback||"No Apply button needed."}</p>
 </section>;
}
