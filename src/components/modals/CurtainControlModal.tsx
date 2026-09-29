"use client";

import React, { useState } from "react";
import { SmartDevice } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import { X, ArrowUpToLine, ArrowDownToLine, Pause, Sliders } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface CurtainControlModalProps {
  device: SmartDevice;
  onClose: () => void;
  onUpdate: (deviceId: string, updates: Record<string, unknown>) => void;
}

export function CurtainControlModal({ device, onClose, onUpdate }: CurtainControlModalProps) {
  const state = device.state || {};
  const [position, setPosition] = useState<number>(state.curtainPosition ?? 80);
  const [curtainState, setCurtainState] = useState<"open" | "closed" | "paused">(state.curtainState ?? "open");

  const handleCommand = (action: "open" | "close" | "pause") => {
    wallSound.playTap();
    if (action === "open") {
      setPosition(100);
      setCurtainState("open");
      onUpdate(device.id, { curtainPosition: 100, curtainState: "open" });
    } else if (action === "close") {
      setPosition(0);
      setCurtainState("closed");
      onUpdate(device.id, { curtainPosition: 0, curtainState: "closed" });
    } else {
      setCurtainState("paused");
      onUpdate(device.id, { curtainState: "paused" });
    }
  };

  const handleSliderChange = (val: number) => {
    setPosition(val);
    const newState = val === 0 ? "closed" : val === 100 ? "open" : "paused";
    setCurtainState(newState);
    // Send position only. Including the derived state would transmit a stop
    // command that cancels the movement the slider just requested.
    onUpdate(device.id, { curtainPosition: val });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-lg rounded-3xl bg-slate-900/95 border border-slate-700/80 shadow-2xl overflow-hidden text-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400">
              <DeviceIcon name={device.icon} className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100">{device.name}</h3>
              <p className="text-xs text-slate-400">
                Position: {position}% • Status: {curtainState.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Visual Curtain Simulation */}
        <div className="p-6 flex flex-col items-center justify-center">
          <div className="w-72 h-44 rounded-2xl border-2 border-slate-700/80 bg-slate-950 p-3 relative overflow-hidden flex flex-col justify-between shadow-inner">
            {/* Top curtain rail */}
            <div className="h-3 w-full bg-slate-700 rounded-full flex items-center px-2">
              <div className="w-2 h-2 rounded-full bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
            </div>

            {/* Window background with sunny/cloud landscape */}
            <div className="absolute inset-x-3 top-6 bottom-3 rounded-xl bg-gradient-to-b from-sky-500/30 to-indigo-900/40 border border-slate-800 flex items-center justify-center overflow-hidden">
              <span className="text-4xl select-none opacity-40">☀️</span>
            </div>

            {/* Animated left and right curtain drapes */}
            <div className="absolute inset-x-3 top-6 bottom-3 flex pointer-events-none">
              {/* Left drape */}
              <div
                className="h-full bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 border-r-2 border-indigo-400 shadow-xl transition-all duration-300"
                style={{ width: `${(100 - position) / 2}%` }}
              />
              <div className="flex-1" />
              {/* Right drape */}
              <div
                className="h-full bg-gradient-to-l from-indigo-700 via-indigo-600 to-indigo-800 border-l-2 border-indigo-400 shadow-xl transition-all duration-300"
                style={{ width: `${(100 - position) / 2}%` }}
              />
            </div>

            <div className="relative z-10 self-center bg-slate-900/90 px-3 py-1 rounded-full border border-slate-700/80 text-xs font-mono font-bold text-white shadow-md">
              {position}% OPEN
            </div>
          </div>
        </div>

        {/* Quick 3 Wall Buttons */}
        <div className="px-6 grid grid-cols-3 gap-3">
          <button
            onClick={() => handleCommand("open")}
            className={`py-3.5 px-3 rounded-2xl font-semibold flex flex-col items-center gap-1.5 border transition-all ${
              position === 100
                ? "bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                : "bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <ArrowUpToLine className="w-5 h-5" />
            <span className="text-xs">OPEN (100%)</span>
          </button>
          <button
            onClick={() => handleCommand("pause")}
            className="py-3.5 px-3 rounded-2xl font-semibold flex flex-col items-center gap-1.5 bg-slate-800/90 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
          >
            <Pause className="w-5 h-5" />
            <span className="text-xs">PAUSE</span>
          </button>
          <button
            onClick={() => handleCommand("close")}
            className={`py-3.5 px-3 rounded-2xl font-semibold flex flex-col items-center gap-1.5 border transition-all ${
              position === 0
                ? "bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                : "bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <ArrowDownToLine className="w-5 h-5" />
            <span className="text-xs">CLOSE (0%)</span>
          </button>
        </div>

        {/* Position Slider */}
        <div className="p-6 space-y-2">
          <div className="flex justify-between text-xs text-slate-400 font-medium">
            <span>Closed 0%</span>
            <span>Position Slider</span>
            <span>Open 100%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={position}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
