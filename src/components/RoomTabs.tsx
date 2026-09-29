"use client";

import React from "react";
import { Room, SmartDevice } from "@/types/smart-home";
import { DeviceIcon } from "./DeviceIcon";
import { wallSound } from "@/lib/sound";

interface RoomTabsProps {
  rooms: Room[];
  selectedRoom: string;
  devices: SmartDevice[];
  onSelectRoom: (roomId: string) => void;
}

export function RoomTabs({ rooms, selectedRoom, devices, onSelectRoom }: RoomTabsProps) {
  const getDeviceCountForRoom = (roomId: string) => {
    if (roomId === "all") return devices.length;
    return devices.filter((d) => d.roomId === roomId).length;
  };

  const getActiveDeviceCountForRoom = (roomId: string) => {
    const list = roomId === "all" ? devices : devices.filter((d) => d.roomId === roomId);
    return list.filter((d) => d.state?.isOn || (d.category === "curtain" && (d.state?.curtainPosition ?? 0) > 0)).length;
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar select-none">
      {rooms.map((room) => {
        const isSelected = selectedRoom === room.id;
        const total = getDeviceCountForRoom(room.id);
        const activeCount = getActiveDeviceCountForRoom(room.id);

        return (
          <button
            key={room.id}
            onClick={() => {
              wallSound.playTap();
              onSelectRoom(room.id);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border shadow-sm ${
              isSelected
                ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)] scale-[1.02]"
                : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <DeviceIcon name={room.icon} className="w-4 h-4" />
            <span className="text-left">{room.name}{room.integration?.homeName && <small className="block text-[9px] font-normal opacity-65">{room.integration.homeName}</small>}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                isSelected
                  ? "bg-slate-950/20 text-slate-950 font-extrabold"
                  : activeCount > 0
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
