import {syncedIntegration} from "./sync-preferences";
import { fetchTuyaChannelNames } from "./channel-names";
import { applyChannelLabels } from "./device-preferences";
import "server-only";
import { db } from "@/db";
import { devices, rooms, scenes, activityLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { tuyaCloudRequest } from "./tuya";
import { getSmartLifeRoom, getSmartLifeScenes, getSmartLifeSpecification, listSmartLifeDevices, type SmartLifeDevice } from "./smartlife";
import { mapTuyaCategory } from "./tuya-mapping";
import { stateFromSpecification, valuesOf, powerFunctions } from "./device-capabilities";
import { getInfraredAcState, getInfraredBinding, getInfraredRemotes } from "./infrared";
import type { DeviceIntegration, SceneIntegration, TuyaSpecification } from "@/types/integration";

const safeId = (value: string) => value.replace(/[^\w-]/g, "_");
export const remoteRoomId = (home: string, room: string) => `tuya_room_${safeId(home)}_${safeId(room)}`;
export function sceneDeviceIds(actions: unknown): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    for (const [key, value] of Object.entries(v)) {
      if (/^(entity_?id|device_?id|dev_?id)$/i.test(key) && typeof value === "string") ids.add(value);
      else if (typeof value === "object") walk(value, depth + 1);
    }
  };
  walk(actions, 0); return [...ids];
}
function roomIcon(name: string) {
  if (/bed|master|dressing/i.test(name)) return "BedDouble";
  if (/kitchen|dining/i.test(name)) return "UtensilsCrossed";
  if (/bath|wash/i.test(name)) return "Droplets";
  if (/roof|garden|balcony|terrace/i.test(name)) return "Flower2";
  if (/living|reception|lounge/i.test(name)) return "Sofa";
  return "Home";
}
function safeProblem(e: unknown) {
  const message = e instanceof Error ? e.message : "Metadata unavailable";
  return message.includes("Failed query") ? "Database update failed" : message.slice(0, 240);
}

