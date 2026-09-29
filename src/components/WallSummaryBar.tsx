"use client";

import React from "react";
import { SmartDevice, WallSettings } from "@/types/smart-home";
import { Zap, Lightbulb, Thermometer, ShieldCheck, Power } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface WallSummaryBarProps {
  devices: SmartDevice[];
  settings: WallSettings;
  onMasterLightToggle: (turnOn: boolean) => void;
}

export function WallSummaryBar({ devices, settings, onMasterLightToggle }: WallSummaryBarProps) {
  const lights = devices.filter((d) => d.category === "light");
  const activeLights = lights.filter((d) => d.state?.isOn);
  const totalWatts = devices
    .filter((d) => d.category === "socket" && d.state?.isOn)
    .reduce((acc, curr) => acc + (curr.state?.powerWatts ?? 0), 0);

  const climateDevices = devices.filter((d) => d.category === "climate" && d.state?.isOn);
  const avgTemp =
    climateDevices.length > 0
      ? (
          climateDevices.reduce((acc, c) => acc + (c.state?.currentTemp ?? 22), 0) / climateDevices.length
        ).toFixed(1)
      : "22.5";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
      {/* Lights Widget */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl ${
              activeLights.length > 0 ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-500"
            }`}
          >
            <Lightbulb className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
              Lights Active
            </span>
            <span className="text-sm font-bold text-white font-mono">
              {activeLights.length} / {lights.length} On
            </span>
          </div>
        </div>

        {activeLights.length > 0 ? (
          <button
            onClick={() => {
              wallSound.playToggleOff();
              onMasterLightToggle(false);
            }}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold"
            title="Turn all lights off"
          >
            All Off
          </button>
        ) : (
          <button
            onClick={() => {
              wallSound.playToggleOn();
              onMasterLightToggle(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold"
            title="Turn all lights on"
          >
            Turn On
          </button>
        )}
      </div>

      {/* Climate Summary */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
          <Thermometer className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
            Avg Indoor Temp
          </span>
          <span className="text-sm font-bold text-white font-mono">
            {avgTemp}°{settings.tempUnit}
            <span className="text-[11px] text-slate-400 font-normal ml-1">
              ({climateDevices.length} AC active)
            </span>
          </span>
        </div>
      </div>

      {/* Live Power Load */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
            Live Power Load
          </span>
          <span className="text-sm font-bold text-emerald-400 font-mono">
            {totalWatts > 0 ? `${totalWatts.toFixed(1)} W` : "Idle (0 W)"}
          </span>
        </div>
      </div>

      {/* Security Status */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 flex items-center gap-2.5">
        <div
          className={`p-2 rounded-xl ${
            settings.securityMode === "disarmed"
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-amber-500/20 text-amber-400"
          }`}
        >
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">
            Perimeter Security
          </span>
          <span className="text-sm font-bold text-white capitalize font-mono">
            {settings.securityMode} • Protected
          </span>
        </div>
      </div>
    </div>
  );
}
