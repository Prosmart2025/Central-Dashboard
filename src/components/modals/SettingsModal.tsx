"use client";

import React, { useState } from "react";
import {HiddenCardsSettings} from "../HiddenCardsSettings";
import {ProviderIntegrations} from "../ProviderIntegrations";
import { SmartLifeConnection } from "../SmartLifeConnection";
import { WallSettings } from "@/types/smart-home";
import {
  X,
  Sliders,
  Volume2,
  VolumeX,
  Palette,
  Clock,
  Shield,
  Cloud,
  RotateCcw,
  Check,
  Radio,
  MonitorSmartphone,
} from "lucide-react";
import { wallSound } from "@/lib/sound";

interface SettingsModalProps {
  initialTab?: "panel" | "tuya" | "system";
  settings: WallSettings;
  onClose: () => void;
  onUpdateSettings: (updates: Partial<WallSettings>) => void;
  onResetData: () => void;
}

export function SettingsModal({
  initialTab = "panel",
  settings,
  onClose,
  onUpdateSettings,
  onResetData,
}: SettingsModalProps) {
  const [panelName, setPanelName] = useState(settings.panelName);
  const [theme, setTheme] = useState(settings.theme);
  const [tempUnit, setTempUnit] = useState(settings.tempUnit);
  const [screensaverTimeout, setScreensaverTimeout] = useState(settings.screenSaverTimeout);
  const [soundFeedback, setSoundFeedback] = useState(settings.soundFeedback);
  const [kioskScale, setKioskScale] = useState(settings.kioskScale);
  const [lockPin, setLockPin] = useState(settings.lockPin);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<"panel" | "tuya" | "system">(initialTab);

  const handleSave = () => {
    wallSound.playTap();
    wallSound.enabled = soundFeedback;
    onUpdateSettings({
      panelName,
      theme,
      tempUnit,
      screenSaverTimeout: screensaverTimeout,
      soundFeedback,
      kioskScale,
      lockPin,
    });
    onClose();
  };

  const handleTestTuyaConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    wallSound.playTap();
    try {
      const response = await fetch("/api/tuya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const result = await response.json();
      setTestResult(
        result.success
          ? `${result.message} Access token: ${result.data?.tokenPreview || "issued"}.`
          : result.error || "Tuya Cloud connection failed."
      );
    } catch {
      setTestResult("Unable to reach the dashboard server. Please try again.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100">Tablet Wall Panel Settings</h3>
              <p className="text-xs text-slate-400">Configure kiosk display, screen standby & Tuya Cloud</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 gap-3 bg-slate-950/40">
          <button
            onClick={() => setActiveTab("panel")}
            className={`py-3.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "panel" ? "border-cyan-400 text-cyan-400" : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <MonitorSmartphone className="w-4 h-4" />
            <span>Wall Display</span>
          </button>
          <button
            onClick={() => setActiveTab("tuya")}
            className={`py-3.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "tuya" ? "border-cyan-400 text-cyan-400" : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Integrations</span>
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`py-3.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "system" ? "border-cyan-400 text-cyan-400" : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Security & Reset</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {activeTab === "panel" && (
            <>
              {/* Panel Name */}
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Panel Title</label>
                <input
                  type="text"
                  value={panelName}
                  onChange={(e) => setPanelName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Theme Picker */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Wall Screen Theme</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: "midnight", label: "Midnight OLED", desc: "Deep black, battery saver", color: "bg-slate-950 border-cyan-500" },
                    { id: "titanium", label: "Titanium Slate", desc: "Subtle brushed metal glass", color: "bg-slate-800 border-slate-600" },
                    { id: "neon", label: "Cyberpunk Neon", desc: "Electric cyan & purple glow", color: "bg-indigo-950 border-purple-500" },
                    { id: "light", label: "Clean Daylight", desc: "Bright high-contrast kiosk", color: "bg-slate-100 text-slate-900 border-slate-300" },
                  ].map((thm) => (
                    <button
                      key={thm.id}
                      type="button"
                      onClick={() => setTheme(thm.id as WallSettings["theme"])}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        theme === thm.id
                          ? "ring-2 ring-cyan-400 border-cyan-400 shadow-md"
                          : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm text-white">{thm.label}</span>
                        {theme === thm.id && <Check className="w-4 h-4 text-cyan-400" />}
                      </div>
                      <span className="text-[11px] text-slate-400">{thm.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Screensaver Standby Timeout */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Idle Screensaver / Clock Standby
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { sec: 0, label: "Off" },
                    { sec: 30, label: "30s" },
                    { sec: 60, label: "1 min" },
                    { sec: 120, label: "2 min" },
                    { sec: 300, label: "5 min" },
                  ].map((to) => (
                    <button
                      key={to.sec}
                      type="button"
                      onClick={() => setScreensaverTimeout(to.sec)}
                      className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                        screensaverTimeout === to.sec
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                          : "bg-slate-800/80 border-slate-700/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      {to.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound Feedback Toggle & Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <h5 className="font-semibold text-xs text-white">Audio Click Feedback</h5>
                    <p className="text-[11px] text-slate-400">Tactile sound on button taps</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !soundFeedback;
                      setSoundFeedback(next);
                      wallSound.enabled = next;
                      if (next) wallSound.playTap();
                    }}
                    className={`p-2 rounded-xl transition-all ${
                      soundFeedback ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {soundFeedback ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <h5 className="font-semibold text-xs text-white">Temperature Unit</h5>
                    <p className="text-[11px] text-slate-400">Celsius or Fahrenheit</p>
                  </div>
                  <div className="flex bg-slate-800 rounded-xl p-0.5 border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setTempUnit("C")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        tempUnit === "C" ? "bg-cyan-500 text-slate-950" : "text-slate-400"
                      }`}
                    >
                      °C
                    </button>
                    <button
                      type="button"
                      onClick={() => setTempUnit("F")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        tempUnit === "F" ? "bg-cyan-500 text-slate-950" : "text-slate-400"
                      }`}
                    >
                      °F
                    </button>
                  </div>
                </div>
              </div>

              {/* Tablet Scale Zoom */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400 font-semibold">
                  <span>Tablet Screen Scale</span>
                  <span className="font-mono text-cyan-300">{kioskScale}%</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[80, 90, 100, 110].map((scl) => (
                    <button
                      key={scl}
                      type="button"
                      onClick={() => setKioskScale(scl)}
                      className={`py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        kioskScale === scl
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                          : "bg-slate-800/80 border-slate-700/60 text-slate-400"
                      }`}
                    >
                      {scl}%
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "tuya" && (
            <div className="space-y-4">
              <SmartLifeConnection />
              <ProviderIntegrations />

              <details className="rounded-2xl border border-slate-800 bg-slate-950/60">
                <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-400 hover:text-white">
                  Advanced fallback: Tuya IoT Developer API (quota-limited)
                </summary>
                <div className="space-y-3 border-t border-slate-800 p-4">
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Server-side Access ID/Secret connection. Kept as a fallback and for dedicated IR commands. Error 60001001 is Tuya's control-pool quota rejection; a reset time is not supplied.
                  </p>
                  <button
                    type="button"
                    onClick={handleTestTuyaConnection}
                    disabled={isTesting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-slate-700"
                  >
                    <Radio className={`h-4 w-4 ${isTesting ? "animate-spin" : ""}`} />
                    <span>{isTesting ? "Testing…" : "Test Developer API"}</span>
                  </button>
                  {testResult && <p className="text-xs text-slate-300">{testResult}</p>}
                </div>
              </details>
            </div>
          )}

          {activeTab === "system" && (
            <div className="space-y-4">
              <HiddenCardsSettings/>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Security & Lock PIN Code
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={lockPin}
                  onChange={(e) => setLockPin(e.target.value.replace(/\D/g, ""))}
                  className="w-32 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[11px] text-slate-400">4-digit code required to unlock doors or disarm alarms</p>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <h5 className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-2">Reset Database</h5>
                <p className="text-xs text-slate-400 mb-3">
                  Restore all default smart home devices, sample scenes, and rooms to their initial factory demo state.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Reset all smart home devices and settings to initial factory demo?")) {
                      onResetData();
                      onClose();
                    }
                  }}
                  className="px-4 py-2.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset All Sample Data</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800/80 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