/** Resumable small batches keep a 100+ device home within serverless timeouts. */
export async function syncSmartLifeCatalog(offset = 0, restoreRooms = false) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 20000) throw new Error("Invalid sync offset.");
  const catalog = await listSmartLifeDevices();
  const sorted = [...catalog.devices].sort((a,b) => a.id.localeCompare(b.id));
  const selected = sorted.slice(offset, offset + 6);
  const warnings: Array<{ device: string; reason: string }> = [];
  let added = 0; let updated = 0; let importedScenes = 0; let importedRooms = 0;

  if (offset === 0) {
    for (const [homeIndex, home] of catalog.homes.entries()) {
      try {
        const listing = await tuyaCloudRequest<{ rooms: Array<{ room_id: string | number; name: string }> }>("GET", `/v1.0/homes/${encodeURIComponent(String(home.ownerId))}/rooms`);
        if (!Array.isArray(listing.rooms)) throw new Error("Tuya did not return a home-room list.");
        for (const [index, room] of listing.rooms.entries()) {
          const id = remoteRoomId(String(home.ownerId), String(room.room_id));
          const row = { name: room.name, icon: roomIcon(room.name), sortOrder: homeIndex * 10000 + index,
            integration: { source: "smartlife" as const, homeId: String(home.ownerId), homeName: home.name, roomId: String(room.room_id) } };
          await db.insert(rooms).values({ id, ...row }).onConflictDoUpdate({ target: rooms.id, set: row });
          importedRooms++;
        }
      } catch (error) { warnings.push({ device: home.name, reason: `Home-room list unavailable; retaining per-device room mapping. ${safeProblem(error)}` }); }
      try {
        const sceneList = await getSmartLifeScenes(String(home.ownerId));
        if (!Array.isArray(sceneList)) throw new Error("Tuya scene list was unavailable.");
        for (const scene of sceneList) {
          if (!scene.scene_id || !scene.name) continue;
          const id = `tuya_scene_${safeId(String(home.ownerId))}_${safeId(scene.scene_id)}`;
          const integration: SceneIntegration = { source:"smartlife", homeId:String(home.ownerId), sceneId:scene.scene_id, enabled:scene.enabled !== false, deviceIds:sceneDeviceIds(scene.actions) };
          const data = { name:scene.name, description:`Tuya Tap-to-Run · ${home.name}`, icon:"Sparkles", gradient:"from-teal-500 to-cyan-600", actions:[], sortOrder:importedScenes, integration };
          await db.insert(scenes).values({ id, ...data }).onConflictDoUpdate({ target:scenes.id, set:data });
          importedScenes++;
        }
      } catch (e) { warnings.push({ device:home.name, reason:`Scenes: ${safeProblem(e)}` }); }
    }
  }
  const savedScenes = await db.select().from(scenes);

  async function syncOne(cloud: SmartLifeDevice) {
    const [old] = await db.select().from(devices).where(eq(devices.tuyaDeviceId, cloud.id)).limit(1);
    const homeId = cloud.homeId || "unknown";
    const homeName = cloud.homeName || "Tuya home";
    const [roomResult, specResult] = await Promise.allSettled([getSmartLifeRoom(cloud.id), getSmartLifeSpecification(cloud.id)]);
    const room = roomResult.status === "fulfilled" ? roomResult.value : null;
    const roomKnown = roomResult.status === "fulfilled";
    let remoteId = room?.id === undefined ? "unassigned" : String(room.id);
    let roomId = remoteRoomId(homeId, remoteId);
    let roomName = room?.name || (roomKnown ? "Unassigned in Tuya" : "Room unavailable in Tuya");
    let inherited = false;
    if (roomKnown && !room?.id && old?.integration?.infrared) {
      const [hub] = await db.select().from(devices).where(eq(devices.tuyaDeviceId, old.integration.infrared.hubId)).limit(1);
      if (hub?.integration?.roomId && hub.integration.roomId !== "unassigned") {
        const [hubRoom] = await db.select().from(rooms).where(eq(rooms.id, hub.roomId)).limit(1);
        if (hubRoom) { remoteId = hub.integration.roomId; roomId = hubRoom.id; roomName = hubRoom.name; inherited = true; }
      }
    }
    const [savedRoom] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    const roomOrder = savedRoom?.sortOrder ?? (catalog.homes.findIndex((h) => String(h.ownerId) === homeId) * 10000 + Number(room?.displayOrder ?? 999));
    await db.insert(rooms).values({ id:roomId, name:roomName, icon:roomIcon(roomName), sortOrder:roomOrder, integration:{ source:"smartlife", homeId, homeName, roomId:remoteId } })
      .onConflictDoUpdate({target:rooms.id, set:{name:roomName, sortOrder:roomOrder, integration:{source:"smartlife",homeId,homeName,roomId:remoteId}}});
    if (!roomKnown) warnings.push({device:cloud.name,reason:"Tuya did not return this device's room; it was not guessed from its name."});
    const spec: TuyaSpecification = specResult.status === "fulfilled" ? specResult.value : { functions:[],status:[] };
    if (specResult.status === "rejected") warnings.push({device:cloud.name,reason:`Capabilities: ${safeProblem(specResult.reason)}`});
    const presentation = mapTuyaCategory(cloud.category);
    const state = stateFromSpecification(spec, cloud.status, cloud.category, presentation.category);
    const integration: DeviceIntegration = {
      ...(old?.integration || {}), source:"smartlife", category:cloud.category, homeId, homeName, roomId:remoteId,
      roomSynced:roomKnown, roomInheritedFromHub:inherited, functionsFetchedAt:new Date().toISOString(), functions:spec.functions || [], statusSchema:spec.status || [], reported:valuesOf(cloud.status), syncedAt:new Date().toISOString(),accountPresent:true,
      capabilityError: specResult.status === "rejected" ? safeProblem(specResult.reason) : undefined,
      sceneIds: savedScenes.filter((s) => s.integration?.source === "smartlife" && s.integration.deviceIds?.includes(cloud.id)).map((s) => s.id),
    };
    if (powerFunctions(spec.functions || []).length) {
      try {
        integration.tuyaChannelNames = await fetchTuyaChannelNames(cloud.id, spec.functions || []);
        integration.channelNamesSyncedAt = new Date().toISOString();
        integration.channelNamesError = undefined;
      } catch {
        integration.channelNamesError = "Tuya did not return gang names in this sync. Existing labels and local overrides are preserved.";
      }
    }
    // Preserve an existing IR binding from its hub's catalogue. Standard DP lists
    // for virtual IR appliances are normally empty; that is NOT a power switch.
    if (integration.infrared?.available) {
      state.readOnly = false; delete state.readOnlyReason;
      if (integration.infrared.categoryId === 5) {
        try { Object.assign(state, await getInfraredAcState(integration.infrared)); }
        catch { warnings.push({device:cloud.name,reason:"IR last-command status was unavailable. No appliance state has been assumed."}); }
      }
    }
    const fields = {
      name:cloud.name || cloud.product_name || "Tuya device", category:integration.infrared ? integration.infrared.categoryId === 5 ? "climate" : "remote" : presentation.category, icon:old?.icon || presentation.icon,
      roomId:old?.integration?.roomOverride && !restoreRooms ? old.roomId : roomId,
      protocol:"Smart Life", online:cloud.online ?? false,
      state:applyChannelLabels(state,integration), integration: { ...integration, roomOverride:restoreRooms ? false : integration.roomOverride },
      sortOrder:old?.integration?.layoutOverride ? old.sortOrder : (cloud.displayOrder ?? offset), updatedAt:new Date(),
    };
    if (old) { await db.update(devices).set({...fields,integration:syncedIntegration(fields.integration)}).where(eq(devices.id,old.id)); updated++; }
    else { await db.insert(devices).values({ id:`tuya_${safeId(cloud.id)}`, tuyaDeviceId:cloud.id, ...fields }); added++; }

    if (cloud.category === "wnykq") {
      const hubRecordId = old?.id || `tuya_${safeId(cloud.id)}`;
      try {
        const remotes = await getInfraredRemotes(cloud.id);
        const links: Array<{id:string;name:string}> = [];
        for (const remote of remotes) {
          try {
            const binding = await getInfraredBinding(cloud.id, remote);
            const [existingRemote] = await db.select().from(devices).where(eq(devices.tuyaDeviceId,remote.remote_id)).limit(1);
            const remoteCloud = sorted.find((d) => d.id === remote.remote_id);
            let remoteState = existingRemote?.state || {};
            if (binding.categoryId === 5) {
              try { remoteState = { ...remoteState, ...await getInfraredAcState(binding) }; } catch { /* IR status is optional and is last-command state, not sensor feedback. */ }
            }
            const id = existingRemote?.id || `tuya_${safeId(remote.remote_id)}`;
            const inherit = !existingRemote?.integration?.roomId || existingRemote.integration.roomId === "unassigned" || existingRemote.integration.roomInheritedFromHub;
            const keepManual = existingRemote?.integration?.roomOverride && !restoreRooms;
            const remoteIntegration: DeviceIntegration = { ...(existingRemote?.integration || {}), source:"smartlife", category:remoteCloud?.category || (binding.categoryId === 5 ? "infrared_ac" : "infrared_remote"), homeId, homeName,
              ...(inherit && !keepManual ? { roomId:remoteId, roomInheritedFromHub:true } : {}),
              infrared:binding, syncedAt:new Date().toISOString(), sceneIds:savedScenes.filter((s)=>s.integration?.deviceIds?.includes(remote.remote_id)).map((s)=>s.id) };
            const data = { name:remoteCloud?.name || remote.remote_name, category:binding.categoryId === 5 ? "climate" : "remote", icon:binding.categoryId === 5 ? "AirVent" : "Tv",
              roomId:inherit && !keepManual ? roomId : existingRemote?.roomId || roomId, protocol:"Smart Life", online:cloud.online ?? false,
              state:{...remoteState,readOnly:false,readOnlyReason:undefined}, integration:remoteIntegration, updatedAt:new Date() };
            await db.insert(devices).values({ id,tuyaDeviceId:remote.remote_id,sortOrder:existingRemote?.sortOrder ?? offset,...data }).onConflictDoUpdate({target:devices.id,set:{...data,integration:syncedIntegration(data.integration)}});
            links.push({id,name:data.name});
          } catch(e) { warnings.push({device:remote.remote_name,reason:`IR keys unavailable: ${safeProblem(e)}. Use an imported Tuya scene if available.`}); }
        }
        const [latestHub] = await db.select().from(devices).where(eq(devices.id,hubRecordId));
        await db.update(devices).set({ integration:{...latestHub.integration!,linkedRemotes:links} }).where(eq(devices.id,hubRecordId));
      } catch(e) { warnings.push({device:cloud.name,reason:`IR service: ${safeProblem(e)}. The Smart Life sharing API alone does not expose IR remote commands.`}); }
    }
  }
  // Two devices at a time; read-only metadata calls are bounded and resumable.
  for (let i = 0; i < selected.length; i += 2) {
    await Promise.all(selected.slice(i,i+2).map(async (cloud) => {
      try { await syncOne(cloud); } catch(e) { warnings.push({device:cloud.name,reason:safeProblem(e)}); }
    }));
  }
  const nextOffset = offset + selected.length;
  const done = nextOffset >= sorted.length;
  if (done) {
    // Only reconcile absence after a fully returned home catalogue. Offline
    // devices are still in the list and are not treated as removed.
    const presentIds = new Set(sorted.map(d=>d.id));
    const currentRows = await db.select().from(devices);
    for (const row of currentRows) {
      if (row.integration?.source !== "smartlife" || !row.tuyaDeviceId) continue;
      const hubStillLinked = row.integration?.infrared && currentRows.some(h=>h.tuyaDeviceId===row.integration?.infrared?.hubId && presentIds.has(h.tuyaDeviceId||"") && h.integration?.linkedRemotes?.some(r=>r.id===row.id));
      const present = presentIds.has(row.tuyaDeviceId) || Boolean(hubStillLinked);
      if (row.integration.accountPresent !== present) await db.update(devices).set({
        integration: sql`coalesce(${devices.integration}, '{}'::jsonb) || ${JSON.stringify({accountPresent:present})}::jsonb`,
        ...(!present ? { online:false } : {}),
      }).where(eq(devices.id,row.id));
    }
    await db.insert(activityLogs).values({ deviceName:"Tuya account mirror", action:`Device metadata import reached ${sorted.length} devices across ${catalog.homes.length} homes. Rooms, writable functions and Tap-to-Run scenes imported; no physical commands sent.`, type:"system",source:"Smart Life" });
  }
  return { total:sorted.length, processed:nextOffset, nextOffset:done ? null : nextOffset, done, homes:catalog.homes.length, added, updated, importedScenes, importedRooms, warnings };
}
