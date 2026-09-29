import {isCardHidden} from "./card-preferences";
import { applyChannelLabels } from "./device-preferences";
import "server-only";
import { db } from "@/db";
import { devices, rooms, scenes } from "@/db/schema";
import { asc } from "drizzle-orm";
import { isCloudDevice } from "./device-capabilities";

// Only these known starter records are hidden once a real account is present.
// No remote devices, user-created rooms or scenes are deleted.
export const DEMO_DEVICES = new Set([
  "dev_light_ceiling_living","dev_light_strip_tv","dev_ac_living","dev_curtain_living","dev_socket_media","dev_vacuum_roborock",
  "dev_light_bed_pendant","dev_ac_bedroom","dev_curtain_bedroom","dev_air_purifier_bed","dev_light_kitchen_island","dev_socket_coffee",
  "dev_light_balcony","dev_curtain_balcony_awning","dev_door_lock","dev_camera_doorbell","dev_sensor_motion",
]);
const DEMO_SCENES = new Set(["scene_good_morning","scene_movie_night","scene_cozy_dinner","scene_away_guard","scene_relax_reading","scene_all_off"]);
const DEMO_ROOMS = new Set(["living_room","bedroom","kitchen","balcony","entrance"]);
export async function getDashboardCatalog() {
  const [allDevices, allRooms, allScenes] = await Promise.all([
    db.select().from(devices).orderBy(asc(devices.sortOrder),asc(devices.id)),
    db.select().from(rooms).orderBy(asc(rooms.sortOrder),asc(rooms.id)),
    db.select().from(scenes).orderBy(asc(scenes.sortOrder),asc(scenes.id)),
  ]);
  const realHome = allDevices.some(isCloudDevice);
  const visibleDevices = (realHome ? allDevices.filter((d) => !DEMO_DEVICES.has(d.id) || isCloudDevice(d)) : allDevices).filter(d=>!isCardHidden(d));
  const usedRooms = new Set(visibleDevices.map((d) => d.roomId));
  return {
    devices:visibleDevices.map((d) => ({ ...d, state:applyChannelLabels(d.state,d.integration) })),
    rooms:realHome ? allRooms.filter((r) => r.id === "all" || ((r.integration?.roomId !== "unassigned" || usedRooms.has(r.id)) && (!DEMO_ROOMS.has(r.id) || usedRooms.has(r.id)))) : allRooms,
    scenes:realHome ? allScenes.filter((s) => !DEMO_SCENES.has(s.id) || s.integration?.source === "smartlife" || s.integration?.source === "home-assistant") : allScenes,
    demoHidden:realHome,
  };
}
