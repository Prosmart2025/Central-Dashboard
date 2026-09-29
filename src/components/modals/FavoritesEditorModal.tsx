"use client";

import React, { useState } from "react";
import { Favorite, SmartDevice, Room } from "@/types/smart-home";
import { DeviceIcon } from "../DeviceIcon";
import { X, Plus, Trash2, Eye, EyeOff, Check, Star } from "lucide-react";
import { wallSound } from "@/lib/sound";

interface FavoritesEditorModalProps {
  favorites: Favorite[];
  devices: SmartDevice[];
  rooms: Room[];
  onClose: () => void;
  onSave: (favorites: Favorite[]) => Promise<void>;
}

const ICON_CHOICES = [
  "AirVent",
  "Blinds",
  "Lightbulb",
  "Zap",
  "Flame",
  "Lock",
  "Camera",
  "Tv",
  "Wind",
  "Coffee",
  "Disc3",
  "Power",
  "Shield",
  "SunMedium",
  "Music",
  "Moon",
];

const GRADIENT_CHOICES = [
  "from-cyan-500 to-blue-600",
  "from-indigo-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-slate-500 to-slate-700",
];

const CATEGORY_CHOICES = [
  { value: "climate", label: "All ACs / Climate" },
  { value: "curtain", label: "All Shutters / Curtains" },
  { value: "light", label: "All Lights" },
  { value: "socket", label: "All Switches & Sockets" },
  { value: "lock", label: "All Locks" },
  { value: "fan", label: "All Fans & Purifiers" },
  { value: "camera", label: "All Cameras" },
];

export function FavoritesEditorModal({
  favorites,
  devices,
  rooms,
  onClose,
  onSave,
}: FavoritesEditorModalProps) {
  const [draft, setDraft] = useState<Favorite[]>(favorites.map((f) => ({ ...f })));
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("Power");
  const [gradient, setGradient] = useState(GRADIENT_CHOICES[0]);
  const [mode, setMode] = useState<"category" | "pick">("category");
  const [category, setCategory] = useState("climate");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const update = (id: string, patch: Partial<Favorite>) =>
    setDraft((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const addFavorite = () => {
    if (!label.trim()) return;
    wallSound.playTap();
    const id = `fav_${Date.now().toString(36)}`;
    setDraft((prev) => [
      ...prev,
      {
        id,
        label: label.trim(),
        icon,
        gradient,
        visible: true,
        ...(mode === "category"
          ? { category, deviceIds: undefined }
          : { category: undefined, deviceIds: Array.from(selected) }),
      },
    ]);
    setLabel("");
    setSelected(new Set());
  };

  const toggleDevice = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn">
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-amber-500/20 p-2.5 text-amber-400">
              <Star className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Quick Groups</h3>
              <p className="text-xs text-slate-400">Big icons at the top of the dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl bg-slate-800 p-2.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Current favourites */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Saved groups</p>
            {draft.length === 0 && (
              <p className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">
                No groups yet — create one below.
              </p>
            )}
            {draft.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${f.gradient}`}
                >
                  <DeviceIcon name={f.icon} className="h-5 w-5" />
                </span>

                <input
                  value={f.label}
                  onChange={(e) => update(f.id, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                />

                <span className="hidden rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-300 sm:block">
                  {f.deviceIds?.length ? `${f.deviceIds.length} selected` : (f.category ?? "mixed")}
                </span>

                <button
                  onClick={() => update(f.id, { visible: f.visible === false ? true : false })}
                  className={`rounded-lg p-2 transition-colors ${
                    f.visible === false
                      ? "bg-slate-800 text-slate-500"
                      : "bg-emerald-500/20 text-emerald-400"
                  }`}
                  title={f.visible === false ? "Hidden — show" : "Visible — hide"}
                >
                  {f.visible === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => setDraft((p) => p.filter((x) => x.id !== f.id))}
                  className="rounded-lg bg-rose-950/60 p-2 text-rose-300 hover:bg-rose-900"
                  title="Delete group"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Create */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Create a group</p>

            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Shutters at bedtime"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setMode("category")}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  mode === "category"
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-900 border border-slate-700 text-slate-400"
                }`}
              >
                Whole category
              </button>
              <button
                onClick={() => setMode("pick")}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  mode === "pick"
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-900 border border-slate-700 text-slate-400"
                }`}
              >
                Pick devices ({selected.size})
              </button>
            </div>

            {mode === "category" && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                {CATEGORY_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}

            {mode === "pick" && (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-800 p-1.5">
                {devices.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleDevice(d.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      selected.has(d.id)
                        ? "border-amber-500 bg-amber-500/15 text-white"
                        : "border-transparent bg-slate-900 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        selected.has(d.id) ? "border-amber-400 bg-amber-500" : "border-slate-600"
                      }`}
                    >
                      {selected.has(d.id) && <Check className="h-2.5 w-2.5 text-slate-950" />}
                    </span>
                    <DeviceIcon name={d.icon} className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Icon</p>
              <div className="flex flex-wrap gap-1.5">
                {ICON_CHOICES.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={`rounded-lg border p-1.5 transition-colors ${
                      icon === ic
                        ? "border-amber-400 bg-amber-500 text-slate-950"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                    }`}
                  >
                    <DeviceIcon name={ic} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Colour</p>
              <div className="flex flex-wrap gap-2">
                {GRADIENT_CHOICES.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGradient(g)}
                    className={`h-8 w-8 rounded-full bg-gradient-to-br ${g} transition-transform ${
                      gradient === g ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950" : ""
                    }`}
                    aria-label={`Colour ${g}`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={addFavorite}
              disabled={!label.trim() || (mode === "pick" && selected.size === 0)}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500"
            >
              <Plus className="mr-1 inline h-3.5 w-3.5" /> Add group
            </button>
          </div>

        </div>

        <div className="flex justify-end gap-3 border-t border-slate-800 bg-slate-950/70 p-4">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save groups"}
          </button>
        </div>
      </div>
    </div>
  );
}
