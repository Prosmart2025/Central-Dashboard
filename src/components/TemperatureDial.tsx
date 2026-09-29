"use client";

import { useRef } from "react";
import { Minus, Plus } from "lucide-react";

interface Props {
  value:number;
  values:number[];
  unit?:"C"|"F";
  disabled?:boolean;
  onChange:(temperature:number)=>void;
  caption?:string;
}
function point(degrees:number,radius=98){const angle=degrees*Math.PI/180;return {x:128+radius*Math.cos(angle),y:128+radius*Math.sin(angle)};}
const start=point(135), end=point(405);
const track=`M ${start.x} ${start.y} A 98 98 0 1 1 ${end.x} ${end.y}`;
export function TemperatureDial({value,values,unit="C",disabled=false,onChange,caption}:Props) {
  const dial=useRef<HTMLDivElement>(null);
  const dragging=useRef(false);
  const available=[...new Set(values.filter(Number.isFinite))].sort((a,b)=>a-b);
  const index=available.reduce((best,t,i)=>Math.abs(t-value)<Math.abs((available[best]??value)-value)?i:best,0);
  const shown=available[index]??value;
  const progress=available.length>1?index/(available.length-1):0;
  const knob=point(135+270*progress);
  const display=(n:number)=>unit==="F"?n*9/5+32:n;
  const move=(direction:number)=>{const n=Math.min(available.length-1,Math.max(0,index+direction));if(!disabled&&available[n]!==undefined)onChange(available[n]);};
  const atPointer=(x:number,y:number)=>{
    const rect=dial.current?.getBoundingClientRect();if(!rect||disabled||!available.length)return;
    const dx=x-rect.left-rect.width/2,dy=y-rect.top-rect.height/2;
    if(Math.hypot(dx,dy)<rect.width*.19)return;
    let angle=(Math.atan2(dy,dx)*180/Math.PI+360-135)%360;
    if(angle>270)angle=angle>315?0:270;
    const next=Math.round(angle/270*(available.length-1));onChange(available[next]);
  };
  return <div className="flex flex-col items-center" data-testid="ac-temperature-dial">
    <div
      ref={dial}
      role="slider" aria-label="Target temperature dial" tabIndex={disabled?-1:0}
      aria-valuemin={display(available[0]??value)} aria-valuemax={display(available.at(-1)??value)}
      aria-valuenow={display(shown)} aria-valuetext={`${display(shown).toFixed(Number.isInteger(display(shown))?0:1)} degrees ${unit==="C"?"Celsius":"Fahrenheit"}, selected target`}
      aria-disabled={disabled||!available.length}
      className={`relative h-64 w-64 max-w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${disabled?"opacity-60":"cursor-pointer"}`}
      style={{touchAction:"none"}}
      onPointerDown={e=>{if(disabled)return;dragging.current=true;e.currentTarget.setPointerCapture(e.pointerId);atPointer(e.clientX,e.clientY);}}
      onPointerMove={e=>{if(dragging.current)atPointer(e.clientX,e.clientY);}}
      onPointerUp={e=>{dragging.current=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{dragging.current=false;}}
      onKeyDown={e=>{if(disabled)return;if(["ArrowUp","ArrowRight","ArrowDown","ArrowLeft","Home","End"].includes(e.key)){e.preventDefault();if(e.key==="Home"&&available.length)onChange(available[0]);else if(e.key==="End"&&available.length)onChange(available[available.length-1]);else move(e.key==="ArrowUp"||e.key==="ArrowRight"?1:-1);}}}
    >
      <div className="pointer-events-none absolute inset-8 rounded-full bg-cyan-500/10 blur-2xl"/>
      <svg viewBox="0 0 256 256" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {Array.from({length:37},(_,i)=>{const a=point(135+i*7.5,116),b=point(135+i*7.5,120);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={i/36<=progress?"#67e8f9":"#334155"} strokeWidth={1.5}/>;})}
        <path d={track} fill="none" stroke="#1e293b" strokeWidth={11} strokeLinecap="round"/>
        <path d={track} pathLength={100} fill="none" stroke="#22d3ee" strokeWidth={11} strokeLinecap="round" strokeDasharray={`${Math.max(.1,progress*100)} 100`} className="drop-shadow-[0_0_8px_rgba(34,211,238,0.35)]"/>
        <circle cx={knob.x} cy={knob.y} r={8} fill="#ecfeff" stroke="#22d3ee" strokeWidth={3}/>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-1">
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Selected target</span>
        <div className="flex items-start gap-1"><span className="font-mono text-[58px] font-semibold leading-none tracking-tighter text-white">{Number.isInteger(display(shown))?display(shown):display(shown).toFixed(1)}</span><span className="mt-2 text-lg text-cyan-200">°{unit}</span></div>
        <span className="mt-3 text-[11px] text-slate-400">{caption||"Changes send automatically"}</span>
      </div>
    </div>
    <div className="-mt-8 flex w-56 max-w-full items-center justify-between gap-3">
      <button type="button" aria-label="Decrease temperature" disabled={disabled||index===0||!available.length} onClick={()=>move(-1)} className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-white hover:border-cyan-400 disabled:opacity-30"><Minus className="h-5 w-5"/></button>
      <span className="text-[10px] text-slate-500">{available.length?`${Math.round(display(available[0]))}–${Math.round(display(available.at(-1)!))}°${unit}`:"Range unavailable"}</span>
      <button type="button" aria-label="Increase temperature" disabled={disabled||index>=available.length-1||!available.length} onClick={()=>move(1)} className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-white hover:border-cyan-400 disabled:opacity-30"><Plus className="h-5 w-5"/></button>
    </div>
  </div>;
}
