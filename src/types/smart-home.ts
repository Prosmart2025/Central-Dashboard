import type { DeviceIntegration, RoomIntegration, SceneIntegration, CurtainMotor } from "./integration";
export type DeviceCategory =
  | "remote"
  | "light"
  | "climate"
  | "curtain"
  | "socket"
  | "lock"
  | "camera"
  | "vacuum"
  | "sensor"
  | "fan";

/** One independently controllable boolean channel (e.g. gang 2 of a 3-gang switch). */
export interface DeviceChannel {
  code: string; // Tuya DP code, e.g. "switch_2"
  label: string; // Human label, e.g. "Gang 2"
  isOn: boolean;
  labelSource?: "tuya" | "custom" | "default";
}

export interface DeviceState {
  motors?: CurtainMotor[];
  reportedAt?: string;
  /**
   * Populated for multi-gang switches and multi-motor curtain modules.
   * Derived from the device's real DP codes rather than assumed.
   */
  channels?: DeviceChannel[];
  /** True when the device exposes no commandable DPs (e.g. IR remotes, gateways). */
  readOnly?: boolean;
  /** Why the device is read-only, shown on the tile. */
  readOnlyReason?: string;
  isOn?: boolean;
  brightness?: number; // 1 - 100
  colorTemp?: number; // 2700 - 6500 K
  colorRgb?: string; // hex
  targetTemp?: number;
  currentTemp?: number;
  humidity?: number;
  mode?: "cool" | "heat" | "auto" | "dry" | "fan";
  fanSpeed?: "auto" | "low" | "mid" | "high";
  curtainPosition?: number; // 0 to 100
  curtainState?: "open" | "closed" | "paused";
  powerWatts?: number;
  energyKwh?: number;
  voltage?: number;
  isLocked?: boolean;
  battery?: number;
  vacuumStatus?: "docked" | "cleaning" | "paused" | "returning";
  suctionLevel?: "quiet" | "standard" | "strong" | "max";
  pm25?: number;
  co2?: number;
  motionDetected?: boolean;
  presetScene?: string;
}

export interface SmartDevice {
  integration?: DeviceIntegration | null;
  id: string;
  name: string;
  category: DeviceCategory;
  roomId: string;
  icon: string;
  protocol?: string;
  online: boolean;
  state: DeviceState;
  tuyaDeviceId?: string | null;
  sortOrder?: number;
  updatedAt?: string | Date;
  createdAt?: string | Date;
}

export interface Room {
  integration?: RoomIntegration | null;
  id: string;
  name: string;
  icon: string;
  sortOrder?: number;
}

export interface SceneAction {
  deviceId: string;
  stateChanges: Partial<DeviceState>;
}

export interface SmartScene {
  integration?: SceneIntegration | null;
  id: string;
  name: string;
  description?: string | null;
  icon: string;
  gradient: string;
  actions: SceneAction[];
  lastTriggered?: string | Date | null;
  sortOrder?: number;
}

export interface ActivityLog {
  id: number;
  deviceId?: string | null;
  deviceName: string;
  action: string;
  type?: string;
  source?: string;
  timestamp: string | Date;
}

export interface Favorite {
  id: string;
  label: string;
  icon: string;
  gradient: string;
  visible: boolean;
  /** Explicit device list; when set, `category` is ignored. */
  deviceIds?: string[];
  /** Fallback group selector: all devices of this category. */
  category?: string;
  action?: "on" | "off" | "toggle" | "auto";
}

export interface WallSettings {
  favorites?: Favorite[];
  id: string;
  panelName: string;
  theme: "midnight" | "titanium" | "neon" | "light";
  tempUnit: "C" | "F";
  screenSaverTimeout: number; // in seconds
  screenSaverType: "digital_clock" | "flip_clock" | "ambient_glow";
  soundFeedback: boolean;
  kioskScale: number; // 80, 90, 100, 110
  lockPin: string;
  tuyaAccessId?: string | null;
  tuyaEndpoint?: string | null;
  outdoorCity: string;
  outdoorTemp: number;
  outdoorCondition: string;
  outdoorHumidity: number;
  outdoorAqi: number;
  securityMode: "disarmed" | "home" | "away";
  updatedAt?: string | Date;
}
