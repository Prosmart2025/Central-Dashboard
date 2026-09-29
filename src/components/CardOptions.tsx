"use client";
import {useRef,useState} from "react";
import {MoreHorizontal,Trash2} from "lucide-react";
import type {SmartDevice} from "@/types/smart-home";
import type {CardSize} from "@/lib/card-preferences";

export function CardOptions({device,onChanged,onRemoved,disabled=false}:{device:SmartDevice;onChanged:(device:SmartDevice)=>void;onRemoved:(id:string)=>void;disabled?:boolean}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const menu=useRef<HTMLDetailsElement>(null);
 const resize=async(size:CardSize)=>{setBusy(true);setError("");try{const r=await fetch(`/api/devices/${encodeURIComponent(device.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({cardSize:size})});const result=await r.json();if(!r.ok||!result.success)throw Error(result.error||"Could not resize card.");onChanged(result.data);if(menu.current)menu.current.open=false;}catch(e){setError(e instanceof Error?e.message:"Resize failed.");}finally{setBusy(false);}};
 const remove=async()=>{if(!confirm(`Remove “${device.name}” from this dashboard?\n\nThe Tuya device and all its settings are unchanged. You can restore the card in Settings → Security & Reset → Hidden cards.`))return;setBusy(true);setError("");try{const r=await fetch(`/api/devices/${encodeURIComponent(device.id)}`,{method:"DELETE"});const result=await r.json();if(!r.ok||!result.success)throw Error(result.error||"Could not remove card.");onRemoved(device.id);}catch(e){setError(e instanceof Error?e.message:"Could not remove card.");}finally{setBusy(false);}};
 return <details ref={menu} className="absolute right-14 top-4 z-20" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <summary aria-label={`Card options for ${device.name}`} title="Card options" className={`flex h-9 w-8 cursor-pointer list-none items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 hover:text-white [&::-webkit-details-marker]:hidden ${disabled?'pointer-events-none opacity-50':''}`}><MoreHorizontal className="h-4 w-4"/></summary>
  <div className="absolute right-0 top-10 w-48 rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl" onDragStart={e=>e.preventDefault()}>
    <label className="block text-[11px] font-semibold text-slate-400">Card size<select aria-label={`Card size for ${device.name}`} disabled={busy||disabled} value={device.integration?.cardSize||"standard"} onChange={e=>void resize(e.target.value as CardSize)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs text-white"><option value="standard">Standard</option><option value="wide">Wide</option><option value="large">Large</option></select></label>
    <button type="button" disabled={busy||disabled} onClick={()=>void remove()} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl border border-rose-800/60 bg-rose-950/30 px-3 text-xs text-rose-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5"/>Remove card</button>
    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Dashboard only. Never deletes or modifies the Tuya device.</p>
    {error&&<p role="alert" className="mt-2 text-[11px] text-rose-300">{error}</p>}
  </div>
 </details>;
}
