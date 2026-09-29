"use client";

import React, { useState } from "react";
import { SmartScene } from "@/types/smart-home";
import { DeviceIcon } from "./DeviceIcon";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface SceneBarProps {
  scenes: SmartScene[];
  onTriggerScene: (scene: SmartScene) => Promise<boolean>;
}

export function SceneBar({ scenes, onTriggerScene }: SceneBarProps) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const handleTrigger = async (scene: SmartScene) => {
    if (activeSceneId) return;
    setActiveSceneId(scene.id);
    try { const ok = await onTriggerScene(scene); if (ok) wallSound.playScene(); } finally { setActiveSceneId(null); }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
          Tuya Tap-to-Run & saved scenes
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 max-h-48 overflow-y-auto">
        {scenes.map((s) => {
          const isTriggering = activeSceneId === s.id;
          return (
            <button
              key={s.id}
              disabled={Boolean(activeSceneId) || s.integration?.enabled === false}
              onClick={() => handleTrigger(s)}
              className={`relative overflow-hidden p-3 rounded-2xl border text-left transition-all active:scale-95 group flex items-center gap-2.5 shadow-md ${
                isTriggering
                  ? "border-white bg-slate-800 scale-98 shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                  : "border-slate-800 bg-slate-900/80 hover:bg-slate-800/90 hover:border-slate-700"
              }`}
            >
              {/* Subtle gradient background accent */}
              <div
                className={`absolute inset-0 bg-gradient-to-r ${s.gradient} opacity-20 group-hover:opacity-30 transition-opacity`}
              />

              <div
                className={`relative z-10 p-2 rounded-xl text-white bg-gradient-to-br ${s.gradient} shadow-sm group-hover:scale-105 transition-transform`}
              >
                {isTriggering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DeviceIcon name={s.icon} className="w-4 h-4" />
                )}
              </div>

              <div className="relative z-10 min-w-0">
                <span className="text-xs font-bold text-white block truncate">{s.name}</span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {isTriggering ? "Requesting…" : s.integration?.source === "smartlife" ? "Tuya scene" : `${s.actions?.length || 0} actions`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
