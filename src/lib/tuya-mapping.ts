import "server-only";

import { db } from "@/db";
import { activityLogs, devices } from "@/db/schema";
import { DeviceCategory, DeviceState } from "@/types/smart-home";
import { eq } from "drizzle-orm";
import { discoverTuyaDevices, getTuyaDeviceStatus, TuyaCloudDevice, TuyaStatusItem } from "./tuya";

type ImportedDevice = {
  category: DeviceCategory;
  icon: string;
};

/**
 * Tuya product category codes -> dashboard presentation.
 * Codes verified against live Tuya Cloud responses; comments give the
 * original Tuya meaning because several codes are non-obvious.
 */
const categoryMap: Record<string, ImportedDevice> = {
  // Lighting
  dj: { category: "light", icon: "Lightbulb" }, // light / bulb
  dd: { category: "light", icon: "LampCeiling" }, // light strip
  xdd: { category: "light", icon: "SunMedium" }, // ceiling light
  fwd: { category: "light", icon: "LampCeiling" }, // ambiance light
  dc: { category: "light", icon: "Sparkles" }, // string light

  // Switches, relays, sockets, breakers, metering
  kg: { category: "socket", icon: "Zap" }, // switch
  cz: { category: "socket", icon: "PlugZap" }, // socket / outlet
  pc: { category: "socket", icon: "PlugZap" }, // power strip
  xxj: { category: "socket", icon: "PlugZap" }, // diffuser / plug-in
  tdq: { category: "socket", icon: "Zap" }, // breaker / switch module (NOT climate)
  dlq: { category: "socket", icon: "Zap" }, // circuit breaker w/ metering
  zndb: { category: "socket", icon: "Gauge" }, // smart energy meter
  wkcz: { category: "socket", icon: "PlugZap" }, // temp-controlled socket

  // Curtains / blinds
  cl: { category: "curtain", icon: "Blinds" }, // curtain motor
  clkg: { category: "curtain", icon: "Blinds" }, // curtain switch
  jdcljqr: { category: "curtain", icon: "Blinds" }, // curtain robot

  // Climate
  kt: { category: "climate", icon: "AirVent" }, // air conditioner
  infrared_ac: { category: "climate", icon: "AirVent" }, // IR-controlled AC
  wk: { category: "climate", icon: "ThermometerSnowflake" }, // thermostat
  wkf: { category: "climate", icon: "ThermometerSnowflake" }, // radiator valve
  rs: { category: "climate", icon: "Flame" }, // water heater
  qn: { category: "climate", icon: "Flame" }, // heater

  // Air movement / quality
  fs: { category: "fan", icon: "Wind" }, // fan
  fsd: { category: "fan", icon: "Wind" }, // ceiling fan light
  kj: { category: "fan", icon: "Wind" }, // air purifier
  cs: { category: "fan", icon: "Droplets" }, // dehumidifier

  // Cameras
  sp: { category: "camera", icon: "Camera" }, // smart camera

  // Locks
  mc: { category: "lock", icon: "Lock" }, // door/window controller
  ms: { category: "lock", icon: "Lock" }, // door lock
  jtmspro: { category: "lock", icon: "Lock" }, // smart lock pro
  bxx: { category: "lock", icon: "Lock" }, // safe box

  // Sensors
  pir: { category: "sensor", icon: "Eye" }, // motion sensor
  mcs: { category: "sensor", icon: "Eye" }, // contact sensor
  rqbj: { category: "sensor", icon: "Flame" }, // gas alarm
  ywbj: { category: "sensor", icon: "Flame" }, // smoke alarm
  sj: { category: "sensor", icon: "Droplets" }, // water leak
  wsdcg: { category: "sensor", icon: "Gauge" }, // temp/humidity
  ldcg: { category: "sensor", icon: "Gauge" }, // illuminance
  hps: { category: "sensor", icon: "Eye" }, // human presence
  sos: { category: "sensor", icon: "Eye" }, // SOS button
  wg2: { category: "sensor", icon: "Radio" }, // gateway / hub
  zigbee: { category: "sensor", icon: "Radio" }, // gateway

  // IR blasters / universal remotes
  wnykq: { category: "sensor", icon: "Radio" }, // universal IR remote
  infrared_tv: { category: "socket", icon: "Tv" }, // IR TV
  infrared_fan: { category: "fan", icon: "Wind" }, // IR fan
  qt: { category: "socket", icon: "Tv" }, // set-top box

  // Robots
  sd: { category: "vacuum", icon: "Disc3" }, // robot vacuum
  sdj: { category: "vacuum", icon: "Disc3" },
  xdj: { category: "vacuum", icon: "Disc3" },
};

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findStatus(status: TuyaStatusItem[], keys: string[]) {
  return status.find((item) => keys.includes(item.code))?.value;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "on", "open", "1"].includes(value.toLowerCase());
  return Boolean(value);
}

