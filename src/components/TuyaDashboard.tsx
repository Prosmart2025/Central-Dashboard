"use client";

import {cardSpanClass} from "@/lib/card-preferences";
import { DeviceControlsModal } from "./modals/DeviceControlsModal";
import { isCloudDevice, supportsGroupAction } from "@/lib/device-capabilities";
import { syncSmartLifeAccount, type SyncSummary } from "@/lib/sync-account-client";
import type { DeviceCommandResult } from "@/types/integration";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { SmartDevice, Room, SmartScene, WallSettings } from "@/types/smart-home";
import { WallHeader } from "./WallHeader";
import { SceneBar } from "./SceneBar";
import { RoomTabs } from "./RoomTabs";
import { WallSummaryBar } from "./WallSummaryBar";
import { DeviceTile } from "./DeviceTile";
import { ScreenSaver } from "./ScreenSaver";

// Modals
import { LightControlModal } from "./modals/LightControlModal";
import { ClimateControlModal } from "./modals/ClimateControlModal";
import { CurtainControlModal } from "./modals/CurtainControlModal";
import { DoorLockModal } from "./modals/DoorLockModal";
import { CameraFeedModal } from "./modals/CameraFeedModal";
import { SecurityModal } from "./modals/SecurityModal";
import { AddDeviceModal } from "./modals/AddDeviceModal";
import { SettingsModal } from "./modals/SettingsModal";
import { ActivityLogsModal } from "./modals/ActivityLogsModal";

import { wallSound } from "@/lib/sound";
import { RoomManagerModal } from "./modals/RoomManagerModal";
import { FavoritesBar } from "./FavoritesBar";
import { FavoritesEditorModal } from "./modals/FavoritesEditorModal";
import { Favorite } from "@/types/smart-home";
import { CloudDownload, Check, RefreshCw, LayoutGrid, Home, ChevronLeft, ChevronRight } from "lucide-react";

interface TuyaDashboardProps {
  initialDevices: SmartDevice[];
  initialRooms: Room[];
  initialScenes: SmartScene[];
  initialSettings: WallSettings;
}

