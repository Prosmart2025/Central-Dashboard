"use client";
import {useEffect,useState} from "react";
import {Cloud,Loader2,RefreshCw,Server,CheckCircle2,AlertCircle} from "lucide-react";
interface Entity{entityId:string;name:string;domain:string;state:string}
interface Status{configured:boolean;connected:boolean;entities:Entity[];error?:string}
export function ProviderIntegrations(){
 const [status,setStatus]=useState<Status>({configured:false,connected:false,entities:[]});const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [failed,setFailed]=useState(false);
 const load=async()=>{try{const r=await fetch('/api/home-assistant',{cache:'no-store'});const d=await r.json();if(d.success)setStatus(d.data);else throw Error(d.error);}catch(e){setFailed(true);setMessage(e instanceof Error?e.message:'Provider status failed.');}};
 useEffect(()=>{void load();},[]);
 const sync=async()=>{setBusy(true);setFailed(false);setMessage('');try{const r=await fetch('/api/home-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync'})});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'Sync failed');setMessage(`${d.message} Providers: ${(d.data.providers||[]).join(', ')||'Home Assistant'}.`);window.dispatchEvent(new Event('smartlife-updated'));await load();}catch(e){setFailed(true);setMessage(e instanceof Error?e.message:'Provider sync failed.');}finally{setBusy(false);}};
 const counts=Object.entries(status.entities.reduce<Record<string,number>>((a,e)=>{a[e.domain]=(a[e.domain]||0)+1;return a;},{}));
 return <section className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4" data-testid="generic-integrations">
  <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-bold text-cyan-200"><Server className="h-5 w-5"/>Generic provider bridge</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Imports areas and entities from Home Assistant, including Shelly, Sonoff/eWeLink, Tuya Local and other configured integrations. Vercel cannot scan your private LAN directly.</p></div>{status.connected?<CheckCircle2 className="h-5 w-5 text-emerald-400"/>:<Cloud className="h-5 w-5 text-slate-500"/>}</div>
  {!status.configured?<div className="mt-3 rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-300"><p className="font-semibold text-white">Server configuration required</p><p className="mt-1">Add server-only <code>HOME_ASSISTANT_URL</code> and <code>HOME_ASSISTANT_TOKEN</code> in Vercel. Use a protected HTTPS URL reachable from Vercel. Then redeploy.</p><p className="mt-1 text-slate-500">For Shelly: use Home Assistant's official local Shelly integration. For Sonoff: use your trusted eWeLink/Sonoff integration, such as SonoffLAN or eWeLink CUBE.</p></div>:!status.connected?<p role="alert" className="mt-3 flex gap-2 rounded-xl border border-rose-700/50 p-3 text-xs text-rose-200"><AlertCircle className="h-4 w-4 shrink-0"/>{status.error||'Home Assistant unavailable.'}</p>:<>
    <div className="mt-3 flex flex-wrap gap-2">{counts.map(([domain,count])=><span key={domain} className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{domain}: {count}</span>)}</div>
    <button type="button" disabled={busy} onClick={()=>void sync()} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-slate-950 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}Detect / sync provider devices</button>
  </>}
  {message&&<p role={failed?'alert':'status'} className={`mt-3 rounded-xl border p-3 text-xs ${failed?'border-rose-700 text-rose-200':'border-emerald-700 text-emerald-200'}`}>{message}</p>}
 </section>;
}
