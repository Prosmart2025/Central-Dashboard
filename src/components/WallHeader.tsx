"use client";

import React, { useState, useEffect } from "react";
import { WallSettings, SmartDevice } from "@/types/smart-home";
import {
  Sun,
  Cloud,
  Moon,
  Maximize2,
  Minimize2,
  Settings,
  Plus,
  History,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Wifi,
} from "lucide-react";
import { wallSound } from "@/lib/sound";

interface WallHeaderProps {
  settings: WallSettings;
  devices: SmartDevice[];
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenScreensaver: () => void;
  onOpenSecurityModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenAddDeviceModal: () => void;
  onOpenLogsModal: () => void;
}

export function WallHeader({
  settings,
  devices,
  isFullscreen,
  onToggleFullscreen,
  onOpenScreensaver,
  onOpenSecurityModal,
  onOpenSettingsModal,
  onOpenAddDeviceModal,
  onOpenLogsModal,
}: WallHeaderProps) {
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDateStr(now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const getSecurityIcon = () => {
    switch (settings.securityMode) {
      case "away":
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case "home":
        return <Shield className="w-4 h-4 text-cyan-400" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getSecurityText = () => {
    switch (settings.securityMode) {
      case "away":
        return "Armed (Away)";
      case "home":
        return "Armed (Home)";
      default:
        return "Disarmed";
    }
  };

  const onlineDevicesCount = devices.filter((d) => d.online).length;

  return (
    <header className="w-full bg-slate-900/95 border-b border-slate-800/90 px-4 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 select-none backdrop-blur-md">
      {/* Left: Home Brand & Live Time */}
      <div className="flex items-center gap-4">
        {/* Prosmart brand — existing header footprint, provider-neutral identity. */}
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/prosmart-logo.svg" alt="Prosmart" className="h-10 w-12 rounded-xl object-cover object-top" />
          <div>
            <h1 className="flex items-center gap-1.5 text-sm font-bold tracking-[0.12em] text-white">
              <span>PROSMART</span>
              <span className="rounded border border-cyan-800/60 bg-cyan-950 px-1.5 py-0.5 font-mono text-[9px] tracking-normal text-cyan-300">HUB</span>
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>Smart Living, Simplified</span>
              <span className="flex items-center gap-1">
                <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
                <span>{onlineDevicesCount} online</span>
              </span>
            </div>
          </div>
        </div>

        {/* Live Clock Display */}
        <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-slate-800">
          <span className="font-mono text-xl font-bold text-white tracking-tight">{timeStr}</span>
          <span className="text-xs text-slate-400">{dateStr}</span>
        </div>
      </div>

      {/* Center: Weather & Air Quality Badge */}
      <div className="hidden lg:flex items-center gap-4 bg-slate-950/70 border border-slate-800/80 px-4 py-1.5 rounded-2xl text-xs">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-white font-mono">
            {settings.outdoorTemp}°{settings.tempUnit}
          </span>
          <span className="text-slate-400">{settings.outdoorCondition}</span>
        </div>
        <div className="h-3 w-px bg-slate-800" />
        <div className="flex items-center gap-1 text-slate-400 font-mono">
          <span>Hum:</span>
          <span className="text-cyan-300 font-semibold">{settings.outdoorHumidity}%</span>
        </div>
        <div className="h-3 w-px bg-slate-800" />
        <div className="flex items-center gap-1 text-slate-400 font-mono">
          <span>AQI:</span>
          <span className="text-emerald-400 font-semibold">{settings.outdoorAqi}</span>
        </div>
      </div>

      {/* Right: Wall Tablet Actions */}
      <div className="flex items-center gap-2">
        {/* Security Status Badge */}
        <button
          onClick={() => {
            wallSound.playTap();
            onOpenSecurityModal();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors"
          title="Security System Panel"
        >
          {getSecurityIcon()}
          <span className="hidden sm:inline">{getSecurityText()}</span>
        </button>

        {/* Add Device Button */}
        <button
          onClick={() => {
            wallSound.playTap();
            onOpenAddDeviceModal();
          }}
          className="p-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors"
          title="Add Tuya Device"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Activity Logs Button */}
        <button
          onClick={() => {
            wallSound.playTap();
            onOpenLogsModal();
          }}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Activity Log History"
        >
          <History className="w-4 h-4" />
        </button>

        {/* Screensaver / Ambient Standby Button */}
        <button
          onClick={() => {
            wallSound.playTap();
            onOpenScreensaver();
          }}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Standby Wall Clock Screensaver"
        >
          <Moon className="w-4 h-4" />
        </button>

        {/* Fullscreen Kiosk Mode */}
        <button
          onClick={() => {
            wallSound.playTap();
            onToggleFullscreen();
          }}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title={isFullscreen ? "Exit Kiosk Fullscreen" : "Enter Tablet Kiosk Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Wall Settings */}
        <button
          onClick={() => {
            wallSound.playTap();
            onOpenSettingsModal();
          }}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Panel Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
