"use client";

import React, { useState } from "react";
import { X, Shield, ShieldCheck, ShieldAlert, AlertTriangle, BellRing } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface SecurityModalProps {
  currentMode: "disarmed" | "home" | "away";
  lockPin?: string;
  onClose: () => void;
  onUpdateMode: (mode: "disarmed" | "home" | "away") => void;
}

export function SecurityModal({
  currentMode,
  lockPin = "1234",
  onClose,
  onUpdateMode,
}: SecurityModalProps) {
  const [selectedMode, setSelectedMode] = useState(currentMode);
  const [isSosActive, setIsSosActive] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [promptPin, setPromptPin] = useState(false);
  const [pendingMode, setPendingMode] = useState<"disarmed" | "home" | "away">("disarmed");

  const handleSelectMode = (mode: "disarmed" | "home" | "away") => {
    wallSound.playTap();
    if (mode === "disarmed" && selectedMode !== "disarmed") {
      setPendingMode(mode);
      setPromptPin(true);
      setPinInput("");
    } else {
      setSelectedMode(mode);
      onUpdateMode(mode);
      wallSound.playAlert();
    }
  };

  const handleKeypadPress = (digit: string) => {
    wallSound.playTap();
    setErrorMsg("");
    if (pinInput.length < 4) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === 4) {
        if (next === lockPin) {
          wallSound.playTap();
          setSelectedMode(pendingMode);
          onUpdateMode(pendingMode);
          setPromptPin(false);
          setPinInput("");
        } else {
          setErrorMsg("Incorrect PIN (Default: 1234)");
          wallSound.playAlert();
          setTimeout(() => setPinInput(""), 700);
        }
      }
    }
  };

  const toggleSos = () => {
    if (!isSosActive) {
      setIsSosActive(true);
      wallSound.playAlert();
    } else {
      setIsSosActive(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-lg rounded-3xl bg-slate-900 border shadow-2xl overflow-hidden text-white flex flex-col transition-all ${
          isSosActive ? "border-rose-500 shadow-[0_0_50px_rgba(244,63,94,0.5)] animate-pulse" : "border-slate-700"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-2xl ${
                isSosActive
                  ? "bg-rose-600 text-white animate-bounce"
                  : selectedMode === "disarmed"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100">Tuya Security & Alarm Hub</h3>
              <p className="text-xs text-slate-400">
                Current status: <span className="font-semibold text-white uppercase">{selectedMode}</span>
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

        {/* SOS Alert Banner */}
        {isSosActive && (
          <div className="bg-rose-600/90 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BellRing className="w-5 h-5 animate-spin" />
              <span className="font-bold text-sm tracking-wide">EMERGENCY SOS SIREN TRIGGERED!</span>
            </div>
            <button
              onClick={toggleSos}
              className="px-4 py-1.5 bg-white text-rose-700 rounded-xl text-xs font-bold hover:bg-slate-100"
            >
              SILENCE ALARM
            </button>
          </div>
        )}

        {/* Security Mode Options */}
        {!promptPin ? (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleSelectMode("disarmed")}
                className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                  selectedMode === "disarmed"
                    ? "bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    : "bg-slate-800/80 border-slate-700/70 text-slate-400 hover:text-white"
                }`}
              >
                <ShieldCheck className="w-8 h-8" />
                <span className="font-semibold text-sm">Disarmed</span>
                <span className="text-[10px] text-slate-400">All sensors idle</span>
              </button>

              <button
                onClick={() => handleSelectMode("home")}
                className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                  selectedMode === "home"
                    ? "bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                    : "bg-slate-800/80 border-slate-700/70 text-slate-400 hover:text-white"
                }`}
              >
                <Shield className="w-8 h-8" />
                <span className="font-semibold text-sm">Arm Home</span>
                <span className="text-[10px] text-slate-400">Perimeter active</span>
              </button>

              <button
                onClick={() => handleSelectMode("away")}
                className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${
                  selectedMode === "away"
                    ? "bg-amber-950/40 border-amber-500 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                    : "bg-slate-800/80 border-slate-700/70 text-slate-400 hover:text-white"
                }`}
              >
                <ShieldAlert className="w-8 h-8" />
                <span className="font-semibold text-sm">Arm Away</span>
                <span className="text-[10px] text-slate-400">All zones armed</span>
              </button>
            </div>

            {/* Emergency SOS Button */}
            <div className="pt-2">
              <button
                onClick={toggleSos}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-700 to-red-600 hover:from-rose-600 hover:to-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <AlertTriangle className="w-5 h-5" />
                <span>{isSosActive ? "MUTE EMERGENCY SOS" : "TRIGGER SOS PANIC ALARM"}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Enter PIN to Disarm */
          <div className="p-6 flex flex-col items-center">
            <h4 className="text-sm font-semibold text-slate-200 mb-2">Enter PIN to Disarm Alarm</h4>
            <div className="flex items-center gap-3 my-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                    i < pinInput.length
                      ? "bg-emerald-400 border-emerald-400 scale-110 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                      : "border-slate-600 bg-slate-800"
                  }`}
                />
              ))}
            </div>
            {errorMsg && <p className="text-xs font-semibold text-rose-400 mb-2">{errorMsg}</p>}

            <div className="grid grid-cols-3 gap-2.5 max-w-xs w-full mt-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  onClick={() => handleKeypadPress(num)}
                  className="h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-base font-semibold text-white transition-all border border-slate-700/60"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setPromptPin(false)}
                className="h-11 rounded-2xl bg-slate-800/60 hover:bg-slate-700 text-xs font-semibold text-slate-400"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleKeypadPress("0")}
                className="h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 text-base font-semibold text-white border border-slate-700/60"
              >
                0
              </button>
              <button
                onClick={() => setPinInput((p) => p.slice(0, -1))}
                className="h-11 rounded-2xl bg-slate-800/60 hover:bg-slate-700 text-xs font-semibold text-slate-400"
              >
                DEL
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
