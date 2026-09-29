"use client";
import {useState} from "react";
import {Eye,RefreshCw} from "lucide-react";
interface HiddenCard{id:string;name:string;icon:string;available:boolean}
export function HiddenCardsSettings(){
 const [cards,setCards]=useState<HiddenCard[]>([]);const [loaded,setLoaded]=useState(false);const [busy,setBusy]=useState("");const [error,setError]=useState("");
 const load=async()=>{setError("");try{const r=await fetch('/api/devices/hidden',{cache:'no-store'});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'Could not load hidden cards.');setCards(d.data);setLoaded(true);}catch(e){setError(e instanceof Error?e.message:'Could not load cards.');}};
 const restore=async(id:string)=>{setBusy(id);setError("");try{const r=await fetch(`/api/devices/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({hidden:false})});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'Restore failed');setCards(old=>old.filter(c=>c.id!==id));window.dispatchEvent(new Event('smartlife-updated'));}catch(e){setError(e instanceof Error?e.message:'Restore failed');}finally{setBusy("");}};
 return <details className="rounded-2xl border border-slate-700 bg-slate-950/50 p-3" onToggle={e=>{if(e.currentTarget.open&&!loaded)void load();}}>
  <summary className="cursor-pointer text-xs font-semibold text-slate-300">Hidden cards</summary><p className="mt-2 text-[11px] leading-relaxed text-slate-400">Removing a card hides it only here. Hidden cards remain hidden during account sync. Tuya devices are never deleted.</p>
  <button type="button" aria-label="Refresh hidden cards" onClick={()=>void load()} className="my-2 flex min-h-9 items-center gap-1 text-[11px] text-cyan-300"><RefreshCw className="h-3 w-3"/>Refresh list</button>
  {loaded&&!cards.length&&<p className="text-xs text-slate-500">No hidden cards.</p>}
  <div className="max-h-64 space-y-2 overflow-auto">{cards.map(card=><div key={card.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-900 p-2 text-xs"><span>{card.name}{!card.available&&<small className="block text-[10px] text-amber-300">Missing from latest Tuya catalog</small>}</span><button type="button" disabled={Boolean(busy)} onClick={()=>void restore(card.id)} className="flex min-h-10 items-center gap-1 rounded-lg bg-cyan-500/20 px-3 text-cyan-200 disabled:opacity-50"><Eye className="h-3.5 w-3.5"/>Restore</button></div>)}</div>
  {error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
 </details>;
}
