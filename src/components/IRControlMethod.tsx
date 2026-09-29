"use client";
import {useEffect,useMemo,useState} from "react";
import {AlertTriangle,Link,Save,RefreshCw} from "lucide-react";
import type {SmartDevice,SmartScene} from "@/types/smart-home";
import {sceneActionKey} from "@/lib/device-preferences";

interface Props {device:SmartDevice;scenes:SmartScene[];currentAcAction?:Record<string,unknown>;onSaved:(device:SmartDevice)=>void}
function describe(request:Record<string,unknown>):string {
  if(Object.keys(request).length===1&&request.isOn!==undefined)return request.isOn?"Power ON":"Power OFF";
  if(request.remoteKey!==undefined)return `Remote key: ${request.remoteKey}`;
  return [request.mode,request.targetTemp!==undefined?`${request.targetTemp}°C`:null,request.fanSpeed?`fan ${request.fanSpeed}`:null,request.isOn===true?"power on":request.isOn===false?"power off":null].filter(Boolean).join(" · ");
}
export function IRControlMethod({device,scenes,currentAcAction,onSaved}:Props) {
  const blocked=device.integration?.command?.code==="IR_CONTROL_QUOTA"||/controllable device pool|control-pool quota/i.test(device.integration?.command?.message||"");
  const [mode,setMode]=useState<"direct"|"scenes"|"home-assistant">(device.integration?.irControlMode||"direct");
  const [haStatus,setHaStatus]=useState<{configured:boolean;connected:boolean;entities:Array<{entityId:string;name:string;domain:string;state:string}>;error?:string}>({configured:false,connected:false,entities:[]});
  const [haEntity,setHaEntity]=useState(device.integration?.homeAssistantEntityId||"");
  const [bindings,setBindings]=useState(device.integration?.sceneBindings||[]);
  const [action,setAction]=useState("");const [sceneId,setSceneId]=useState("");
  const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");const [failed,setFailed]=useState(false);
  const options=useMemo(()=>{
    const list:Array<{request:Record<string,unknown>;label:string}>=[];
    if(device.integration?.infrared?.categoryId===5){list.push({request:{isOn:true},label:"Power ON"},{request:{isOn:false},label:"Power OFF"});if(currentAcAction){list.push({request:currentAcAction,label:`Current AC settings: ${describe(currentAcAction)}`});if(typeof currentAcAction.targetTemp==="number")list.push({request:{targetTemp:currentAcAction.targetTemp},label:`Set temperature to ${currentAcAction.targetTemp}°C`});}}
    for(const key of device.integration?.infrared?.keys||[])list.push({request:{remoteKey:key.key},label:`Remote key: ${key.key_name||key.key}`});
    return list;
  },[device.integration?.infrared,currentAcAction]);
  const available=scenes.filter(s=>s.integration?.source==="smartlife"&&s.integration.enabled!==false&&(!device.integration?.homeId||s.integration.homeId===device.integration.homeId));
  useEffect(()=>{
    let active=true;
    fetch("/api/home-assistant",{cache:"no-store"}).then(r=>r.json()).then(r=>{if(active&&r.success)setHaStatus(r.data);}).catch(()=>{});
    return()=>{active=false;};
  },[]);
  const compatibleHa=haStatus.entities.filter(entity=>device.integration?.infrared?.categoryId===5?entity.domain==="climate":entity.domain==="remote");
  const add=()=>{
    const selected=options.find(o=>sceneActionKey(o.request)===action);if(!selected||!sceneId)return;
    setBindings(old=>[...old.filter(b=>sceneActionKey(b.request)!==action),{request:selected.request,sceneId}]);setAction("");setSceneId("");setFeedback("");
  };
  const save=async()=>{setBusy(true);setFeedback("");setFailed(false);try{
    const response=await fetch(`/api/devices/${encodeURIComponent(device.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({irControlMode:mode,sceneBindings:bindings,homeAssistantEntityId:mode==="home-assistant"?haEntity:device.integration?.homeAssistantEntityId||null})});
    const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||"Could not save control method.");
    onSaved(result.data);setFeedback(mode==="scenes"?"Scene mode saved. Only exact assigned actions use Smart Life scenes; unmapped actions send nothing.":mode==="home-assistant"?"Home Assistant bridge saved. Commands for this card now use the selected local entity instead of Tuya's IR developer API.":"Direct IR mode saved. Tuya's IR API permissions and quota still apply.");
  }catch(e){setFailed(true);setFeedback(e instanceof Error?e.message:"Could not save.");}finally{setBusy(false);}};
  const retryDirect=async()=>{setBusy(true);setFeedback("");setFailed(false);try{
    const response=await fetch(`/api/devices/${encodeURIComponent(device.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({clearCommandError:true})});
    const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||"Could not clear the quota lock.");
    onSaved(result.data);setFeedback("Direct IR is enabled for one explicit retry. Use this only after changing the Tuya controllable-device entitlement. Clearing this dashboard warning does not increase Tuya's quota.");
  }catch(e){setFailed(true);setFeedback(e instanceof Error?e.message:"Could not clear the warning.");}finally{setBusy(false);}};
  const refreshDefinition=async()=>{setBusy(true);setFeedback("");setFailed(false);try{
    const response=await fetch(`/api/devices/${encodeURIComponent(device.id)}/infrared`,{method:"POST"});
    const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||"Could not refresh the remote definition.");
    onSaved(result.data);setFeedback(result.message||"Remote keys and supported ranges refreshed; no IR signal sent.");
  }catch(e){setFailed(true);setFeedback(e instanceof Error?e.message:"IR metadata refresh failed.");}finally{setBusy(false);}};
  if(!device.integration?.infrared)return null;
  return <details open={blocked?true:undefined} className="rounded-2xl border border-amber-800/50 bg-amber-950/15 p-4" data-testid="ir-control-method">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-amber-200"><Link className="h-4 w-4"/>IR control method / quota alternative</summary>
    <div className="mt-3 space-y-3">
      <p className="text-[11px] leading-relaxed text-slate-400">Direct IR uses Tuya's developer API and can hit its own quota even while switches work through Smart Life. You can instead assign existing Tap-to-Run scenes from your account. This is an explicitly selected route, not an automatic quota bypass.</p>
      {blocked&&<div role="alert" className="space-y-2 rounded-xl border border-rose-700/50 bg-rose-950/25 p-3 text-[11px] leading-relaxed text-rose-100">
        <p className="font-bold text-rose-200">Tuya rejected this remote with 60001001. Repeated direct attempts are paused.</p>
        <p><strong>Full dynamic AC control:</strong> Tuya Developer Platform → Cloud → Cloud Services → IoT Core. Upgrade or renew capacity so the project's “Max number of controllable devices” covers these IR virtual remotes. Trial Edition documents a limit of 10. Then open Devices → All Devices, filter/check Device Permission, return here and use the retry button below.</p>
        <p><strong>Scene alternative:</strong> in Smart Life/Tuya Smart → Scene → + → Tap-to-Run → add the exact AC action → Save. Return here, press Sync Tuya account, choose “My assigned Tuya scenes,” and map that exact action. Your current account has no imported scenes linked to this affected AC, so scene mode cannot work until you create them.</p>
      </div>}
      <details className="rounded-xl border border-slate-700/60 p-3 text-[11px] leading-relaxed text-slate-400"><summary className="cursor-pointer text-slate-300">Accepted, but the IR appliance did not respond?</summary><p className="mt-2">Check the same action in the original Tuya app. The hub must be powered, online and aimed at the appliance. If the phone app also fails, repair the paired remote/code library in Tuya, then refresh the IR definition here. A successful cloud response cannot prove reception of an infrared signal; this dashboard will not claim that it does.</p></details>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void refreshDefinition()} disabled={busy} className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs text-cyan-200 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5"/>Refresh IR definition</button>{blocked&&<button type="button" onClick={()=>void retryDirect()} disabled={busy} className="min-h-10 rounded-xl border border-rose-700/60 px-3 text-xs text-rose-200 disabled:opacity-40">Retry direct IR after quota change</button>}</div>
      <label className="block text-xs text-slate-300">Control method<select aria-label="IR control method" value={mode} onChange={e=>setMode(e.target.value as typeof mode)} disabled={busy} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm"><option value="direct">Direct IR API (quota applies)</option><option value="scenes">My assigned Tuya scenes</option><option value="home-assistant">Home Assistant / local bridge</option></select></label>
      {mode==="home-assistant"&&<div className="space-y-2 rounded-xl border border-cyan-800/50 bg-cyan-950/20 p-3">
        <p className="text-[11px] leading-relaxed text-cyan-100">This routes through a Home Assistant instance on your home network (for example Tuya Local/LocalTuya or a local IR integration). It does not consume Tuya developer controllable-device slots.</p>
        {!haStatus.configured?<p className="text-xs text-amber-200">Set server-only <code>HOME_ASSISTANT_URL</code> and <code>HOME_ASSISTANT_TOKEN</code> in Vercel, redeploy, then reopen this panel. The URL must be securely reachable from Vercel (Nabu Casa or your authenticated HTTPS tunnel).</p>:!haStatus.connected?<p className="text-xs text-rose-200">Home Assistant is configured but unavailable: {haStatus.error||"check its remote URL and token"}</p>:<label className="block text-[11px] text-slate-300">Mapped entity<select aria-label="Home Assistant entity" value={haEntity} onChange={e=>setHaEntity(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 p-2 text-xs"><option value="">Choose an exact entity…</option>{compatibleHa.map(e=><option key={e.entityId} value={e.entityId}>{e.name} · {e.entityId}</option>)}</select></label>}
        {haStatus.connected&&!compatibleHa.length&&<p className="text-xs text-amber-200">No compatible {device.integration?.infrared?.categoryId===5?"climate":"remote"} entity is currently exposed by Home Assistant.</p>}
      </div>}
      <p className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0"/>A scene may affect other devices. Choose it yourself after checking its actions in the Tuya app. Nothing runs when you save these settings.</p>
      {!available.length?<p className="rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-400">No Tap-to-Run scenes are currently imported for this home. Create the required actions in the Tuya/Smart Life phone app, then close this panel and use <strong>Sync Tuya account</strong>. Temperature, mode and fan values need separate exact scene mappings if you choose scene mode.</p>:<>
        <label className="block text-[11px] text-slate-400">Exact action<select aria-label="Action to map" value={action} onChange={e=>setAction(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 p-2 text-xs"><option value="">Choose an action…</option>{options.map(o=><option key={sceneActionKey(o.request)} value={sceneActionKey(o.request)}>{o.label}</option>)}</select></label>
        <label className="block text-[11px] text-slate-400">Your Tuya scene<select aria-label="Scene for action" value={sceneId} onChange={e=>setSceneId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-slate-950 p-2 text-xs"><option value="">Choose a scene from this home…</option>{available.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button type="button" disabled={busy||!action||!sceneId} onClick={add} className="min-h-10 rounded-xl border border-amber-600/40 px-3 text-xs text-amber-200 disabled:opacity-40">Assign scene to action</button>
      </>}
      {bindings.length>0&&<div className="space-y-2">{bindings.map(b=><div key={sceneActionKey(b.request)} className="flex items-start justify-between gap-3 rounded-xl bg-slate-950 p-3 text-[11px]"><div><strong className="block text-slate-200">{describe(b.request)}</strong><span className="text-slate-400">{scenes.find(s=>s.id===b.sceneId)?.name||"Scene unavailable"}</span></div><button type="button" disabled={busy} aria-label={`Remove mapping ${describe(b.request)}`} onClick={()=>setBindings(old=>old.filter(x=>sceneActionKey(x.request)!==sceneActionKey(b.request)))} className="text-rose-300">Remove</button></div>)}</div>}
      <button type="button" disabled={busy||(mode==="scenes"&&!bindings.length)||(mode==="home-assistant"&&(!haStatus.connected||!haEntity))} onClick={()=>void save()} className="flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 text-xs font-bold text-slate-950 disabled:opacity-40"><Save className="h-4 w-4"/>{busy?"Saving…":"Save control method"}</button>
      {feedback&&<p role={failed?"alert":"status"} className={`rounded-xl border p-3 text-xs leading-relaxed ${failed?"border-rose-700 text-rose-200":"border-emerald-700 text-emerald-200"}`}>{feedback}</p>}
    </div>
  </details>;
}
