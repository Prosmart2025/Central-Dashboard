"use client";
import {useState} from "react";
import {Download,Loader2,Pencil,Save} from "lucide-react";
import type {SmartDevice} from "@/types/smart-home";
import {powerFunctions} from "@/lib/device-capabilities";

export function GangNamesEditor({device,onSaved}:{device:SmartDevice;onSaved:(device:SmartDevice)=>void}) {
  const [draft,setDraft]=useState<Record<string,string>>({...device.integration?.channelNames});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState(false);
  const powers=powerFunctions(device.integration?.functions||[]);
  const submit=async(importNames=false)=>{
    if(busy)return;setBusy(true);setMessage("");setError(false);
    try{
      const url=`/api/devices/${encodeURIComponent(device.id)}${importNames?"/channel-names":""}`;
      const response=await fetch(url,{method:importNames?"POST":"PATCH",headers:{"Content-Type":"application/json"},body:importNames?undefined:JSON.stringify({channelNames:Object.fromEntries(powers.map(f=>[f.code,(draft[f.code]||"").trim()]))})});
      const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||"Could not save gang names.");
      onSaved(result.data);setDraft({...result.data.integration?.channelNames});
      setMessage(result.message||(importNames?"Tuya names imported; local renames preserved.":"Gang names saved in this dashboard. They survive sync and reload."));
    }catch(e){setError(true);setMessage(e instanceof Error?e.message:"Request failed. Your labels were not changed.");}finally{setBusy(false);}
  };
  if(!powers.length)return null;
  return <details className="rounded-2xl border border-slate-700 bg-slate-950/40 p-3" data-testid="gang-name-editor">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-cyan-200"><Pencil className="h-4 w-4"/>Rename gangs</summary>
    <div className="mt-3 space-y-3">
      <p className="text-[11px] leading-relaxed text-slate-400">Imported names come from Tuya. Enter a local name to override one; leave it blank to use the Tuya name. Saving here does not rename it in the phone app.</p>
      {powers.map((f,i)=><label key={f.code} className="block text-[11px] text-slate-400" htmlFor={`gang-name-${f.code}`}>
        <span className="mb-1 flex justify-between gap-2"><span>Gang {i+1} <code className="text-slate-600">{f.code}</code></span><span className="truncate text-slate-500">Tuya: {device.integration?.tuyaChannelNames?.[f.code]||"Not supplied"}</span></span>
        <input id={`gang-name-${f.code}`} aria-label={`Name for ${f.code}`} value={draft[f.code]||""} maxLength={80} disabled={busy} placeholder={device.integration?.tuyaChannelNames?.[f.code]||`Gang ${i+1}`} onChange={e=>setDraft(old=>({...old,[f.code]:e.target.value}))} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white focus:border-cyan-400 focus:outline-none disabled:opacity-60"/>
      </label>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={()=>void submit()} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-slate-950 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save gang names</button>
        <button type="button" onClick={()=>void submit(true)} disabled={busy} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-xs text-slate-200 disabled:opacity-50"><Download className="h-4 w-4"/>Import names from Tuya</button>
      </div>
      {device.integration?.channelNamesError&&<p className="text-[11px] text-amber-200">{device.integration.channelNamesError}</p>}
      {message&&<p role={error?"alert":"status"} className={`rounded-xl border p-3 text-xs ${error?"border-rose-700 text-rose-200":"border-emerald-700 text-emerald-200"}`}>{message}</p>}
    </div>
  </details>;
}
