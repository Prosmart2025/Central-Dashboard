"use client";

import React, { useState, useEffect } from "react";
import { SmartDevice } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import {
  X,
  Camera,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Radio,
  Image as ImageIcon,
} from "lucide-react";
import { wallSound } from "@/lib/sound";

interface CameraFeedModalProps {
  device: SmartDevice;
  onClose: () => void;
}

export function CameraFeedModal({ device, onClose }: CameraFeedModalProps) {
  const [isTalking, setIsTalking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [ptzMessage, setPtzMessage] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }) +
          " " +
          now.toLocaleTimeString("en-US", { hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePtz = (dir: string) => {
    wallSound.playTap();
    setPtzMessage(`PTZ: Panning ${dir}...`);
    setTimeout(() => setPtzMessage(null), 1200);
  };

  const handleTakeSnapshot = () => {
    wallSound.playAlert();
    const snapId = `Snapshot at ${new Date().toLocaleTimeString()}`;
    setSnapshots((prev) => [snapId, ...prev.slice(0, 3)]);
    setPtzMessage("Snapshot saved to gallery!");
    setTimeout(() => setPtzMessage(null), 1500);
  };

  const toggleIntercom = () => {
    wallSound.playTap();
    setIsTalking((prev) => !prev);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-white flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400">
              <DeviceIcon name={device.icon} className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100">{device.name}</h3>
              <p className="text-xs text-slate-400">Tuya Smart IPC • 2K Ultra HD (2304x1296)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Canvas Simulation */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
          {/* Simulated Street / Front Porch View with CSS */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-slate-800/80">
            {/* Subtle simulated background elements */}
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-zinc-950 to-transparent opacity-80" />
            <div className="absolute bottom-8 left-12 w-28 h-36 bg-slate-800/40 rounded-t-lg border-t border-l border-r border-slate-700/50" />
            <div className="absolute bottom-8 right-16 w-32 h-48 bg-slate-800/40 rounded-t-xl border-t border-l border-r border-slate-700/50" />
            {/* Soft garden pathway line */}
            <div className="absolute bottom-0 left-1/3 w-1/3 h-24 bg-zinc-800/30 rounded-t-3xl border-t border-cyan-500/20" />
          </div>

          {/* HUD Overlays */}
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-700/60">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-mono font-bold text-white tracking-wider">LIVE 2K</span>
            <span className="text-[11px] text-slate-400 font-mono">1.9 Mbps</span>
          </div>

          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-700/60 text-xs font-mono text-slate-200">
            {currentTime}
          </div>

          {/* PTZ Feedback Message */}
          {ptzMessage && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-cyan-950/80 border border-cyan-500 text-cyan-200 text-xs px-4 py-2 rounded-xl backdrop-blur-md animate-pulse">
              {ptzMessage}
            </div>
          )}

          {/* Intercom active animation */}
          {isTalking && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-emerald-950/90 border border-emerald-500 px-5 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-5 bg-emerald-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-8 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                <span className="w-1.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                Two-Way Audio Active
              </span>
            </div>
          )}

          {/* Quick HUD controls */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <button
              onClick={() => setIsMuted((prev) => !prev)}
              className="p-2.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-slate-700 text-slate-200"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleTakeSnapshot}
              className="p-2.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-slate-700 text-slate-200 flex items-center gap-1.5 text-xs font-medium"
            >
              <Camera className="w-4 h-4" />
              <span>Snapshot</span>
            </button>
          </div>
        </div>

        {/* Lower Controls & PTZ */}
        <div className="p-5 flex flex-wrap items-center justify-between gap-4 bg-slate-950/70 border-t border-slate-800">
          {/* Two-Way Talk Intercom Button */}
          <button
            onClick={toggleIntercom}
            className={`px-5 py-3 rounded-2xl font-semibold text-sm flex items-center gap-2.5 transition-all shadow-md ${
              isTalking
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-[0_0_20px_rgba(225,29,72,0.4)]"
                : "bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            }`}
          >
            {isTalking ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            <span>{isTalking ? "End Intercom" : "Press to Talk"}</span>
          </button>

          {/* PTZ Arrow Pad */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 p-1 rounded-2xl shadow-inner">
            <button
              onClick={() => handlePtz("Left")}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-300"
              title="Pan Left"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handlePtz("Up")}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-300"
                title="Tilt Up"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePtz("Down")}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-300"
                title="Tilt Down"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => handlePtz("Right")}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-300"
              title="Pan Right"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
          >
            Close Feed
          </button>
        </div>

        {/* Snapshots mini row if captured */}
        {snapshots.length > 0 && (
          <div className="px-5 py-3 bg-slate-950 border-t border-slate-800/80 flex items-center gap-3 overflow-x-auto text-xs text-slate-400">
            <span className="flex items-center gap-1 font-semibold text-slate-300 whitespace-nowrap">
              <ImageIcon className="w-3.5 h-3.5" /> Recent Snaps:
            </span>
            {snapshots.map((s, idx) => (
              <span
                key={idx}
                className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 whitespace-nowrap text-[11px]"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
