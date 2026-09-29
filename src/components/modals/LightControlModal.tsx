"use client";

import React, { useState } from "react";
import { SmartDevice } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import { X, Power, Sun, Palette, Sparkles, Moon, BookOpen, Coffee, Flame } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface LightControlModalProps {
  device: SmartDevice;
  onClose: () => void;
  onUpdate: (deviceId: string, updates: Record<string, unknown>) => void;
}

const COLOR_PRESETS = [
  { name: "Warm Amber", hex: "#FFA726", temp: 2700 },
  { name: "Sunset Gold", hex: "#FFB74D", temp: 3000 },
  { name: "Soft White", hex: "#FFF3E0", temp: 4000 },
  { name: "Cool Daylight", hex: "#E1F5FE", temp: 5500 },
  { name: "Cyber Cyan", hex: "#00E5FF", temp: 6500 },
  { name: "Neon Violet", hex: "#A855F7", temp: 5000 },
  { name: "Deep Rose", hex: "#F43F5E", temp: 3500 },
  { name: "Emerald Green", hex: "#10B981", temp: 4500 },
];

const LIGHT_SCENES = [
  { name: "Reading", icon: BookOpen, brightness: 75, colorTemp: 4000, hex: "#FFE082" },
  { name: "Night", icon: Moon, brightness: 20, colorTemp: 2700, hex: "#FF8A65" },
  { name: "Leisure", icon: Coffee, brightness: 50, colorTemp: 3200, hex: "#FFCC80" },
  { name: "Party", icon: Flame, brightness: 90, colorTemp: 6000, hex: "#EC4899" },
];

export function LightControlModal({ device, onClose, onUpdate }: LightControlModalProps) {
  const state = device.state || {};
  const [isOn, setIsOn] = useState(state.isOn ?? true);
  const [brightness, setBrightness] = useState(state.brightness ?? 80);
  const [colorTemp, setColorTemp] = useState(state.colorTemp ?? 4000);
  const [colorRgb, setColorRgb] = useState(state.colorRgb ?? "#FFDE8A");
  const [activeTab, setActiveTab] = useState<"dimmer" | "color" | "scenes">("dimmer");

  const handleToggle = () => {
    const nextState = !isOn;
    setIsOn(nextState);
    if (nextState) wallSound.playToggleOn();
    else wallSound.playToggleOff();
    onUpdate(device.id, { isOn: nextState });
  };

  const handleBrightnessChange = (val: number) => {
    setBrightness(val);
    if (!isOn && val > 0) setIsOn(true);
    onUpdate(device.id, { brightness: val, isOn: true });
  };

  const handleColorPreset = (preset: typeof COLOR_PRESETS[0]) => {
    wallSound.playTap();
    setColorRgb(preset.hex);
    setColorTemp(preset.temp);
    onUpdate(device.id, { colorRgb: preset.hex, colorTemp: preset.temp, isOn: true });
  };

  const handleSceneApply = (scene: typeof LIGHT_SCENES[0]) => {
    wallSound.playTap();
    setBrightness(scene.brightness);
    setColorTemp(scene.colorTemp);
    setColorRgb(scene.hex);
    onUpdate(device.id, {
      brightness: scene.brightness,
      colorTemp: scene.colorTemp,
      colorRgb: scene.hex,
      presetScene: scene.name,
      isOn: true,
    });
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
            <div
              className={`p-3 rounded-2xl transition-all duration-300 ${
                isOn ? "bg-amber-500/20 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "bg-slate-800 text-slate-400"
              }`}
            >
              <DeviceIcon name={device.icon} className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100">{device.name}</h3>
              <p className="text-xs text-slate-400">
                {isOn ? `Active • ${brightness}% brightness` : "Turned Off"} • {device.protocol}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={`p-3 rounded-2xl font-medium transition-all flex items-center gap-2 text-sm ${
                isOn
                  ? "bg-amber-500 text-slate-950 font-semibold shadow-[0_0_16px_rgba(245,158,11,0.4)]"
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

        {/* Tab Selector */}
        <div className="flex gap-2 p-4 bg-slate-950/40 border-b border-slate-800/80">
          <button
            onClick={() => setActiveTab("dimmer")}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "dimmer"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>Dimmer</span>
          </button>
          <button
            onClick={() => setActiveTab("color")}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "color"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Color & CCT</span>
          </button>
          <button
            onClick={() => setActiveTab("scenes")}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "scenes"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Scenes</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 space-y-6">
          {activeTab === "dimmer" && (
            <div className="space-y-6">
              {/* Visual Brightness Indicator */}
              <div className="relative flex flex-col items-center justify-center py-6">
                <div
                  className="w-32 h-32 rounded-full border-4 border-slate-700 flex flex-col items-center justify-center transition-all duration-300"
                  style={{
                    boxShadow: isOn
                      ? `0 0 ${brightness * 0.6}px ${colorRgb}66, inset 0 0 ${brightness * 0.4}px ${colorRgb}33`
                      : "none",
                    borderColor: isOn ? colorRgb : "#334155",
                  }}
                >
                  <span className="text-3xl font-bold tracking-tight text-white">{isOn ? brightness : 0}%</span>
                  <span className="text-xs uppercase tracking-wider text-slate-400 mt-0.5">Brightness</span>
                </div>
              </div>

              {/* Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400 font-medium px-1">
                  <span>1% Min</span>
                  <span>Brightness Slider</span>
                  <span>100% Max</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={brightness}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* Quick Dimmer Presets */}
              <div className="grid grid-cols-4 gap-2.5">
                {[25, 50, 75, 100].map((step) => (
                  <button
                    key={step}
                    onClick={() => handleBrightnessChange(step)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      brightness === step && isOn
                        ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                        : "bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {step}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "color" && (
            <div className="space-y-6">
              {/* Color Temperature Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400 font-medium">
                  <span className="text-amber-400">Warm 2700K</span>
                  <span>White Balance (CCT)</span>
                  <span className="text-cyan-300">Cool 6500K</span>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min="2700"
                    max="6500"
                    step="100"
                    value={colorTemp}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setColorTemp(val);
                      onUpdate(device.id, { colorTemp: val, isOn: true });
                    }}
                    className="w-full h-3 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: "linear-gradient(to right, #FFA726, #FFF8E1, #E0F2FE, #90CAF9)",
                    }}
                  />
                </div>
                <p className="text-center text-xs font-mono text-slate-300">{colorTemp} K</p>
              </div>

              {/* Color Palette Presets */}
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Tuya Color Swatches</p>
                <div className="grid grid-cols-4 gap-3">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => handleColorPreset(p)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all ${
                        colorRgb === p.hex
                          ? "border-white bg-slate-800 shadow-md scale-105"
                          : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full shadow-inner"
                        style={{ backgroundColor: p.hex }}
                      />
                      <span className="text-[10px] text-slate-300 font-medium truncate w-full text-center">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "scenes" && (
            <div className="grid grid-cols-2 gap-3">
              {LIGHT_SCENES.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.name}
                    onClick={() => handleSceneApply(s)}
                    className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/70 hover:border-amber-500/50 hover:bg-slate-800 text-left transition-all flex items-center gap-3.5 group"
                  >
                    <div
                      className="p-3 rounded-xl transition-all"
                      style={{ backgroundColor: `${s.hex}25`, color: s.hex }}
                    >
                      <Icon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{s.name}</h4>
                      <p className="text-xs text-slate-400">{s.brightness}% • {s.colorTemp}K</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
