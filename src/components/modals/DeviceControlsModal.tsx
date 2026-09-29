"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowDownToLine, ArrowUpToLine, CheckCircle2, Loader2, Pause, Play, Power, Radio, RefreshCw, X } from "lucide-react";
import type { SmartDevice, SmartScene } from "@/types/smart-home";
import type { DeviceCommandResult } from "@/types/integration";
import { powerFunctions, specificationValues } from "@/lib/device-capabilities";
import { DeviceIcon } from "../DeviceIcon";
import { GangNamesEditor } from "../GangNamesEditor";
import { AcControlCard } from "../AcControlCard";
import {CardOptions} from "../CardOptions";
import { IRControlMethod } from "../IRControlMethod";

interface Props {
  device: SmartDevice;
  roomName: string;
  scenes: SmartScene[];
  onClose:()=>void;
  onCardRemoved?:(id:string)=>void;
  tempUnit?:"C"|"F";
  onDeviceChange:(device:SmartDevice)=>void;
  onUpdate:(id:string,updates:Record<string,unknown>)=>Promise<DeviceCommandResult>;
  onRefresh:(id:string)=>Promise<void>;
  onOpenDevice:(id:string)=>void;
  onScene:(scene:SmartScene)=>Promise<boolean>;
}
export function DeviceControlsModal({device,roomName,scenes,onClose,onUpdate,onRefresh,onOpenDevice,onScene,onDeviceChange,onCardRemoved,tempUnit="C"}:Props) {
  const [busy,setBusy]=useState(false);
  const sendingRef=useRef(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState(false);
  const [positions,setPositions]=useState<Record<string,number>>({});
  const [acAction,setAcAction]=useState<Record<string,unknown>>({isOn:true});
  const [brightness,setBrightness]=useState(device.state.brightness??50);
  const [sceneId,setSceneId]=useState("");
  const integration=device.integration;
  const functions=integration?.functions||[];
  const powers=powerFunctions(functions);
  const channels=device.state.channels||[];
  const motors=device.state.motors||[];
  const ir=integration?.infrared;
  const related=scenes.filter(s=>integration?.sceneIds?.includes(s.id));
  const tuyaScenes=scenes.filter(s=>s.integration?.source==="smartlife" && s.integration.enabled!==false);
  useEffect(()=>{
    setMessage("");setError(false);setPositions({});
    setAcAction({isOn:true});
  // Device changes, not unrelated status polling, reset draft controls.
  },[device.id]);
  useEffect(()=>{
    // A separate readback may confirm the command after the send has returned.
    // Keep the open panel in step with the receipt instead of leaving “checking”.
    if(integration?.command?.id){
      setMessage(integration.command.message);
      setError(integration.command.status==="failed");
    }
  },[integration?.command?.id,integration?.command?.status,integration?.command?.message]);

  const send=async(updates:Record<string,unknown>):Promise<DeviceCommandResult>=>{
    if(sendingRef.current)return {ok:false,message:"A request is already pending."};
    sendingRef.current=true;
    setBusy(true);setMessage("");setError(false);
    try{const result=await onUpdate(device.id,updates);setMessage(result.message);setError(!result.ok);return result;}
    catch{const result={ok:false,message:"Request failed. Last reported state is unchanged."};setMessage(result.message);setError(true);return result;}
    finally{sendingRef.current=false;setBusy(false);}
  };
  const refresh=async()=>{setBusy(true);try{await onRefresh(device.id);setMessage("Reported status refreshed.");setError(false);}catch{setMessage("Could not refresh Tuya status.");setError(true);}finally{setBusy(false);}};
  const runScene=async(scene:SmartScene)=>{if(busy)return;setBusy(true);try{const ok=await onScene(scene);setError(!ok);setMessage(ok?"Tuya accepted the scene request; appliance execution is not confirmed.":"Tuya did not accept the scene.");}finally{setBusy(false);}};
  const actionClass="min-h-12 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xs font-semibold text-slate-200 hover:border-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed";
  const tempFunction=functions.find(f=>["temp_set","target_temperature","temp_set_f"].includes(f.code));
  const isAc=device.category==="climate" && Boolean(tempFunction || ir?.categoryId===5);
  const failure=message?error:integration?.command?.status==="failed";

  return <div role="dialog" aria-modal="true" aria-labelledby="device-controls-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md">
    <div className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-white shadow-2xl">
      <header className="relative flex items-start justify-between gap-3 border-b border-slate-800 p-5">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-300"><DeviceIcon name={device.icon} className="h-6 w-6"/></div><div><h2 id="device-controls-title" className="font-semibold">{device.name}</h2><p className="mt-1 text-xs text-slate-400">{roomName} · {device.online?"Online":"Offline"}</p></div></div>
        {onCardRemoved&&<CardOptions device={device} onChanged={onDeviceChange} onRemoved={onCardRemoved} disabled={busy}/>}
        <button type="button" aria-label="Close device controls" onClick={onClose} className={actionClass}><X className="h-4 w-4"/></button>
      </header>
      <div className="space-y-4 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/70 p-3 text-[11px] text-slate-400"><span>{ir?"Infrared · no appliance state feedback":"Showing Tuya-reported state, not assumed toggle state"}</span><button type="button" onClick={refresh} disabled={busy} aria-label="Refresh device status" className="p-2 text-cyan-300"><RefreshCw className={`h-4 w-4 ${busy?"animate-spin":""}`}/></button></div>
        {integration?.roomInheritedFromHub && <p className="text-[11px] text-slate-400">Room inherited from the paired IR hub; Tuya does not assign this remote a separate room.</p>}
        {!device.online&&<p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">Tuya reports this device or its hub offline. Check its power and network in the Tuya app.</p>}

        {isAc && <AcControlCard key={device.id} device={device} busy={busy} unit={tempUnit} onSend={send} onDraftChange={setAcAction}/> }
        {!ir && !isAc && powers.length>0&&<section className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{powers.length>1?"Individual switch gangs":"Power"}</h3><div className="grid grid-cols-2 gap-2">{powers.map((f,index)=>{
          const channel=channels.find(c=>c.code===f.code);const reported=integration?.reported?.[f.code];const known=typeof reported==="boolean";const on=known?reported:channel?.isOn;
          return <button type="button" role="switch" aria-checked={Boolean(on)} aria-label={channel?.label||`Gang ${index+1}`} key={f.code} onClick={()=>send({channelCode:f.code,channelValue:!on})} disabled={busy||!device.online} className={`${actionClass} flex items-center justify-between gap-3 ${on?"!border-amber-500/60 !bg-amber-500/15 !text-amber-200":""}`}><span className="text-left">{channel?.label||f.name||`Gang ${index+1}`}<small className="mt-1 block font-mono text-[9px] opacity-60">{f.code}</small></span><span className="flex items-center gap-2 text-[10px]">{known?(on?"ON":"OFF"):"Unknown"}<Power className="h-4 w-4"/></span></button>;
        })}</div></section>}

        {!ir && powers.length>0 && <GangNamesEditor key={`names-${device.id}`} device={device} onSaved={onDeviceChange}/>}

        {motors.map(motor=><section key={motor.id} className="space-y-3 rounded-2xl border border-indigo-800/50 bg-indigo-950/20 p-4">
          <div className="flex justify-between"><h3 className="text-sm font-semibold text-indigo-200">{motor.label}</h3><span className="text-xs text-slate-400">{motor.position===undefined?"Position not reported":`${motor.position}% open`}</span></div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={busy||!device.online||!motor.canOpen} onClick={()=>send({motorCode:motor.id,curtainState:"open"})} className={actionClass}><ArrowUpToLine className="mx-auto mb-1 h-5 w-5"/>Open</button>
            <button type="button" disabled={busy||!device.online||!motor.canStop} onClick={()=>send({motorCode:motor.id,curtainState:"paused"})} className={actionClass}><Pause className="mx-auto mb-1 h-5 w-5"/>Stop</button>
            <button type="button" disabled={busy||!device.online||!motor.canClose} onClick={()=>send({motorCode:motor.id,curtainState:"closed"})} className={actionClass}><ArrowDownToLine className="mx-auto mb-1 h-5 w-5"/>Close</button>
          </div>
          {motor.calibrated===false&&<p className="text-xs leading-relaxed text-amber-200">Tuya reports unfinished travel calibration. Complete calibration in the Tuya app before using a percentage. Open/Close remain available where supported.</p>}
          {motor.canPosition&&<div className="space-y-2"><label className="flex justify-between text-[11px] text-slate-400" htmlFor={`motor-${motor.id}`}><span>Requested position (not current position)</span><span>{positions[motor.id]??motor.position??50}%</span></label><input id={`motor-${motor.id}`} type="range" min={0} max={100} value={positions[motor.id]??motor.position??50} onChange={e=>setPositions(p=>({...p,[motor.id]:Number(e.target.value)}))} className="h-6 w-full accent-indigo-400"/><button type="button" disabled={busy||!device.online||positions[motor.id]===undefined} onClick={()=>send({motorCode:motor.id,curtainPosition:positions[motor.id]})} className={`${actionClass} w-full`}>Move to requested position</button></div>}
        </section>)}

        {!ir&&functions.some(f=>["bright_value_v2","bright_value","bright"].includes(f.code))&&<section className="space-y-2 rounded-xl bg-slate-950 p-4"><label htmlFor="device-brightness" className="text-xs text-slate-400">Brightness target: {brightness}%</label><input id="device-brightness" type="range" min={1} max={100} value={brightness} onChange={e=>setBrightness(Number(e.target.value))} className="w-full accent-amber-400"/><button type="button" onClick={()=>send({brightness})} disabled={busy||!device.online} className={actionClass}>Set brightness</button></section>}

        {ir && ir.categoryId!==5 && <section className="space-y-3 rounded-2xl border border-cyan-800 bg-cyan-950/20 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><Radio className="h-5 w-5"/>Paired Tuya infrared remote</h3>
          <p className="text-xs leading-relaxed text-slate-400">The hub must be online and within line of sight. Cloud acceptance cannot confirm appliance reception.</p>
          {!ir.available?<p className="text-xs text-amber-200">{ir.error||"IR API unavailable. Assign a Tuya scene below."}</p>:<div className="grid grid-cols-2 gap-2">{ir.keys.map(key=><button type="button" disabled={busy||!device.online} key={`${key.key}-${key.key_id}`} onClick={()=>send({remoteKey:key.key})} className={actionClass}>{key.key_name||key.key}</button>)}</div>}
        </section>}
        {ir && <IRControlMethod key={`ir-method-${device.id}`} device={device} scenes={scenes} currentAcAction={isAc?acAction:undefined} onSaved={onDeviceChange}/>}

        {!!integration?.linkedRemotes?.length&&<section className="space-y-2"><h3 className="text-xs font-semibold text-slate-400">Appliances paired to this IR hub</h3>{integration.linkedRemotes.map(remote=><button type="button" key={remote.id} onClick={()=>onOpenDevice(remote.id)} className={`${actionClass} w-full text-left`}>{remote.name} →</button>)}</section>}
        {device.state.readOnly&&!ir&&<p className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">{device.state.readOnlyReason||"Tuya does not share writable controls for this device."} Your imported scenes below can provide supported actions.</p>}
        {!!related.length&&<section className="space-y-2"><h3 className="text-xs font-semibold text-slate-400">Tuya scenes affecting this device</h3>{related.map(s=><button type="button" key={s.id} disabled={busy||s.integration?.enabled===false} onClick={()=>runScene(s)} className={`${actionClass} flex w-full items-center justify-between`}><span>{s.name}<small className="block text-[10px] font-normal text-slate-500">May also control other devices in the scene</small></span><Play className="h-4 w-4"/></button>)}</section>}
        {tuyaScenes.length>0&&<details className="rounded-xl border border-slate-700 p-3"><summary className="cursor-pointer text-xs text-slate-400">Run another imported Tuya scene</summary><div className="mt-3 flex gap-2"><select aria-label="Choose Tuya scene" value={sceneId} onChange={e=>setSceneId(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-slate-950 p-2 text-xs"><option value="">Choose an existing scene…</option>{tuyaScenes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="button" disabled={busy||!sceneId} className={actionClass} onClick={()=>{const s=tuyaScenes.find(s=>s.id===sceneId);if(s)void runScene(s);}}>Run scene</button></div></details>}
        {integration?.command?.durationMs!==undefined && <p className="text-right font-mono text-[10px] text-slate-500">Last provider request: {(integration.command.durationMs/1000).toFixed(2)} s · {integration.command.provider}</p>}
        {busy&&<p role="status" className="flex items-center gap-2 text-xs text-cyan-300"><Loader2 className="h-4 w-4 animate-spin"/>Waiting for Tuya… no state is assumed.</p>}
        {(message||integration?.command?.message)&&<div role={failure?"alert":"status"} className={`rounded-xl border p-3 text-xs leading-relaxed ${failure?"border-rose-600/50 bg-rose-950/30 text-rose-200":"border-slate-700 bg-slate-950 text-slate-300"}`}>{message||integration?.command?.message}</div>}
      </div>
    </div>
  </div>;
}
