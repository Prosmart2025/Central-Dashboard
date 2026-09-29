"use client";

import React, { useState } from "react";
import { SmartDevice } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import { X, Power, Plus, Minus, Snowflake, Flame, Droplets, Wind, RotateCcw } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface ClimateControlModalProps {
  device: SmartDevice;
  tempUnit?: "C" | "F";
  onClose: () => void;
  onUpdate: (deviceId: string, updates: Record<string, unknown>) => void;
}

export function ClimateControlModal({
  device,
  tempUnit = "C",
  onClose,
  onUpdate,
}: ClimateControlModalProps) {
  const state = device.state || {};
  const [isOn, setIsOn] = useState(state.isOn ?? true);
  const [targetTemp, setTargetTemp] = useState(state.targetTemp ?? 22.0);
  const [mode, setMode] = useState<"cool" | "heat" | "auto" | "dry" | "fan">(state.mode ?? "cool");
  const [fanSpeed, setFanSpeed] = useState<"auto" | "low" | "mid" | "high">(state.fanSpeed ?? "mid");

  const currentTemp = state.currentTemp ?? 23.4;
  const humidity = state.humidity ?? 48;

  const handleToggle = () => {
    const next = !isOn;
    setIsOn(next);
    if (next) wallSound.playToggleOn();
    else wallSound.playToggleOff();
    onUpdate(device.id, { isOn: next });
  };

  const adjustTemp = (delta: number) => {
    wallSound.playTap();
    const next = Math.max(16, Math.min(30, Math.round((targetTemp + delta) * 10) / 10));
    setTargetTemp(next);
    if (!isOn) setIsOn(true);
    onUpdate(device.id, { targetTemp: next, isOn: true });
  };

  const handleModeChange = (newMode: typeof mode) => {
    wallSound.playTap();
    setMode(newMode);
    if (!isOn) setIsOn(true);
    onUpdate(device.id, { mode: newMode, isOn: true });
  };

  const handleFanSpeedChange = (speed: typeof fanSpeed) => {
    wallSound.playTap();
    setFanSpeed(speed);
    onUpdate(device.id, { fanSpeed: speed });
  };

  const getModeColor = () => {
    if (!isOn) return "text-slate-400 border-slate-800";
    switch (mode) {
      case "cool":
        return "text-cyan-400 border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.25)]";
      case "heat":
        return "text-amber-400 border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.25)]";
      case "dry":
        return "text-blue-400 border-blue-500/50 shadow-[0_0_25px_rgba(59,130,246,0.25)]";
      case "fan":
        return "text-teal-400 border-teal-500/50 shadow-[0_0_25px_rgba(20,184,166,0.25)]";
      default:
        return "text-emerald-400 border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.25)]";
    }
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
            <div className={`p-3 rounded-2xl ${isOn ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-800 text-slate-400"}`}>
              <DeviceIcon name={device.icon} className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100">{device.name}</h3>
              <p className="text-xs text-slate-400">
                Room: {currentTemp}°{tempUnit} • Humidity: {humidity}%
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={`p-3 rounded-2xl font-medium transition-all flex items-center gap-2 text-sm ${
                isOn
                  ? "bg-cyan-500 text-slate-950 font-semibold shadow-[0_0_16px_rgba(6,182,212,0.4)]"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Power className="w-5 h-5" />
              <span>{isOn ? "ON" : "OFF"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Circular Dial Display */}
        <div className="flex flex-col items-center justify-center py-8 px-6">
          <div
            className={`w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center relative transition-all duration-300 bg-slate-950/60 ${getModeColor()}`}
          >
            <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Target</span>
            <div className="flex items-baseline my-1">
              <span className="text-5xl font-extrabold tracking-tight text-white font-mono">
                {isOn ? targetTemp.toFixed(1) : "--"}
              </span>
              <span className="text-xl text-slate-400 ml-1">°{tempUnit}</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {isOn ? `Current ${currentTemp}°${tempUnit}` : "Standby"}
            </span>
          </div>

          {/* Stepper Buttons */}
          <div className="flex items-center gap-6 mt-6">
            <button
              onClick={() => adjustTemp(-0.5)}
              className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-white active:scale-95 transition-all shadow-md"
              title="Decrease temperature"
            >
              <Minus className="w-6 h-6" />
            </button>
            <div className="text-center px-4">
              <span className="text-xs uppercase tracking-wider text-slate-400">Step ±0.5°</span>
            </div>
            <button
              onClick={() => adjustTemp(0.5)}
              className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-white active:scale-95 transition-all shadow-md"
              title="Increase temperature"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modes Selector */}
        <div className="p-6 pt-0 space-y-5">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Operating Mode</label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: "cool", label: "Cool", icon: Snowflake, activeClass: "bg-cyan-500/20 border-cyan-500 text-cyan-300" },
                { id: "heat", label: "Heat", icon: Flame, activeClass: "bg-amber-500/20 border-amber-500 text-amber-300" },
                { id: "dry", label: "Dry", icon: Droplets, activeClass: "bg-blue-500/20 border-blue-500 text-blue-300" },
                { id: "fan", label: "Fan", icon: Wind, activeClass: "bg-teal-500/20 border-teal-500 text-teal-300" },
                { id: "auto", label: "Auto", icon: RotateCcw, activeClass: "bg-emerald-500/20 border-emerald-500 text-emerald-300" },
              ].map((m) => {
                const Icon = m.icon;
                const active = mode === m.id && isOn;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModeChange(m.id as typeof mode)}
                    className={`py-2.5 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all ${
                      active
                        ? m.activeClass + " shadow-md"
                        : "bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fan Speed */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Fan Speed</label>
            <div className="grid grid-cols-4 gap-2">
              {(["auto", "low", "mid", "high"] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => handleFanSpeedChange(spd)}
                  className={`py-2 rounded-xl text-xs font-semibold uppercase border transition-all ${
                    fanSpeed === spd
                      ? "bg-slate-800 border-cyan-400 text-cyan-300 shadow-sm"
                      : "bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-white"
                  }`}
                >
                  {spd}
                </button>
              ))}
            </div>
          </div>
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
