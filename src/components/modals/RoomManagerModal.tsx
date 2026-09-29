"use client";

import React, { useState } from "react";
import { Room, SmartDevice } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import { X, Plus, Trash2, Check, Pencil, ArrowRight } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface RoomManagerModalProps {
  rooms: Room[];
  devices: SmartDevice[];
  onClose: () => void;
  onCreate: (room: { name: string; icon: string }) => Promise<void>;
  onRename: (id: string, name: string, icon: string) => Promise<void>;
  onDelete: (id: string, fallbackRoomId: string) => Promise<void>;
  onMoveDevices: (deviceIds: string[], roomId: string) => Promise<void>;
}

const ROOM_ICONS = [
  "Sofa",
  "BedDouble",
  "UtensilsCrossed",
  "Flower2",
  "Shield",
  "Home",
  "LayoutGrid",
  "Tv",
  "Droplets",
  "SunMedium",
];

export function RoomManagerModal({
  rooms,
  devices,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onMoveDevices,
}: RoomManagerModalProps) {
  const editableRooms = rooms.filter((r) => r.id !== "all");

  const [tab, setTab] = useState<"rooms" | "assign">("rooms");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("Home");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("Home");
  const [busy, setBusy] = useState(false);

  // Bulk-assign tab state
  const [sourceRoom, setSourceRoom] = useState<string>(editableRooms[0]?.id || "");
  const [targetRoom, setTargetRoom] = useState<string>(editableRooms[1]?.id || editableRooms[0]?.id || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const countFor = (roomId: string) => devices.filter((d) => d.roomId === roomId).length;
  const devicesInSource = devices.filter((d) => d.roomId === sourceRoom);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    wallSound.playTap();
    await onCreate({ name: newName.trim(), icon: newIcon });
    setNewName("");
    setBusy(false);
  };

  const beginEdit = (room: Room) => {
    wallSound.playTap();
    setEditingId(room.id);
    setEditName(room.name);
    setEditIcon(room.icon);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim() || busy) return;
    setBusy(true);
    await onRename(editingId, editName.trim(), editIcon);
    setEditingId(null);
    setBusy(false);
  };

  const handleDelete = async (room: Room) => {
    const count = countFor(room.id);
    const message =
      count > 0
        ? `Delete "${room.name}"?\n\n${count} device(s) will be moved to "Unassigned" — no devices are deleted.`
        : `Delete "${room.name}"?`;
    if (!confirm(message)) return;
    setBusy(true);
    await onDelete(room.id, "unassigned");
    setBusy(false);
  };

  const handleMove = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    wallSound.playTap();
    await onMoveDevices(Array.from(selected), targetRoom);
    setSelected(new Set());
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400">
              <DeviceIcon name="Home" className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100">Room Management</h3>
              <p className="text-xs text-slate-400">Create, rename, and reassign devices between rooms</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 px-5 pt-4">
          <button
            onClick={() => setTab("rooms")}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === "rooms" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-white"
            }`}
          >
            Rooms ({editableRooms.length})
          </button>
          <button
            onClick={() => setTab("assign")}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === "assign" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-white"
            }`}
          >
            Move Devices
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {tab === "rooms" && (
            <>
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Add a room</p>
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder="e.g. Guest Bedroom"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || busy}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ROOM_ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setNewIcon(icon)}
                      className={`p-2 rounded-lg border transition-all ${
                        newIcon === icon
                          ? "bg-cyan-500 border-cyan-400 text-slate-950"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                      }`}
                    >
                      <DeviceIcon name={icon} className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {editableRooms.map((room) => (
                  <div
                    key={room.id}
                    className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center gap-3"
                  >
                    {editingId === room.id ? (
                      <>
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {ROOM_ICONS.slice(0, 6).map((icon) => (
                            <button
                              key={icon}
                              onClick={() => setEditIcon(icon)}
                              className={`p-1.5 rounded-lg border ${
                                editIcon === icon
                                  ? "bg-cyan-500 border-cyan-400 text-slate-950"
                                  : "bg-slate-900 border-slate-700 text-slate-400"
                              }`}
                            >
                              <DeviceIcon name={icon} className="w-3.5 h-3.5" />
                            </button>
                          ))}
                        </div>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                          className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={saveEdit}
                          className="p-2 rounded-lg bg-emerald-500 text-slate-950"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-2 rounded-lg bg-slate-800 text-slate-300"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="p-2 rounded-xl bg-slate-800 text-cyan-400">
                          <DeviceIcon name={room.icon} className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{room.name}</p>
                          <p className="text-[11px] text-slate-400">{countFor(room.id)} device(s)</p>
                        </div>
                        <button
                          onClick={() => beginEdit(room)}
                          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title="Rename"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(room)}
                          className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300"
                          title="Delete room"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "assign" && (
            <>
              <div className="flex items-center gap-2">
                <select
                  value={sourceRoom}
                  onChange={(e) => {
                    setSourceRoom(e.target.value);
                    setSelected(new Set());
                  }}
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  {editableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({countFor(r.id)})
                    </option>
                  ))}
                </select>
                <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={targetRoom}
                  onChange={(e) => setTargetRoom(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  {editableRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  onClick={() =>
                    setSelected(
                      selected.size === devicesInSource.length
                        ? new Set()
                        : new Set(devicesInSource.map((d) => d.id))
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  {selected.size === devicesInSource.length && devicesInSource.length > 0
                    ? "Clear all"
                    : "Select all"}
                </button>
                <button
                  onClick={handleMove}
                  disabled={selected.size === 0 || sourceRoom === targetRoom || busy}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold"
                >
                  Move {selected.size > 0 ? `${selected.size} ` : ""}device(s)
                </button>
              </div>

              <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
                {devicesInSource.length === 0 && (
                  <p className="py-8 text-center text-xs text-slate-500">This room has no devices.</p>
                )}
                {devicesInSource.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleSelected(d.id)}
                    className={`w-full p-2.5 rounded-xl border flex items-center gap-3 text-left transition-all ${
                      selected.has(d.id)
                        ? "bg-cyan-950/40 border-cyan-500"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        selected.has(d.id) ? "bg-cyan-500 border-cyan-400" : "border-slate-600"
                      }`}
                    >
                      {selected.has(d.id) && <Check className="w-3 h-3 text-slate-950" />}
                    </div>
                    <DeviceIcon name={d.icon} className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs text-white truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
