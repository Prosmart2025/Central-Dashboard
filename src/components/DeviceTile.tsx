"use client";

import React from "react";
import {CardOptions} from "./CardOptions";
import {cardHeightClass} from "@/lib/card-preferences";
import { isCloudDevice, powerFunctions } from "@/lib/device-capabilities";
import { SmartDevice, WallSettings } from "@/types/smart-home";
import { DeviceIcon } from "./DeviceIcon";
import {
  Power,
  ChevronRight,
  Battery,
  Zap,
  Snowflake,
  Flame,
  Plus,
  Minus,
  Lock,
  Unlock,
  Play,
  RotateCcw,
  Video,
} from "lucide-react";
import { wallSound } from "@/lib/sound";

interface DeviceTileProps {
  onCardChanged?:(device:SmartDevice)=>void;
  onCardRemoved?:(id:string)=>void;
  roomName?: string;
  pending?: boolean;
  device: SmartDevice;
  settings: WallSettings;
  onTogglePower: (device: SmartDevice) => void;
  onOpenModal: (device: SmartDevice) => void;
  onQuickUpdate?: (deviceId: string, updates: Record<string, unknown>) => void;
}

export function DeviceTile({
  onCardChanged,
  onCardRemoved,
  roomName,
  pending = false,
  device,
  settings,
  onTogglePower,
  onOpenModal,
  onQuickUpdate,
}: DeviceTileProps) {
  const state = device.state || {};
  const isOn = state.isOn ?? false;
  const remote = isCloudDevice(device);
  const ir = device.integration?.infrared;
  const tempUnit = settings.tempUnit || "C";

  // Multi-gang switches expose one toggle per channel. Without this a 3-gang
  // wall switch renders as a single control and two thirds of it is unusable.
  const renderChannels = () => {
    const channels = state.channels;
    if (!channels || channels.length < 2) return null;

    return (
      <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">{channels.length} channels</span>
          <span className="text-slate-500">{channels.filter((c) => c.isOn).length} on</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {channels.map((ch) => (
            <button
              key={ch.code}
              type="button"
              disabled={pending || !device.online}
              onClick={() => {
                wallSound.playTap();
                onQuickUpdate?.(device.id, { channelCode: ch.code, channelValue: !ch.isOn });
              }}
              className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-3 text-[11px] font-semibold transition-all ${
                ch.isOn
                  ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
                  : "border-slate-700 bg-slate-800/70 text-slate-400 hover:text-white"
              }`}
              title={`${ch.label} (${ch.code})`}
            >
              <span className="truncate">{ch.label}</span>
              <Power className="h-3 w-3 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Category specific styles & indicators
  const renderCategoryContent = () => {
    if (state.readOnly) {
      return (
        <div className="mt-2 rounded-xl border border-slate-700/70 bg-slate-950/60 p-2.5">
          <p className="text-[11px] leading-relaxed text-slate-400">{state.readOnlyReason}</p>
        </div>
      );
    }

    const channelBlock = renderChannels();
    if (channelBlock) return channelBlock;

    switch (device.category) {
      case "light": {
        const brightness = state.brightness ?? 80;
        const colorRgb = state.colorRgb || "#FFD59E";
        return (
          <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Brightness</span>
              <span className="font-mono font-semibold text-white">{isOn ? `${brightness}%` : "0%"}</span>
            </div>
            {/* Brightness bar */}
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: isOn ? `${brightness}%` : "0%",
                  backgroundColor: isOn ? colorRgb : "#475569",
                  boxShadow: isOn ? `0 0 10px ${colorRgb}` : "none",
                }}
              />
            </div>
          </div>
        );
      }

      case "climate": {
        const targetTemp = state.targetTemp ?? 22.0;
        const currentTemp = state.currentTemp;
        const mode = state.mode ?? "cool";

        return (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-white">
                  {isOn ? targetTemp.toFixed(1) : "--"}
                </span>
                <span className="text-xs text-slate-400">°{tempUnit}</span>
              </div>
              <span className="text-xs text-slate-400 font-medium">{currentTemp === undefined ? "Room temp not reported" : `Room ${currentTemp}°${tempUnit}`}</span>
            </div>

            {/* Quick +/- temperature buttons directly on tile */}
            <div className="flex items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  wallSound.playTap();
                  if (onQuickUpdate) {
                    const next = Math.max(16, targetTemp - 0.5);
                    onQuickUpdate(device.id, { targetTemp: next });
                  }
                }}
                className="flex-1 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors border border-slate-700/60"
                title="Decrease Temp"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 py-0.5 rounded-md bg-slate-950/80 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
                {mode}
              </span>
              <button
                type="button"
                onClick={() => {
                  wallSound.playTap();
                  if (onQuickUpdate) {
                    const next = Math.min(30, targetTemp + 0.5);
                    onQuickUpdate(device.id, { targetTemp: next });
                  }
                }}
                className="flex-1 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors border border-slate-700/60"
                title="Increase Temp"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      case "curtain": {
        const pos = state.curtainPosition;
        return (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Shade Position</span>
              <span className="font-mono font-semibold text-indigo-300">{pos === undefined ? "Not reported" : `${pos}%`}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                style={{ width: `${pos ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 pt-0.5">
              <span>{pos === undefined ? "Position unavailable" : pos === 0 ? "Closed" : pos === 100 ? "Fully Open" : `${pos}% Open`}</span>
              <span className="capitalize">{state.curtainState || "Idle"}</span>
            </div>
          </div>
        );
      }

      case "socket": {
        const watts = state.powerWatts ?? 0;
        const kwh = state.energyKwh ?? 0;
        return (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Current Load</span>
              <span className="font-mono font-bold text-emerald-400">
                {isOn ? `${watts.toFixed(1)} W` : "0.0 W"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Today Energy</span>
              <span className="font-mono">{kwh.toFixed(2)} kWh</span>
            </div>
          </div>
        );
      }

      case "lock": {
        const isLocked = state.isLocked ?? true;
        const battery = state.battery ?? 92;
        return (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span
                className={`font-semibold px-2 py-0.5 rounded-md ${
                  isLocked ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {isLocked ? "SECURED" : "UNLOCKED"}
              </span>
              <span className="text-slate-400 flex items-center gap-1 font-mono text-[11px]">
                <Battery className="w-3 h-3 text-emerald-400" />
                {battery}%
              </span>
            </div>
          </div>
        );
      }

      case "camera": {
        return (
          <div className="mt-2 space-y-1.5">
            <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
              <div className="absolute top-1.5 left-2 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                LIVE
              </div>
              <Video className="w-6 h-6 text-slate-600 group-hover:text-cyan-400 transition-colors" />
              <div className="absolute inset-0 bg-cyan-500/5 group-hover:bg-cyan-500/10 transition-colors" />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>2K Feed Ready</span>
              <span>Tap to View</span>
            </div>
          </div>
        );
      }

      case "vacuum": {
        const status = state.vacuumStatus ?? "docked";
        const battery = state.battery ?? 100;
        return (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Status</span>
              <span className="font-semibold text-cyan-300 capitalize">{status}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Battery</span>
              <span className="font-mono text-emerald-400">{battery}%</span>
            </div>
          </div>
        );
      }

      case "fan": {
        const pm25 = state.pm25 ?? 12;
        const co2 = state.co2 ?? 440;
        return (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">PM2.5 Index</span>
              <span className="font-mono font-bold text-emerald-400">{pm25} µg/m³</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>CO2</span>
              <span className="font-mono text-slate-300">{co2} ppm</span>
            </div>
          </div>
        );
      }

      case "sensor": {
        const battery = state.battery ?? 95;
        const motion = state.motionDetected ?? false;
        return (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Sensor Status</span>
              <span className={`font-semibold ${motion ? "text-rose-400" : "text-emerald-400"}`}>
                {motion ? "Motion Detected" : "Clear / Normal"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Battery</span>
              <span className="font-mono">{battery}%</span>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Determine Icon Glowing Color
  const getIconContainerStyle = () => {
    if (device.category === "lock") {
      const isLocked = state.isLocked ?? true;
      return isLocked
        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
        : "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.25)]";
    }

    if (device.category === "climate") {
      return isOn
        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
        : "bg-slate-800 text-slate-500 border border-slate-700/60";
    }

    if (device.category === "curtain") {
      const pos = state.curtainPosition ?? 80;
      return pos > 0
        ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
        : "bg-slate-800 text-slate-500 border border-slate-700/60";
    }

    if (device.category === "light") {
      const colorRgb = state.colorRgb || "#FFD59E";
      return isOn
        ? "border border-amber-400/40 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.35)]"
        : "bg-slate-800 text-slate-500 border border-slate-700/60";
    }

    if (device.category === "socket") {
      return isOn
        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
        : "bg-slate-800 text-slate-500 border border-slate-700/60";
    }

    if (device.category === "camera") {
      return "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.25)]";
    }

    return isOn
      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.25)]"
      : "bg-slate-800 text-slate-500 border border-slate-700/60";
  };

  const hasPowerSwitch =
    !state.readOnly && (!remote || (!ir && powerFunctions(device.integration?.functions || []).length > 0)) &&
    (device.category === "light" ||
      device.category === "climate" ||
      device.category === "socket" ||
      device.category === "fan" ||
      device.category === "vacuum");

  return (
    <div
      onClick={() => onOpenModal(device)}
      className={`group relative min-w-0 rounded-3xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800/90 hover:border-slate-700 p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-2xl active:scale-[0.99] select-none backdrop-blur-md ${cardHeightClass(device.integration?.cardSize)}`}
    >
      {onCardChanged && onCardRemoved && <CardOptions device={device} onChanged={onCardChanged} onRemoved={onCardRemoved} disabled={pending}/>}
      {/* Top row: Wall icon & Power button */}
      <div className="flex items-start justify-between">
        <div
          className={`p-3 rounded-2xl transition-all duration-300 ${getIconContainerStyle()}`}
          style={{
            backgroundColor:
              device.category === "light" && isOn ? `${state.colorRgb || "#FFA726"}25` : undefined,
            color: device.category === "light" && isOn ? (state.colorRgb || "#FFA726") : undefined,
          }}
        >
          <DeviceIcon name={device.icon} className="w-6 h-6" />
        </div>

        {/* Quick Power Switch for Wall Panel */}
        {hasPowerSwitch && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePower(device);
            }}
            className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${
              isOn
                ? "bg-amber-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(245,158,11,0.5)] active:scale-95"
                : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700/60 active:scale-95"
            }`}
            disabled={pending || !device.online}
            title={pending ? "Waiting for Tuya" : isOn ? "Request off" : "Request on"}
          >
            <Power className="w-4 h-4" />
          </button>
        )}

        {device.category === "lock" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal(device);
            }}
            className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${
              state.isLocked
                ? "bg-emerald-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(16,185,129,0.5)]"
                : "bg-amber-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(245,158,11,0.5)]"
            }`}
          >
            {state.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Middle row: Device Name & Room Badge */}
      <div className="mt-3">
        <h4 className="font-semibold text-sm text-slate-100 group-hover:text-white line-clamp-1 transition-colors">
          {device.name}
        </h4>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${device.online ? "bg-emerald-400" : "bg-slate-500"}`} />
          <span className="text-[11px] text-slate-400 capitalize">{roomName || device.integration?.homeName || "Unassigned"}</span>
          <span className="text-[10px] text-slate-500">• {device.protocol}</span>
        </div>
      </div>

      {/* Bottom Category Specific Interactive Display */}
      {renderCategoryContent()}
      {device.integration?.accountPresent===false && <p className="mt-2 text-[10px] text-amber-300">Not in the latest Tuya catalog · use Remove card</p>}
      {ir && <p className="mt-2 text-[10px] text-cyan-300">IR remote · tap for appliance controls</p>}
      {pending && <p role="status" className="mt-2 text-[11px] text-cyan-300">Waiting for Tuya…</p>}
      {!pending && device.integration?.command && <p className={`mt-2 line-clamp-2 text-[10px] leading-relaxed ${device.integration.command.status === "failed" ? "text-rose-300" : "text-slate-400"}`} title={device.integration.command.message}>{device.integration.command.status === "failed" ? "Not applied · " : device.integration.command.status !== "confirmed" ? "Not confirmed · " : ""}{device.integration.command.message}</p>}
    </div>
  );
}
