"use client";

import { useState } from "react";
import type { Favorite } from "@/types/smart-home";
import { DeviceIcon } from "./DeviceIcon";
import { Pencil, Loader2, X, Power, ArrowUpToLine, ArrowDownToLine, Pause } from "lucide-react";

type GroupAction = "on" | "off" | "stop";
interface Props {
  favorites: Favorite[];
  deviceCounts: Record<string,number>;
  onTrigger:(favorite:Favorite,action?:GroupAction)=>Promise<{ok:boolean;message:string}>;
  onEdit:()=>void;
}
export function FavoritesBar({favorites,deviceCounts,onTrigger,onEdit}:Props) {
  const [selected,setSelected]=useState<Favorite|null>(null);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState<{ok:boolean;message:string}|null>(null);
  const visible=favorites.filter(f=>f.visible!==false);
  const run=async(action:GroupAction)=>{if(!selected||busy)return;setBusy(true);setFeedback(null);try{setFeedback(await onTrigger(selected,action));}catch{setFeedback({ok:false,message:"Group request could not be confirmed."});}finally{setBusy(false);}};
  return <section className="w-full">
    <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quick Groups</span><button type="button" onClick={onEdit} className="flex min-h-9 items-center gap-1 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-300"><Pencil className="h-3 w-3"/>Customise</button></div>
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{visible.map(favorite=>{
      const count=favorite.deviceIds?.length??deviceCounts[favorite.category||""]??0;
      return <button type="button" key={favorite.id} onClick={()=>{setSelected(favorite);setFeedback(null);}} className="group relative flex min-h-[112px] flex-col items-start justify-between overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/85 p-3 text-left shadow-lg transition-all hover:border-slate-500">
        <span className={`absolute inset-0 bg-gradient-to-br opacity-25 ${favorite.gradient}`}/><span className="relative flex w-full items-start justify-between"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white ${favorite.gradient}`}><DeviceIcon name={favorite.icon} className="h-6 w-6"/></span><span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold text-white">{count}</span></span>
        <span className="relative mt-2"><strong className="block text-sm text-white">{favorite.label}</strong><small className="text-[10px] text-white/65">Tap for group controls</small></span>
      </button>;
    })}</div>
    {selected&&<div role="dialog" aria-modal="true" aria-label={`${selected.label} group controls`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white">
        <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><DeviceIcon name={selected.icon} className="h-6 w-6"/>{selected.label}</h2><button type="button" aria-label="Close group controls" disabled={busy} onClick={()=>setSelected(null)} className="rounded-xl bg-slate-800 p-3"><X className="h-4 w-4"/></button></div>
        <p className="text-xs leading-relaxed text-slate-400">Choose an explicit action for this group. The dashboard reports acceptance and failures separately; it does not assume every device responded.</p>
        <div className={`grid gap-2 ${selected.category==="curtain"?"grid-cols-3":"grid-cols-2"}`}>
          <button type="button" disabled={busy} onClick={()=>run("on")} className="min-h-20 rounded-2xl bg-cyan-500/20 p-4 text-xs font-bold text-cyan-200 disabled:opacity-50">{selected.category==="curtain"?<ArrowUpToLine className="mx-auto mb-2 h-6 w-6"/>:<Power className="mx-auto mb-2 h-6 w-6"/>}{selected.category==="curtain"?"Open all":"Turn all on"}</button>
          {selected.category==="curtain"&&<button type="button" disabled={busy} onClick={()=>run("stop")} className="min-h-20 rounded-2xl bg-slate-800 p-4 text-xs font-bold text-slate-200 disabled:opacity-50"><Pause className="mx-auto mb-2 h-6 w-6"/>Stop all</button>}
          <button type="button" disabled={busy} onClick={()=>run("off")} className="min-h-20 rounded-2xl bg-slate-800 p-4 text-xs font-bold text-slate-200 disabled:opacity-50">{selected.category==="curtain"?<ArrowDownToLine className="mx-auto mb-2 h-6 w-6"/>:<Power className="mx-auto mb-2 h-6 w-6"/>}{selected.category==="curtain"?"Close all":"Turn all off"}</button>
        </div>
        {busy&&<p role="status" className="flex items-center gap-2 text-xs text-cyan-300"><Loader2 className="h-4 w-4 animate-spin"/>Sending commands and checking responses…</p>}
        {feedback&&<p role={feedback.ok?"status":"alert"} className={`rounded-xl border p-3 text-xs leading-relaxed ${feedback.ok?"border-cyan-700 text-cyan-100":"border-rose-600/50 text-rose-200"}`}>{feedback.message}</p>}
      </div>
    </div>}
  </section>;
}
