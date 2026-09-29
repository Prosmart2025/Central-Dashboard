"use client";

import React, { useState, useEffect } from "react";
import { WallSettings, SmartDevice } from "@/types/smart-home";
import { Sun, Cloud, Moon, ShieldCheck, Thermometer, Wind, Droplets } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface ScreenSaverProps {
  settings: WallSettings;
  devices: SmartDevice[];
  onWake: () => void;
}

export function ScreenSaver({ settings, devices, onWake }: ScreenSaverProps) {
  const [timeStr, setTimeStr] = useState("");
  const [secStr, setSecStr] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      setTimeStr(`${hours}:${minutes}`);
      setSecStr(seconds);

      setDateStr(
        now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleWake = () => {
    wallSound.playTap();
    onWake();
  };

  const activeLights = devices.filter((d) => d.category === "light" && d.state.isOn).length;
  const activeClimate = devices.find((d) => d.category === "climate" && d.state.isOn);

  return (
    <div
      onClick={handleWake}
      className="fixed inset-0 z-50 bg-black cursor-pointer flex flex-col items-center justify-between p-8 select-none overflow-hidden animate-fadeIn"
    >
      {/* Subtle ambient background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-900/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-900/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar: Weather & Location */}
      <div className="relative z-10 w-full max-w-4xl flex items-center justify-between text-slate-400 text-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <Sun className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-white font-medium flex items-center gap-2">
              <span>{settings.outdoorCity}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-mono">
                AQI {settings.outdoorAqi}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              {settings.outdoorCondition} • {settings.outdoorTemp}°{settings.tempUnit}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1 text-slate-300">
            <Droplets className="w-3.5 h-3.5 text-cyan-400" />
            <span>{settings.outdoorHumidity}% Hum</span>
          </span>
          <span className="flex items-center gap-1 text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="capitalize">{settings.securityMode}</span>
          </span>
        </div>
      </div>

      {/* Center: Oversized Digital Wall Clock */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto">
        <div className="flex items-baseline">
          <span className="text-[clamp(5rem,15vw,10rem)] font-extralight tracking-tight text-white leading-none font-mono">
            {timeStr}
          </span>
          <span className="text-[clamp(1.5rem,4vw,3rem)] font-light text-cyan-400 ml-3 font-mono opacity-80">
            {secStr}
          </span>
        </div>
        <p className="text-lg md:text-2xl font-light text-slate-300 mt-3 tracking-wide">
          {dateStr}
        </p>

        {/* Ambient Home Summary Badge */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <div className="px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${activeLights > 0 ? "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "bg-slate-600"}`} />
            <span>{activeLights > 0 ? `${activeLights} Lights On` : "All Lights Off"}</span>
          </div>

          {activeClimate && (
            <div className="px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              <span>AC: {activeClimate.state.targetTemp}°{settings.tempUnit}</span>
            </div>
          )}

          <div className="px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span>Panel T6E Online</span>
          </div>
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="relative z-10 text-center">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500 animate-pulse">
          Tap screen anywhere to wake
        </p>
      </div>
    </div>
  );
}
