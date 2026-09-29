import type { DeviceIntegration, TuyaFunction } from "@/types/integration";
import type { DeviceState } from "@/types/smart-home";
import { DeviceControlError, powerFunctions } from "./device-capabilities";

export const validLabel = (label: unknown): label is string => typeof label === "string" && label.trim().length > 0 && label.trim().length <= 80 && !/[\u0000-\u001f\u007f]/u.test(label);

export function parseTuyaChannelNames(payload: unknown, functions: TuyaFunction[]): Record<string, string> {
  const validCodes = new Set(powerFunctions(functions).map(f => f.code));
  const names: Record<string, string> = {};
  if (!Array.isArray(payload)) throw new DeviceControlError("Tuya did not return its gang-name list.", "CHANNEL_NAMES_UNAVAILABLE", 502);
  for (const item of payload) {
    if (item && typeof item.identifier === "string" && validCodes.has(item.identifier) && validLabel(item.name)) names[item.identifier] = item.name.trim();
  }
  return names;
}

/** Never replace an exact code with a numeric-position guess. */
export function applyChannelLabels(state: DeviceState, integration?: DeviceIntegration | null): DeviceState {
  if (!state.channels) return state;
  return { ...state, channels: state.channels.map(channel => {
    const custom = integration?.channelNames?.[channel.code];
    const tuya = integration?.tuyaChannelNames?.[channel.code];
    const fallback = /^switch_\d+$/.test(channel.code) ? `Gang ${channel.code.split("_")[1]}` : "Power";
    return { ...channel, label: validLabel(custom) ? custom.trim() : validLabel(tuya) ? tuya.trim() : fallback,
      labelSource: validLabel(custom) ? "custom" as const : validLabel(tuya) ? "tuya" as const : "default" as const };
  }) };
}

export function mergeChannelOverrides(existing: Record<string,string> | undefined, input: unknown, functions: TuyaFunction[]): Record<string,string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DeviceControlError("Gang names must be a code/name object.", "INVALID_CHANNEL_NAMES", 400);
  const validCodes = new Set(powerFunctions(functions).map(f => f.code));
  const next = { ...(existing || {}) };
  for (const [code, value] of Object.entries(input)) {
    if (!validCodes.has(code)) throw new DeviceControlError(`Unknown gang: ${code}.`, "UNKNOWN_CHANNEL", 400);
    if (value === null || value === "") delete next[code];
    else if (!validLabel(value)) throw new DeviceControlError("A gang name must be 1–80 characters, without control characters.", "INVALID_CHANNEL_NAME", 400);
    else next[code] = value.trim();
  }
  return next;
}

/** Canonical exact action matching. No fuzzy scene-name or temperature matching. */
export function sceneActionKey(updates: Record<string,unknown>): string {
  const keys = Object.keys(updates).sort();
  const allowed = new Set(["isOn","targetTemp","mode","fanSpeed","remoteKey"]);
  if (!keys.length || keys.some(k => !allowed.has(k))) throw new DeviceControlError("This action cannot be mapped to an IR scene.", "INVALID_SCENE_ACTION", 400);
  for (const key of keys) {
    const v = updates[key];
    if (key === "isOn" ? typeof v !== "boolean" : key === "targetTemp" ? typeof v !== "number" || !Number.isFinite(v) : typeof v !== "string" || !v.length || v.length > 100) {
      throw new DeviceControlError("Invalid scene action value.", "INVALID_SCENE_ACTION", 400);
    }
  }
  return JSON.stringify(Object.fromEntries(keys.map(key => [key,updates[key]])));
}

export function resolveControlRoute(integration: DeviceIntegration | null | undefined, updates: Record<string,unknown>) {
  if (integration?.source === "home-assistant") {
    if (!integration.homeAssistantEntityId) throw new DeviceControlError("This provider card has no Home Assistant entity mapping.", "HA_ENTITY_REQUIRED", 422);
    return { kind: "home-assistant" as const, entityId: integration.homeAssistantEntityId };
  }
  if (integration?.infrared && integration.irControlMode === "home-assistant") {
    if (!integration.homeAssistantEntityId) throw new DeviceControlError("Map this IR card to a Home Assistant entity first. Nothing was sent.", "HA_ENTITY_REQUIRED", 422);
    return { kind: "home-assistant" as const, entityId: integration.homeAssistantEntityId };
  }
  if (integration?.infrared && integration.irControlMode === "scenes") {
    const key = sceneActionKey(updates);
    const binding = integration.sceneBindings?.find(item => sceneActionKey(item.request) === key);
    if (!binding?.sceneId) throw new DeviceControlError("No Tuya scene is assigned to this exact action. Add one in IR control method, or select Direct IR. Nothing was sent.", "SCENE_NOT_MAPPED", 422);
    return { kind: "scene" as const, sceneId: binding.sceneId };
  }
  if (integration?.infrared) return { kind: "infrared" as const };
  return { kind: "standard" as const };
}

/** Schema metadata changes slowly; power commands do not need a new schema GET. */
export function hasReusableCapabilities(integration: DeviceIntegration | undefined | null, now=Date.now()) {
  const at = Date.parse(integration?.functionsFetchedAt || integration?.syncedAt || "");
  return Boolean(integration?.functions && !integration.capabilityError && Number.isFinite(at) && at <= now && now-at < 24*60*60*1000);
}

export function controlFailure(error: unknown, provider: string): { code:string; message:string; httpStatus:number } {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "The provider request failed.";
  if (code === "60001001" || /controllable device pool|control.*quota.*(?:exhausted|insufficient|exceeded)/i.test(message)) {
    const ir = provider === "Tuya IR";
    return {code: ir ? "IR_CONTROL_QUOTA" : "TUYA_CONTROL_QUOTA", httpStatus:409,
      message: ir
        ? "Tuya's separate IR developer API rejected this action (60001001: control-pool quota). No IR signal was sent. Use an explicitly assigned Tuya Tap-to-Run scene in IR control method, or review the project's IoT Core entitlement. Tuya did not provide a reset time."
        : "Tuya rejected this control request because its control-pool quota is exhausted (60001001). No device state was changed. Tuya did not provide a reset time."};
  }
  if (error instanceof DeviceControlError) return {code:error.code,message:error.message,httpStatus:error.httpStatus};
  return {code:code||"PROVIDER_ERROR",message:message.includes("Failed query")?"The request could not be saved. Refresh to check the actual device state.":message.slice(0,400),httpStatus:502};
}
