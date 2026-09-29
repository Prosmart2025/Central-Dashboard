"use client";

import React, { useState, useEffect } from "react";
import { ActivityLog } from "@/types/smart-home";
import { X, History, Sparkles, Shield, Cpu, Clock, RefreshCw } from "lucide-react";

interface ActivityLogsModalProps {
  onClose: () => void;
}

export function ActivityLogsModal({ onClose }: ActivityLogsModalProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/logs?limit=40");
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
      }
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getLogIcon = (type?: string) => {
    switch (type) {
      case "security":
        return <Shield className="w-4 h-4 text-rose-400" />;
      case "scene":
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case "system":
        return <Cpu className="w-4 h-4 text-cyan-400" />;
      default:
        return <Clock className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-white flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100">Smart Home Event Logs</h3>
              <p className="text-xs text-slate-400">Activity from tablet panel, sensors, and automations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="p-5 space-y-2.5 overflow-y-auto flex-1">
          {loading && logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading activity logs...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No activity events recorded yet</div>
          ) : (
            logs.map((log) => {
              const date = new Date(log.timestamp);
              const timeFormatted = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              const dateFormatted = date.toLocaleDateString([], { month: "short", day: "numeric" });
              return (
                <div
                  key={log.id}
                  className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60">
                      {getLogIcon(log.type)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">{log.deviceName}</h4>
                      <p className="text-slate-400 mt-0.5">{log.action}</p>
                    </div>
                  </div>

                  <div className="text-right whitespace-nowrap">
                    <div className="font-mono text-slate-300 text-[11px]">{timeFormatted}</div>
                    <div className="text-[10px] text-slate-500">{dateFormatted}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800/80 flex justify-end">
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
