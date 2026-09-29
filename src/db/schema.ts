import type { DeviceState } from "@/types/smart-home";
import type { DeviceIntegration, RoomIntegration, SceneIntegration } from "@/types/integration";
import { pgTable, text, serial, integer, boolean, real, jsonb, timestamp } from "drizzle-orm/pg-core";

export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // 'light' | 'climate' | 'curtain' | 'socket' | 'lock' | 'camera' | 'vacuum' | 'sensor' | 'fan'
  roomId: text("room_id").notNull(),
  icon: text("icon").notNull(),
  protocol: text("protocol").default("Zigbee 3.0"),
  online: boolean("online").default(true).notNull(),
  state: jsonb("state").notNull().$type<DeviceState>(),
  integration: jsonb("integration").$type<DeviceIntegration>(),
  tuyaDeviceId: text("tuya_device_id"),
  sortOrder: integer("sort_order").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rooms = pgTable("rooms", {
  integration: jsonb("integration").$type<RoomIntegration>(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  sortOrder: integer("sort_order").default(0),
});

export const scenes = pgTable("scenes", {
  integration: jsonb("integration").$type<SceneIntegration>(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").notNull(),
  gradient: text("gradient").notNull(),
  actions: jsonb("actions").notNull().$type<Array<{
    deviceId: string;
    stateChanges: Record<string, unknown>;
  }>>(),
  lastTriggered: timestamp("last_triggered"),
  sortOrder: integer("sort_order").default(0),
});

export const smartLifeSessions = pgTable("smartlife_sessions", {
  id: text("id").primaryKey(),
  userCode: text("user_code").notNull(),
  /** AES-256-GCM encrypted consumer token/session JSON. */
  encryptedSession: text("encrypted_session").notNull(),
  displayName: text("display_name"),
  endpoint: text("endpoint"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id"),
  deviceName: text("device_name").notNull(),
  action: text("action").notNull(),
  type: text("type").default("device"), // 'device' | 'scene' | 'security' | 'system'
  source: text("source").default("Wall Tablet"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const wallSettings = pgTable("wall_settings", {
  id: text("id").primaryKey(),
  panelName: text("panel_name").default("Tuya Smart Control Panel T6E").notNull(),
  theme: text("theme").default("midnight").notNull(), // 'midnight' | 'titanium' | 'neon' | 'light'
  tempUnit: text("temp_unit").default("C").notNull(), // 'C' | 'F'
  screenSaverTimeout: integer("screensaver_timeout").default(45).notNull(), // in seconds, 0 = off
  screenSaverType: text("screensaver_type").default("digital_clock").notNull(), // 'digital_clock' | 'flip_clock' | 'ambient_glow'
  soundFeedback: boolean("sound_feedback").default(true).notNull(),
  kioskScale: integer("kiosk_scale").default(100).notNull(),
  lockPin: text("lock_pin").default("1234").notNull(),
  tuyaAccessId: text("tuya_access_id").default(""),
  tuyaAccessSecret: text("tuya_access_secret").default(""),
  tuyaEndpoint: text("tuya_endpoint").default("https://openapi.tuyaus.com"),
  /**
   * User-configurable quick-control favourites shown as big icons at the top.
   * A favourite targets a device group (by category or explicit ids) so one
   * tap can operate every AC, every shutter, or a hand-picked set.
   */
  favorites: jsonb("favorites")
    .default("[]")
    .notNull()
    .$type<Array<{
      id: string;
      label: string;
      icon: string;
      gradient: string;
      visible: boolean;
      deviceIds?: string[];
      category?: string;
      action?: "on" | "off" | "toggle" | "auto";
    }>>(),
  outdoorCity: text("outdoor_city").default("Smart Living HQ").notNull(),
  outdoorTemp: real("outdoor_temp").default(21.5).notNull(),
  outdoorCondition: text("outdoor_condition").default("Sunny & Clear").notNull(),
  outdoorHumidity: integer("outdoor_humidity").default(45).notNull(),
  outdoorAqi: integer("outdoor_aqi").default(24).notNull(),
  securityMode: text("security_mode").default("disarmed").notNull(), // 'disarmed' | 'home' | 'away'
  updatedAt: timestamp("updated_at").defaultNow(),
});