export function mapTuyaCategory(category?: string): ImportedDevice {
  return categoryMap[(category || "").toLowerCase()] || { category: "sensor", icon: "Sparkles" };
}

/** DP codes that look like switches but are settings, not user-facing channels. */
const NON_CHANNEL_SWITCHES = new Set([
  "switch_backlight",
  "switch_inching",
  "switch_interlock",
  "switch_type",
  "switch_alarm_sound",
  "switch_alarm_light",
  "switch_overcharge",
  "child_lock",
]);

/**
 * Derive independently controllable boolean channels from the device's real DPs.
 *
 * A 3-gang wall switch reports switch_1/switch_2/switch_3. Previously only
 * switch_1 was mapped, so two thirds of the device was invisible and
 * uncontrollable. Multi-motor curtain modules behave the same way.
 */
export function extractChannels(status: TuyaStatusItem[]): DeviceState["channels"] {
  const gangs = status
    .filter((s) => /^switch_\d+$/.test(s.code) && typeof s.value === "boolean")
    .sort((a, b) => Number(a.code.split("_")[1]) - Number(b.code.split("_")[1]));

  if (gangs.length > 1) {
    return gangs.map((g) => ({
      code: g.code,
      label: `Gang ${g.code.split("_")[1]}`,
      isOn: Boolean(g.value),
    }));
  }

  // Devices whose only switches are non-numbered but plural (rare).
  const plain = status.filter(
    (s) =>
      /^switch(_[a-z0-9]+)?$/.test(s.code) &&
      typeof s.value === "boolean" &&
      !NON_CHANNEL_SWITCHES.has(s.code)
  );
  if (plain.length > 1) {
    return plain.map((p) => ({ code: p.code, label: p.code.replace(/_/g, " "), isOn: Boolean(p.value) }));
  }

  return undefined;
}

export function mapTuyaStatusToDashboard(status: TuyaStatusItem[], category: DeviceCategory): DeviceState {
  const state: DeviceState = {};

  const channels = extractChannels(status);
  if (channels && channels.length > 0) {
    state.channels = channels;
    // Aggregate power reflects "any channel on".
    state.isOn = channels.some((c) => c.isOn);
  }

  const isOn = findStatus(status, ["switch_led", "switch_1", "switch", "switch_usb1", "power"]);
  if (isOn !== undefined && state.isOn === undefined) state.isOn = booleanValue(isOn);

  const brightness = numberValue(findStatus(status, ["bright_value_v2", "bright_value", "bright"]));
  if (brightness !== undefined) {
    state.brightness = brightness > 100 ? Math.round((brightness / 1000) * 100) : Math.round(brightness);
  }

  const colorTemp = numberValue(findStatus(status, ["temp_value_v2", "temp_value", "colour_temp"]));
  if (colorTemp !== undefined) {
    // Tuya lights often report a 0-1000 range; approximate it to Kelvin for our dashboard.
    state.colorTemp = colorTemp <= 1000 ? Math.round(2700 + (colorTemp / 1000) * 3800) : colorTemp;
  }

  const targetTemperature = numberValue(findStatus(status, ["temp_set", "temp_set_f", "target_temperature"]));
  if (targetTemperature !== undefined) state.targetTemp = targetTemperature > 60 ? targetTemperature / 10 : targetTemperature;

  const currentTemperature = numberValue(findStatus(status, ["temp_current", "va_temperature", "temperature", "temp"]));
  if (currentTemperature !== undefined) state.currentTemp = currentTemperature > 60 ? currentTemperature / 10 : currentTemperature;

  const humidity = numberValue(findStatus(status, ["humidity", "va_humidity", "humidity_value"]));
  if (humidity !== undefined) state.humidity = humidity > 100 ? humidity / 10 : humidity;

  const rawMode = findStatus(status, ["mode", "work_mode", "mode_type"]);
  if (typeof rawMode === "string" && ["cool", "heat", "auto", "dry", "fan"].includes(rawMode)) {
    state.mode = rawMode as DeviceState["mode"];
  }

  const rawFanSpeed = findStatus(status, ["fan_speed_enum", "fan_speed", "windspeed"]);
  if (typeof rawFanSpeed === "string" && ["auto", "low", "mid", "high"].includes(rawFanSpeed)) {
    state.fanSpeed = rawFanSpeed as DeviceState["fanSpeed"];
  }

  const curtainPosition = numberValue(findStatus(status, ["percent_state", "percent_control", "control_percent"]));
  if (curtainPosition !== undefined) {
    state.curtainPosition = curtainPosition;
    state.curtainState = curtainPosition === 0 ? "closed" : curtainPosition === 100 ? "open" : "paused";
  }

  const curtainControl = findStatus(status, ["control", "control_back", "control_motor"]);
  if (typeof curtainControl === "string") {
    if (curtainControl === "open") state.curtainState = "open";
    if (curtainControl === "close") state.curtainState = "closed";
    if (curtainControl === "stop") state.curtainState = "paused";
  }

  const powerWatts = numberValue(findStatus(status, ["cur_power", "power", "add_ele"]));
  if (powerWatts !== undefined && category === "socket") state.powerWatts = powerWatts > 10000 ? powerWatts / 10 : powerWatts;

  const battery = numberValue(findStatus(status, ["battery_percentage", "battery", "battery_state"]));
  if (battery !== undefined) state.battery = battery;

  const lockState = findStatus(status, ["closed_open", "lock", "door_lock"]);
  if (lockState !== undefined && category === "lock") {
    state.isLocked = typeof lockState === "string" ? !["open", "unlock", "unlocked"].includes(lockState) : Boolean(lockState);
  }

  const vacuumStatus = findStatus(status, ["status", "clean_mode", "robot_status"]);
  if (typeof vacuumStatus === "string" && ["docked", "cleaning", "paused", "returning"].includes(vacuumStatus)) {
    state.vacuumStatus = vacuumStatus as DeviceState["vacuumStatus"];
  }

  const pm25 = numberValue(findStatus(status, ["pm25", "pm25_value"]));
  if (pm25 !== undefined) state.pm25 = pm25;

  const co2 = numberValue(findStatus(status, ["co2", "co2_value"]));
  if (co2 !== undefined) state.co2 = co2;

  const motion = findStatus(status, ["pir", "motion", "motion_state"]);
  if (motion !== undefined) state.motionDetected = booleanValue(motion);

  // Flag devices that genuinely expose nothing commandable, so the tile can say
  // why instead of rendering an empty card.
  const hasControl =
    state.channels !== undefined ||
    state.isOn !== undefined ||
    state.brightness !== undefined ||
    state.targetTemp !== undefined ||
    state.curtainPosition !== undefined ||
    state.isLocked !== undefined ||
    state.fanSpeed !== undefined;

  if (!hasControl) {
    state.readOnly = true;
    state.readOnlyReason =
      status.length === 0
        ? "Infrared device — controlled through Tuya's IR remote API, not standard commands"
        : "This device reports status only and exposes no commandable controls";
  }

  return state;
}