export function TuyaDashboard({
  initialDevices,
  initialRooms,
  initialScenes,
  initialSettings,
}: TuyaDashboardProps) {
  const [devices, setDevices] = useState<SmartDevice[]>(initialDevices);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [scenes, setScenes] = useState<SmartScene[]>(initialScenes);
  const [settings, setSettings] = useState<WallSettings>(initialSettings);
  const [selectedRoom, setSelectedRoom] = useState<string>("all");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScreensaver, setIsScreensaver] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncingTuya, setIsSyncingTuya] = useState(false);
  const [tuyaHelp, setTuyaHelp] = useState<{ message: string; checklist: string[] } | null>(null);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [showRoomManager, setShowRoomManager] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showFavoritesEditor, setShowFavoritesEditor] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>(initialSettings.favorites || []);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const [smartLifeConnected, setSmartLifeConnected] = useState(false);
  const [pendingDevices, setPendingDevices] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const [controlMessage, setControlMessage] = useState<{ message: string; failed: boolean; deviceId?: string } | null>(null);
  const [syncProgress, setSyncProgress] = useState("");
  const [syncWarnings, setSyncWarnings] = useState<SyncSummary["warnings"]>([]);
  const [settingsTab, setSettingsTab] = useState<"panel" | "tuya" | "system">("panel");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch("/api/smartlife");
        const result = await response.json();
        if (!cancelled) setSmartLifeConnected(Boolean(result?.data?.connected));
      } catch {}
    };
    check();
    const updateAfterLogin = async () => {
      await check();
      try {
        const [d,r,s] = await Promise.all(["devices","rooms","scenes"].map(async (kind) => (await fetch(`/api/${kind}`, { cache:"no-store" })).json()));
        if (!cancelled) { if(d.success)setDevices(d.data); if(r.success)setRooms(r.data); if(s.success)setScenes(s.data); }
      } catch {}
    };
    window.addEventListener("smartlife-updated", updateAfterLogin);
    const timer = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("smartlife-updated", updateAfterLogin);
    };
  }, []);

  // Active modal state
  const [activeModal, setActiveModal] = useState<{
    type:
      | "controls"
      | "light"
      | "climate"
      | "curtain"
      | "lock"
      | "camera"
      | "security"
      | "settings"
      | "add_device"
      | "logs";
    device?: SmartDevice;
  } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("connect") === "smartlife") {
      setSettingsTab("tuya");
      setActiveModal({ type: "settings" });
    }
  }, []);

  // Idle timer for screensaver
  const lastActivityRef = useRef(Date.now());

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    wallSound.enabled = settings.soundFeedback;
  }, [settings.soundFeedback]);

  // Handle Fullscreen change events
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Idle detection loop for kiosk wall standby
  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];
    const onUserActivity = () => {
      resetIdleTimer();
    };

    events.forEach((ev) => window.addEventListener(ev, onUserActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      if (settings.screenSaverTimeout > 0 && !isScreensaver && !activeModal) {
        const elapsed = (Date.now() - lastActivityRef.current) / 1000;
        if (elapsed >= settings.screenSaverTimeout) {
          setIsScreensaver(true);
        }
      }
    }, 2000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onUserActivity));
      clearInterval(checkInterval);
    };
  }, [settings.screenSaverTimeout, isScreensaver, activeModal, resetIdleTimer]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 6000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const refreshCatalog = async () => {
    const results = await Promise.all(["devices", "rooms", "scenes"].map(async (kind) => {
      const response = await fetch(`/api/${kind}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("Could not refresh the account catalog.");
      return result.data;
    }));
    setDevices(results[0]); setRooms(results[1]); setScenes(results[2]);
    setSelectedRoom((old) => results[1].some((room: Room) => room.id === old) ? old : "all");
  };

  const verificationTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latestReceipt = useRef(new Map<string, string>());
  useEffect(() => () => {
    for (const timer of verificationTimers.current.values()) clearTimeout(timer);
    verificationTimers.current.clear();latestReceipt.current.clear();
  }, []);

  // Status readback is a separate GET, not a delay before the command is sent.
  // A newer click invalidates the prior receipt so stale reads cannot undo it.
  const queueVerification = (id: string, commandId: string, attempt = 0) => {
    const previous = verificationTimers.current.get(id); if (previous) clearTimeout(previous);
    latestReceipt.current.set(id, commandId);
    verificationTimers.current.set(id, setTimeout(async () => {
      if (latestReceipt.current.get(id) !== commandId) return;
      try {
        const response = await fetch(`/api/devices/${encodeURIComponent(id)}?refresh=1&commandId=${encodeURIComponent(commandId)}`, { cache: "no-store" });
        const result = await response.json();
        if (latestReceipt.current.get(id) !== commandId || !result.success || !result.data) return;
        if (result.data.integration?.command?.id && result.data.integration.command.id !== commandId) return;
        setDevices((old) => old.map((device) => device.id === id ? result.data : device));
        if (result.data.integration?.command?.status === "confirmed") {
          setControlMessage((current) => current?.deviceId === id ? { ...current, message: result.data.integration.command.message, failed: false } : current);
        }
        if (result.data.integration?.command?.status === "accepted" && attempt === 0) queueVerification(id, commandId, 1);
      } catch { /* Acceptance is not changed to confirmation when readback fails. */ }
    }, attempt === 0 ? 350 : 1200));
  };

  const handleUpdateDeviceState = async (deviceId: string, updates: Record<string, unknown>): Promise<DeviceCommandResult> => {
    if (pendingRef.current.has(deviceId)) return { ok: false, message: "A command is already pending for this device." };
    const oldTimer = verificationTimers.current.get(deviceId); if (oldTimer) clearTimeout(oldTimer);
    latestReceipt.current.delete(deviceId);
    pendingRef.current.add(deviceId);
    setPendingDevices(new Set(pendingRef.current));
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: updates }),
      });
      const result = await response.json();
      if (result.data) setDevices((prev) => prev.map((d) => d.id === deviceId ? result.data : d));
      const ok = response.ok && result.success === true;
      const message = result.message || result.error || (ok ? "Command accepted." : "Tuya did not accept the command.");
      setControlMessage({ message, failed: !ok, deviceId });
      if (ok) wallSound.playTap();
      if (ok && result.verificationPending && result.commandId) queueVerification(deviceId, result.commandId);
      return { ok, message };
    } catch {
      const message = "The request could not be confirmed. Displayed state is unchanged; refresh the device to check.";
      setControlMessage({ message, failed: true, deviceId });
      return { ok: false, message };
    } finally {
      pendingRef.current.delete(deviceId); setPendingDevices(new Set(pendingRef.current));
    }
  };

  const handleTogglePower = async (device: SmartDevice) => {
    await handleUpdateDeviceState(device.id, { isOn: !device.state.isOn });
  };
  const handleRefreshDevice = async (id: string) => {
    const response = await fetch(`/api/devices/${encodeURIComponent(id)}?refresh=1`, { cache: "no-store" });
    const result = await response.json();
    if (result.data) setDevices((old) => old.map((d) => d.id === id ? result.data : d));
    if (!response.ok || !result.success) throw new Error(result.error || "Status refresh failed.");
  };

  // Open appropriate device modal
  const handleOpenDeviceModal = (device: SmartDevice) => {
    wallSound.playTap();
    if (isCloudDevice(device)) { setActiveModal({ type: "controls", device }); return; }

    if (device.state?.readOnly) {
      showToast(device.state.readOnlyReason || "This device reports status only");
      return;
    }

    // Multi-gang devices are operated from the per-channel buttons on the tile;
    // a single on/off modal would misrepresent them.
    if ((device.state?.channels?.length ?? 0) > 1) {
      showToast(`${device.name}: use the channel buttons on the tile`);
      return;
    }

    switch (device.category) {
      case "light":
        setActiveModal({ type: "light", device });
        break;
      case "climate":
        setActiveModal({ type: "climate", device });
        break;
      case "curtain":
        setActiveModal({ type: "curtain", device });
        break;
      case "lock":
        setActiveModal({ type: "lock", device });
        break;
      case "camera":
        setActiveModal({ type: "camera", device });
        break;
      case "socket":
        // Tapping socket opens light/dimmer or quick toggle
        handleTogglePower(device);
        break;
      default:
        // Default toggle
        handleTogglePower(device);
        break;
    }
  };

  const handleTriggerScene = async (scene: SmartScene): Promise<boolean> => {
    try {
      const response = await fetch(`/api/scenes/${encodeURIComponent(scene.id)}/trigger`, { method: "POST" });
      const result = await response.json();
      const ok = response.ok && result.success === true;
      setControlMessage({ message: result.message || result.error || "Scene request failed.", failed: !ok });
      await refreshCatalog();
      return ok;
    } catch { setControlMessage({ message: "Scene request could not be confirmed.", failed: true }); return false; }
  };
  const handleMasterLightToggle = async (turnOn: boolean) => {
    let failed = 0;
    const lights = devices.filter((d) => d.category === "light");
    for (const light of lights) { const result = await handleUpdateDeviceState(light.id, { isOn: turnOn }); if (!result.ok) failed++; }
    setControlMessage({ message: `${lights.length - failed}/${lights.length} light requests accepted${failed ? `; ${failed} failed` : ""}. See tiles for reported state.`, failed: failed > 0 });
  };

  // Add Device
  const handleAddDevice = async (newDevice: Partial<SmartDevice>) => {
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDevice),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDevices((prev) => [...prev, data.data]);
        showToast(`Device '${newDevice.name}' Added!`);
      }
    } catch (err) {
      console.error("Failed to add device:", err);
    }
  };

  // Update Settings
  const handleUpdateSettings = async (updates: Partial<WallSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
    showToast("Settings Updated");

    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  // --- Quick group (favourite) controls -------------------------------------

  // Count only devices the group action can actually reach, so a badge of "9"
  // never promises 9 when 7 are infrared-only and cannot be commanded.
  const deviceCounts = devices.reduce<Record<string, number>>((acc, d) => {
    if (!supportsGroupAction(d)) return acc;
    acc[d.category] = (acc[d.category] || 0) + 1;
    return acc;
  }, {});

  const handleTriggerFavorite = async (fav: Favorite, action?: "on" | "off" | "stop") => {
    try {
      const res = await fetch(`/api/favorites/${encodeURIComponent(fav.id)}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      const results: Array<{ id: string; ok: boolean; data?: SmartDevice }> = data.results || [];
      setDevices((prev) => prev.map((d) => results.find((r) => r.id === d.id)?.data || d));
      setControlMessage({ message: data.message || data.error || "Group request failed.", failed: !data.success });
      showToast(data.message || (data.success ? "Applied" : "Group action failed"));
      setQuotaNotice(data.quota ? data.quota.message : null);
      return { ok: !!data.success, message: data.message || data.error || "Group request failed." };
    } catch {
      showToast("Could not reach the server");
      return { ok: false, message: "Network error" };
    }
  };

  const handleSaveFavorites = async (next: Favorite[]) => {
    setFavorites(next);
    setSettings((prev) => ({ ...prev, favorites: next }));
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites: next }),
      });
      const data = await res.json();
      showToast(data.success ? "Quick groups saved" : data.error || "Save failed");
    } catch {
      showToast("Could not save quick groups");
    }
  };

  // --- Icon layout ordering -------------------------------------------------

  const persistOrder = async (ordered: SmartDevice[]) => {
    try {
      await fetch("/api/devices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: ordered.map((d, i) => ({ id: d.id, sortOrder: i })),
        }),
      });
    } catch {
      showToast("Could not save layout");
    }
  };

  /** Move a device to a new index within the currently visible list. */
  const moveDevice = (deviceId: string, targetId: string) => {
    if (deviceId === targetId) return;

    const visible = [...filteredDevices];
    const from = visible.findIndex((d) => d.id === deviceId);
    const to = visible.findIndex((d) => d.id === targetId);
    if (from === -1 || to === -1) return;

    const [moved] = visible.splice(from, 1);
    visible.splice(to, 0, moved);

    // Re-index only the visible subset, preserving everything else.
    const newOrder = new Map(visible.map((d, i) => [d.id, i]));
    setDevices((prev) =>
      [...prev]
        .map((d) => (newOrder.has(d.id) ? { ...d, sortOrder: newOrder.get(d.id)! } : d))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    );
    wallSound.playTap();
    persistOrder(visible);
  };

  /** Nudge a tile one position left or right - reliable on touch screens. */
  const nudgeDevice = (deviceId: string, direction: -1 | 1) => {
    const visible = [...filteredDevices];
    const index = visible.findIndex((d) => d.id === deviceId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= visible.length) return;
    moveDevice(deviceId, visible[target].id);
  };

  // --- Room management ------------------------------------------------------

  const refreshRooms = async () => {
    const [roomRes, devRes] = await Promise.all([fetch("/api/rooms"), fetch("/api/devices")]);
    const [roomData, devData] = await Promise.all([roomRes.json(), devRes.json()]);
    if (roomData.success) setRooms(roomData.data);
    if (devData.success) setDevices(devData.data);
  };

  const handleCreateRoom = async (room: { name: string; icon: string }) => {
    const id = `room_${room.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now().toString(36)}`;
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: room.name, icon: room.icon, sortOrder: rooms.length }),
    });
    const data = await res.json();
    if (data.success) {
      setRooms((prev) => [...prev, data.data]);
      showToast(`Room "${room.name}" created`);
    } else {
      showToast(data.error || "Could not create room");
    }
  };

  const handleRenameRoom = async (id: string, name: string, icon: string) => {
    const res = await fetch(`/api/rooms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon }),
    });
    const data = await res.json();
    if (data.success) {
      setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name, icon } : r)));
      showToast("Room updated");
    } else {
      showToast(data.error || "Could not update room");
    }
  };

  const handleDeleteRoom = async (id: string, fallbackRoomId: string) => {
    const res = await fetch(`/api/rooms/${id}?fallbackRoomId=${encodeURIComponent(fallbackRoomId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.success) {
      if (selectedRoom === id) setSelectedRoom("all");
      await refreshRooms();
      showToast(data.message || "Room deleted");
    } else {
      showToast(data.error || "Could not delete room");
    }
  };

  const handleMoveDevices = async (deviceIds: string[], roomId: string) => {
    setDevices((prev) => prev.map((d) => (deviceIds.includes(d.id) ? { ...d, roomId } : d)));
    const res = await fetch("/api/devices/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order: deviceIds.map((id) => {
          const dev = devices.find((d) => d.id === id);
          return { id, sortOrder: dev?.sortOrder ?? 0, roomId };
        }),
      }),
    });
    const data = await res.json();
    showToast(data.success ? `${deviceIds.length} device(s) moved` : data.error || "Move failed");
  };

  // Import or refresh devices linked to the configured Tuya Cloud project.
  const handleTuyaSync = async () => {
    setIsSyncingTuya(true);
    wallSound.playTap();
    try {
      setSyncWarnings([]);
      if (smartLifeConnected) {
        const summary = await syncSmartLifeAccount(setSyncProgress);
        setSyncWarnings(summary.warnings);setSyncProgress(summary.message);
      } else {
        const response = await fetch("/api/tuya", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Tuya sync failed.");
        setSyncProgress(result.message || "Developer devices imported. Connect Smart Life to copy rooms and scenes.");
      }
      setTuyaHelp(null);
      await refreshCatalog();
    } catch (error) {
      setSyncProgress(error instanceof Error ? error.message : "The Tuya import failed. Existing devices have been kept.");
    } finally {
      setIsSyncingTuya(false);
    }
  };

  // Reset Demo Data
  const handleResetData = async () => {
    showToast("Resetting smart home data...");
    try {
      await fetch("/api/seed", { method: "POST" });
      // Re-fetch everything
      const [devRes, roomRes, sceneRes, setRes] = await Promise.all([
        fetch("/api/devices"),
        fetch("/api/rooms"),
        fetch("/api/scenes"),
        fetch("/api/settings"),
      ]);
      const [devData, roomData, sceneData, setData] = await Promise.all([
        devRes.json(),
        roomRes.json(),
        sceneRes.json(),
        setRes.json(),
      ]);

      if (devData.success) setDevices(devData.data);
      if (roomData.success) setRooms(roomData.data);
      if (sceneData.success) setScenes(sceneData.data);
      if (setData.success) setSettings(setData.data);

      showToast("Default Tuya demo restored!");
    } catch (err) {
      console.error("Failed to reset:", err);
    }
  };

  // Filter devices based on selected room
  const filteredDevices =
    selectedRoom === "all" ? devices : devices.filter((d) => d.roomId === selectedRoom);

  // Theme container classes
  const getThemeClass = () => {
    switch (settings.theme) {
      case "titanium":
        return "bg-slate-950 text-slate-100 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black";
      case "neon":
        return "bg-[#090818] text-slate-100 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950 via-[#0a0720] to-[#04020a]";
      case "light":
        return "bg-slate-100 text-slate-900";
      default: // midnight
        return "bg-[#06090f] text-slate-100 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-950 via-[#070b13] to-[#030508]";
    }
  };

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-colors duration-300 relative font-sans ${getThemeClass()}`}
      style={{
        zoom: settings.kioskScale !== 100 ? `${settings.kioskScale}%` : undefined,
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-cyan-500 text-slate-950 font-bold px-4 py-2.5 rounded-2xl shadow-2xl animate-fadeIn">
          <Check className="w-4 h-4" />
          <span className="text-xs">{toastMessage}</span>
        </div>
      )}

      {/* Wall Header */}
      <WallHeader
        settings={settings}
        devices={devices}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onOpenScreensaver={() => setIsScreensaver(true)}
        onOpenSecurityModal={() => setActiveModal({ type: "security" })}
        onOpenSettingsModal={() => { setSettingsTab("panel"); setActiveModal({ type: "settings" }); }}
        onOpenAddDeviceModal={() => setActiveModal({ type: "add_device" })}
        onOpenLogsModal={() => setActiveModal({ type: "logs" })}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-5">
        {/* Quick One-Touch Scenes */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between">
          <div className="min-w-0 flex-1">
            <SceneBar scenes={scenes} onTriggerScene={handleTriggerScene} />
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => {
                wallSound.playTap();
                setShowRoomManager(true);
              }}
              className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center gap-2"
              title="Create, rename, and reassign rooms"
            >
              <Home className="w-4 h-4" />
              <span>Rooms</span>
            </button>
            <button
              onClick={() => {
                wallSound.playTap();
                setIsEditingLayout((v) => !v);
              }}
              className={`px-4 py-3 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 border ${
                isEditingLayout
                  ? "bg-amber-500 border-amber-400 text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.3)]"
                  : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
              }`}
              title="Rearrange icons"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>{isEditingLayout ? "Done" : "Arrange"}</span>
            </button>
            <button
              onClick={handleTuyaSync}
              disabled={isSyncingTuya}
              className={`px-4 py-3 rounded-2xl font-bold text-xs shadow-[0_0_18px_rgba(6,182,212,0.25)] transition-all flex items-center justify-center gap-2 disabled:bg-slate-700 disabled:text-slate-400 ${
                smartLifeConnected
                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                  : "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
              }`}
              title={smartLifeConnected ? "Refresh through Smart Life consumer connection" : "Import from Tuya developer project"}
            >
              {isSyncingTuya ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
              <span>{isSyncingTuya ? "Syncing…" : smartLifeConnected ? "Sync Tuya account" : "Sync Tuya"}</span>
            </button>
          </div>
        </div>

        {!smartLifeConnected && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/50 bg-amber-950/30 p-4 text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-amber-300">Connect Smart Life to make physical controls work</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                Link the phone-app account to use the Smart Life consumer connection. Generate a QR code using your app User Code, then scan and approve it in that same app. Device support still depends on Tuya.
              </p>
            </div>
            <button
              onClick={() => { setSettingsTab("tuya"); setActiveModal({ type: "settings" }); }}
              className="shrink-0 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
            >
              Connect Smart Life
            </button>
          </div>
        )}

        {controlMessage && <div role={controlMessage.failed ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-xs leading-relaxed ${controlMessage.failed ? "border-rose-600/50 bg-rose-950/30 text-rose-200" : "border-cyan-700/50 bg-cyan-950/20 text-cyan-100"}`}><span>{controlMessage.message}</span><button type="button" onClick={() => setControlMessage(null)} className="shrink-0 underline">Dismiss</button></div>}
        {syncProgress && <div role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">{syncProgress}{syncWarnings.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-amber-300">{syncWarnings.length} import notes</summary><ul className="mt-2 max-h-40 space-y-1 overflow-auto">{syncWarnings.map((w,i)=><li key={i}>{w.device}: {w.reason}</li>)}</ul></details>}</div>}

        {/* Tuya sync troubleshooting panel */}
        {tuyaHelp && (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-950/30 p-4 text-amber-100">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-amber-300">Tuya connected, but no devices were returned</h3>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/90">{tuyaHelp.message}</p>
              </div>
              <button
                onClick={() => setTuyaHelp(null)}
                className="shrink-0 rounded-lg bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30"
              >
                Dismiss
              </button>
            </div>
            <ol className="mt-3 space-y-1.5 text-xs leading-relaxed">
              {tuyaHelp.checklist.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono font-bold text-amber-400">{i + 1}.</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] text-amber-200/80">
              The QR code is scanned on the Tuya IoT Platform website, not in this dashboard.
            </p>
          </div>
        )}

        {/* Big one-tap group controls (All ACs, All Shutters, custom groups) */}
        <FavoritesBar
          favorites={favorites}
          deviceCounts={deviceCounts}
          onTrigger={handleTriggerFavorite}
          onEdit={() => setShowFavoritesEditor(true)}
        />

        {quotaNotice && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-3.5 text-xs text-rose-100">
            <p className="font-bold text-rose-300">Tuya control quota</p>
            <p className="mt-1 leading-relaxed">{quotaNotice}</p>
            <p className="mt-1.5 text-[11px] text-rose-200/70">
              Reading devices stays unlimited. Raise the limit under Tuya IoT Platform → Cloud → Cloud
              Services → IoT Core.
            </p>
            <button
              onClick={() => setQuotaNotice(null)}
              className="mt-2 rounded-lg bg-rose-500/20 px-2.5 py-1 font-semibold text-rose-200 hover:bg-rose-500/30"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Real-time Summary Bar */}
        <WallSummaryBar
          devices={devices}
          settings={settings}
          onMasterLightToggle={handleMasterLightToggle}
        />

        {/* Room Navigation Tabs */}
        <RoomTabs
          rooms={rooms}
          selectedRoom={selectedRoom}
          devices={devices}
          onSelectRoom={setSelectedRoom}
        />

        {/* Devices Wall Grid */}
        {isEditingLayout && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 text-xs text-amber-100">
            <strong className="text-amber-300">Arrange mode.</strong> Drag a tile onto another to reposition it, or
            use the <ChevronLeft className="inline w-3 h-3" /> <ChevronRight className="inline w-3 h-3" /> arrows on
            each tile (best on a touchscreen). Order saves automatically. Tap <strong>Done</strong> when finished.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {filteredDevices.map((device, index) => (
            <div
              key={device.id}
              draggable={isEditingLayout}
              onDragStart={() => setDragId(device.id)}
              onDragOver={(e) => isEditingLayout && e.preventDefault()}
              onDrop={(e) => {
                if (!isEditingLayout || !dragId) return;
                e.preventDefault();
                moveDevice(dragId, device.id);
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
              data-testid={`device-card-${device.id}`}
              data-card-size={device.integration?.cardSize || "standard"}
              className={`relative min-w-0 transition-all ${cardSpanClass(device.integration?.cardSize)} ${
                isEditingLayout ? "cursor-grab active:cursor-grabbing" : ""
              } ${dragId === device.id ? "opacity-40 scale-95" : ""}`}
            >
              {isEditingLayout && (
                <div className="absolute -top-2 left-1/2 z-20 flex -translate-x-1/2 gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      nudgeDevice(device.id, -1);
                    }}
                    disabled={index === 0}
                    className="rounded-lg border border-amber-400/60 bg-slate-900 p-1 text-amber-300 shadow-lg disabled:opacity-30"
                    aria-label="Move left"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      nudgeDevice(device.id, 1);
                    }}
                    disabled={index === filteredDevices.length - 1}
                    className="rounded-lg border border-amber-400/60 bg-slate-900 p-1 text-amber-300 shadow-lg disabled:opacity-30"
                    aria-label="Move right"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className={`${device.integration?.cardSize === "large" ? "h-full" : ""} ${isEditingLayout ? "pointer-events-none ring-2 ring-amber-500/40 rounded-3xl" : ""}`}>
                <DeviceTile
                  device={device}
                  settings={settings}
                  roomName={rooms.find((r) => r.id === device.roomId)?.name || "Unassigned"}
                  pending={pendingDevices.has(device.id)}
                  onCardChanged={(next) => setDevices(old=>old.map(d=>d.id===next.id?next:d))}
                  onCardRemoved={(id) => {setDevices(old=>old.filter(d=>d.id!==id));if(activeModal?.device?.id===id)setActiveModal(null);}}
                  onTogglePower={handleTogglePower}
                  onOpenModal={handleOpenDeviceModal}
                  onQuickUpdate={handleUpdateDeviceState}
                />
              </div>
            </div>
          ))}
        </div>

        {filteredDevices.length === 0 && (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm">No devices found in this room.</p>
            <button
              onClick={() => setActiveModal({ type: "add_device" })}
              className="mt-3 px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors"
            >
              + Add a device to {rooms.find((r) => r.id === selectedRoom)?.name}
            </button>
          </div>
        )}
      </main>

      {/* Screensaver Component */}
      {isScreensaver && (
        <ScreenSaver
          settings={settings}
          devices={devices}
          onWake={() => setIsScreensaver(false)}
        />
      )}

      {/* Modals */}
      {activeModal?.type === "controls" && activeModal.device && (
        <DeviceControlsModal
          device={devices.find((d) => d.id === activeModal.device?.id) || activeModal.device}
          roomName={rooms.find((r) => r.id === (devices.find((d) => d.id === activeModal.device?.id) || activeModal.device)!.roomId)?.name || "Unassigned"}
          scenes={scenes}
          onClose={() => setActiveModal(null)}
          onUpdate={handleUpdateDeviceState}
          onRefresh={handleRefreshDevice}
          onOpenDevice={(id) => { const device = devices.find((d) => d.id === id); if (device) setActiveModal({ type: "controls", device }); }}
          onScene={handleTriggerScene}
          tempUnit={settings.tempUnit}
          onDeviceChange={(next) => setDevices((old) => old.map((device) => device.id === next.id ? next : device))}
          onCardRemoved={(id) => {setDevices(old=>old.filter(d=>d.id!==id));setActiveModal(null);}}
        />
      )}
      {activeModal?.type === "light" && activeModal.device && (
        <LightControlModal
          device={activeModal.device}
          onClose={() => setActiveModal(null)}
          onUpdate={handleUpdateDeviceState}
        />
      )}

      {activeModal?.type === "climate" && activeModal.device && (
        <ClimateControlModal
          device={activeModal.device}
          tempUnit={settings.tempUnit}
          onClose={() => setActiveModal(null)}
          onUpdate={handleUpdateDeviceState}
        />
      )}

      {activeModal?.type === "curtain" && activeModal.device && (
        <CurtainControlModal
          device={activeModal.device}
          onClose={() => setActiveModal(null)}
          onUpdate={handleUpdateDeviceState}
        />
      )}

      {activeModal?.type === "lock" && activeModal.device && (
        <DoorLockModal
          device={activeModal.device}
          lockPin={settings.lockPin}
          onClose={() => setActiveModal(null)}
          onUpdate={handleUpdateDeviceState}
        />
      )}

      {activeModal?.type === "camera" && activeModal.device && (
        <CameraFeedModal
          device={activeModal.device}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === "security" && (
        <SecurityModal
          currentMode={settings.securityMode}
          lockPin={settings.lockPin}
          onClose={() => setActiveModal(null)}
          onUpdateMode={(mode) => handleUpdateSettings({ securityMode: mode })}
        />
      )}

      {activeModal?.type === "add_device" && (
        <AddDeviceModal
          rooms={rooms}
          onClose={() => setActiveModal(null)}
          onAdd={handleAddDevice}
        />
      )}

      {activeModal?.type === "settings" && (
        <SettingsModal
          initialTab={settingsTab}
          settings={settings}
          onClose={() => setActiveModal(null)}
          onUpdateSettings={handleUpdateSettings}
          onResetData={handleResetData}
        />
      )}

      {activeModal?.type === "logs" && (
        <ActivityLogsModal onClose={() => setActiveModal(null)} />
      )}

      {showRoomManager && (
        <RoomManagerModal
          rooms={rooms}
          devices={devices}
          onClose={() => setShowRoomManager(false)}
          onCreate={handleCreateRoom}
          onRename={handleRenameRoom}
          onDelete={handleDeleteRoom}
          onMoveDevices={handleMoveDevices}
        />
      )}

      {showFavoritesEditor && (
        <FavoritesEditorModal
          favorites={favorites}
          devices={devices}
          rooms={rooms}
          onClose={() => setShowFavoritesEditor(false)}
          onSave={handleSaveFavorites}
        />
      )}
    </div>
  );
}
