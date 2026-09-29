"use client";

import React, { useState } from "react";
import { SmartDevice } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import { X, Lock, Unlock, Fingerprint, ShieldCheck, Battery } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface DoorLockModalProps {
  device: SmartDevice;
  lockPin?: string;
  onClose: () => void;
  onUpdate: (deviceId: string, updates: Record<string, unknown>) => void;
}

export function DoorLockModal({
  device,
  lockPin = "1234",
  onClose,
  onUpdate,
}: DoorLockModalProps) {
  const state = device.state || {};
  const [isLocked, setIsLocked] = useState(state.isLocked ?? true);
  const [pinInput, setPinInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleKeypadPress = (digit: string) => {
    wallSound.playTap();
    setErrorMsg("");
    setSuccessMsg("");
    if (pinInput.length < 4) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === 4) {
        verifyPin(next);
      }
    }
  };

  const handleBackspace = () => {
    wallSound.playTap();
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMsg("");
  };

  const verifyPin = (enteredPin: string) => {
    if (enteredPin === lockPin) {
      wallSound.playAlert();
      const nextLocked = !isLocked;
      setIsLocked(nextLocked);
      setSuccessMsg(nextLocked ? "Door Locked Successfully" : "Door Unlocked Successfully");
      setPinInput("");
      onUpdate(device.id, { isLocked: nextLocked });
    } else {
      setErrorMsg("Incorrect PIN (Default: 1234)");
      wallSound.playAlert();
      setTimeout(() => {
        setPinInput("");
      }, 700);
    }
  };

  const handleBiometricUnlock = () => {
    wallSound.playTap();
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    setSuccessMsg(nextLocked ? "Fingerprint Verified: Locked" : "Fingerprint Verified: Unlocked");
    onUpdate(device.id, { isLocked: nextLocked });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-md rounded-3xl bg-slate-900/95 border border-slate-700/80 shadow-2xl overflow-hidden text-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-2xl ${
                isLocked ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
              }`}
            >
              <DeviceIcon name={device.icon} className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100">{device.name}</h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Battery className="w-3.5 h-3.5 text-emerald-400" />
                <span>Battery {state.battery ?? 92}%</span>
                <span>•</span>
                <span>{device.protocol}</span>
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

        {/* Lock Status Display */}
        <div className="p-6 flex flex-col items-center justify-center">
          <div
            className={`w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-300 ${
              isLocked
                ? "border-emerald-500 bg-emerald-950/30 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                : "border-amber-500 bg-amber-950/30 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.3)]"
            }`}
          >
            {isLocked ? <Lock className="w-12 h-12" /> : <Unlock className="w-12 h-12" />}
          </div>
          <p className="mt-3 font-semibold text-base tracking-wide">
            {isLocked ? "SECURED & LOCKED" : "UNLOCKED"}
          </p>

          {/* PIN Dots */}
          <div className="flex items-center gap-3 my-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  i < pinInput.length
                    ? "bg-cyan-400 border-cyan-400 scale-110 shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                    : "border-slate-600 bg-slate-800"
                }`}
              />
            ))}
          </div>

          {errorMsg && <p className="text-xs font-semibold text-rose-400 animate-pulse">{errorMsg}</p>}
          {successMsg && <p className="text-xs font-semibold text-emerald-400">{successMsg}</p>}
        </div>

        {/* Numeric Keypad */}
        <div className="px-8 pb-4">
          <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                onClick={() => handleKeypadPress(num)}
                className="h-12 rounded-2xl bg-slate-800/90 hover:bg-slate-700/90 active:scale-95 text-lg font-semibold text-white transition-all shadow-sm border border-slate-700/60"
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleBackspace}
              className="h-12 rounded-2xl bg-slate-800/60 hover:bg-slate-700/60 text-xs font-semibold text-slate-300 transition-all border border-slate-700/60"
            >
              CLEAR
            </button>
            <button
              onClick={() => handleKeypadPress("0")}
              className="h-12 rounded-2xl bg-slate-800/90 hover:bg-slate-700/90 active:scale-95 text-lg font-semibold text-white transition-all shadow-sm border border-slate-700/60"
            >
              0
            </button>
            <button
              onClick={handleBiometricUnlock}
              className="h-12 rounded-2xl bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-700/60 text-cyan-300 flex items-center justify-center transition-all"
              title="Simulate Fingerprint Scan"
            >
              <Fingerprint className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-center text-slate-400 mt-2">
            Default security PIN is <span className="font-mono text-cyan-300">1234</span>
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Auto-relock in 30s enabled</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
