import { getDashboardCatalog } from "@/lib/dashboard-catalog";
import { db } from "@/db";
import { devices, rooms, scenes, wallSettings } from "@/db/schema";
import { ensureDatabaseSeeded } from "@/lib/seed-data";
import { TuyaDashboard } from "@/components/TuyaDashboard";
import { asc } from "drizzle-orm";
import { SmartDevice, Room, SmartScene, WallSettings } from "@/types/smart-home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Ensure default Tuya devices, scenes, and settings exist
  await ensureDatabaseSeeded();

  const [catalog, settingRows] = await Promise.all([
    getDashboardCatalog(), db.select().from(wallSettings).limit(1),
  ]);
  const { devices: deviceRows, rooms: roomRows, scenes: sceneRows } = catalog;

  const storedSettings = settingRows[0];
  // Never serialize legacy database secret fields into the client dashboard.
  const { tuyaAccessSecret: _tuyaAccessSecret, ...safeStoredSettings } = storedSettings || {};

  const defaultSetting: WallSettings = (storedSettings ? safeStoredSettings : undefined) as WallSettings || {
    id: "default_panel",
    panelName: "Tuya Smart Control Panel T6E",
    theme: "midnight",
    tempUnit: "C",
    screenSaverTimeout: 60,
    screenSaverType: "digital_clock",
    soundFeedback: true,
    kioskScale: 100,
    lockPin: "1234",
    tuyaAccessId: "",
    tuyaEndpoint: "https://openapi.tuyaus.com",
    outdoorCity: "Smart Living HQ",
    outdoorTemp: 22.5,
    outdoorCondition: "Clear & Pleasant",
    outdoorHumidity: 46,
    outdoorAqi: 24,
    securityMode: "disarmed",
  };

  return (
    <TuyaDashboard
      initialDevices={deviceRows as unknown as SmartDevice[]}
      initialRooms={roomRows as Room[]}
      initialScenes={sceneRows as unknown as SmartScene[]}
      initialSettings={defaultSetting}
    />
  );
}