function makeImportedDeviceId(tuyaDeviceId: string) {
  return `tuya_${tuyaDeviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function loadStatus(device: TuyaCloudDevice) {
  // The app-account endpoint already includes status; avoid a redundant call.
  if (Array.isArray(device.status) && device.status.length > 0) {
    return device.status;
  }
  try {
    return await getTuyaDeviceStatus(device.id);
  } catch {
    // A device list can include offline devices for which a status call fails.
    return [] as TuyaStatusItem[];
  }
}

/** Import/refresh up to 100 devices bound to the Tuya project. */
export async function syncTuyaDevices() {
  const discovery = await discoverTuyaDevices();
  const cloudDevices = discovery.devices;
  let added = 0;
  let updated = 0;
  let unavailable = 0;

  // Keep Cloud API requests below aggressive burst limits while still importing promptly.
  for (const cloudDevice of cloudDevices) {
    const status = await loadStatus(cloudDevice);
    const presentation = mapTuyaCategory(cloudDevice.category);
    const mappedState = mapTuyaStatusToDashboard(status, presentation.category);

    if (!cloudDevice.online) unavailable += 1;

    const existing = await db
      .select()
      .from(devices)
      .where(eq(devices.tuyaDeviceId, cloudDevice.id))
      .limit(1);

    if (existing[0]) {
      await db
        .update(devices)
        .set({
          name: cloudDevice.name || existing[0].name,
          category: presentation.category,
          icon: presentation.icon,
          online: cloudDevice.online ?? false,
          protocol: "Tuya Cloud",
          state: { ...existing[0].state, ...mappedState },
          updatedAt: new Date(),
        })
        .where(eq(devices.id, existing[0].id));
      updated += 1;
    } else {
      await db.insert(devices).values({
        id: makeImportedDeviceId(cloudDevice.id),
        name: cloudDevice.name || cloudDevice.product_name || "Tuya Device",
        category: presentation.category,
        roomId: "living_room",
        icon: presentation.icon,
        protocol: "Tuya Cloud",
        online: cloudDevice.online ?? false,
        state: mappedState,
        tuyaDeviceId: cloudDevice.id,
        sortOrder: 200 + added,
      });
      added += 1;
    }
  }

  await db.insert(activityLogs).values({
    deviceName: "Tuya Cloud Sync",
    action:
      cloudDevices.length === 0
        ? "No devices found. Check that the Tuya app account is linked to the Cloud project and the data center matches."
        : `${cloudDevices.length} devices scanned via ${discovery.strategy}: ${added} added, ${updated} refreshed${unavailable ? `, ${unavailable} offline` : ""}`,
    type: "system",
    source: "Tuya Cloud API",
  });

  return {
    total: cloudDevices.length,
    added,
    updated,
    unavailable,
    strategy: discovery.strategy,
    attempts: discovery.attempts,
  };
}
