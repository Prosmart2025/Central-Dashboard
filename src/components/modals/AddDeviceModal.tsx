"use client";

import React, { useState } from "react";
import { Room, SmartDevice, DeviceCategory } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import { X, Plus, Sparkles, Check } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface AddDeviceModalProps {
  rooms: Room[];
  onClose: () => void;
  onAdd: (device: Partial<SmartDevice>) => void;
}

const CATEGORY_CONFIG: Array<{
  category: DeviceCategory;
  label: string;
  defaultIcon: string;
  defaultState: Record<string, unknown>;
}> = [
  { category: "light", label: "Smart Light / Bulb", defaultIcon: "LampCeiling", defaultState: { isOn: true, brightness: 80, colorTemp: 4000 } },
  { category: "climate", label: "Thermostat / AC", defaultIcon: "AirVent", defaultState: { isOn: true, mode: "cool", targetTemp: 22.0, currentTemp: 23.0 } },
  { category: "curtain", label: "Curtains / Blinds", defaultIcon: "Blinds", defaultState: { curtainPosition: 100, curtainState: "open" } },
  { category: "socket", label: "Smart Plug / Switch", defaultIcon: "PlugZap", defaultState: { isOn: true, powerWatts: 45.0, energyKwh: 1.2 } },
  { category: "lock", label: "Smart Door Lock", defaultIcon: "Lock", defaultState: { isLocked: true, battery: 95 } },
  { category: "camera", label: "Security Camera", defaultIcon: "Camera", defaultState: { isOn: true, battery: 90 } },
  { category: "vacuum", label: "Robot Vacuum", defaultIcon: "Disc3", defaultState: { isOn: false, vacuumStatus: "docked", battery: 100 } },
  { category: "fan", label: "Air Purifier / Fan", defaultIcon: "Wind", defaultState: { isOn: true, fanSpeed: "low", pm25: 15 } },
  { category: "sensor", label: "Motion / Sensor", defaultIcon: "Eye", defaultState: { isOn: true, battery: 98 } },
];

const AVAILABLE_ICONS = [
  "LampCeiling",
  "Lightbulb",
  "Sparkles",
  "SunMedium",
  "SunDim",
  "AirVent",
  "ThermometerSnowflake",
  "Wind",
  "Flame",
  "Blinds",
  "PlugZap",
  "Coffee",
  "Tv",
  "Lock",
  "Camera",
  "Disc3",
  "Eye",
  "Flower2",
];

export function AddDeviceModal({ rooms, onClose, onAdd }: AddDeviceModalProps) {
  const [name, setName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<DeviceCategory>("light");
  const [selectedRoom, setSelectedRoom] = useState(rooms.find((r) => r.id !== "all")?.id || "living_room");
  const [protocol, setProtocol] = useState("Zigbee 3.0");
  const [selectedIcon, setSelectedIcon] = useState("LampCeiling");
  const [tuyaId, setTuyaId] = useState("");

  const handleCategorySelect = (cat: typeof CATEGORY_CONFIG[0]) => {
    wallSound.playTap();
    setSelectedCategory(cat.category);
    setSelectedIcon(cat.defaultIcon);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    wallSound.playTap();
    const catConfig = CATEGORY_CONFIG.find((c) => c.category === selectedCategory);

    onAdd({
      name: name.trim(),
      category: selectedCategory,
      roomId: selectedRoom,
      icon: selectedIcon,
      protocol,
      online: true,
      state: catConfig ? { ...catConfig.defaultState } : { isOn: true },
      tuyaDeviceId: tuyaId.trim() || `tuya_${Math.random().toString(36).substring(2, 9)}`,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-400">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100">Add Tuya Smart Device</h3>
              <p className="text-xs text-slate-400">Connect new device to your tablet wall dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Device Name */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Device Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Master Bedroom Ceiling Light"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Category Selector */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Device Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_CONFIG.map((cat) => (
                <button
                  type="button"
                  key={cat.category}
                  onClick={() => handleCategorySelect(cat)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-xs ${
                    selectedCategory === cat.category
                      ? "bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-sm"
                      : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"
                  }`}
                >
                  <DeviceIcon name={cat.defaultIcon} className="w-5 h-5" />
                  <span className="truncate w-full text-center">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Room & Protocol Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Room</label>
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
              >
                {rooms
                  .filter((r) => r.id !== "all")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Protocol</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Zigbee 3.0">Zigbee 3.0</option>
                <option value="Wi-Fi 6">Wi-Fi (2.4/5GHz)</option>
                <option value="Bluetooth Mesh">Bluetooth Mesh</option>
                <option value="Matter over Thread">Matter / Thread</option>
              </select>
            </div>
          </div>

          {/* Icon Selector */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Wall Screen Icon</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_ICONS.map((icon) => (
                <button
                  type="button"
                  key={icon}
                  onClick={() => {
                    wallSound.playTap();
                    setSelectedIcon(icon);
                  }}
                  className={`p-2.5 rounded-xl border transition-all ${
                    selectedIcon === icon
                      ? "bg-cyan-500 border-cyan-400 text-slate-950 shadow-md"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
                  }`}
                >
                  <DeviceIcon name={icon} className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>

          {/* Tuya Device ID (optional) */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Tuya Device ID <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. bf829103847291a2"
              value={tuyaId}
              onChange={(e) => setTuyaId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-all shadow-md"
            >
              Add Device
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
