import "server-only";
import { DeviceControlError } from "./device-capabilities";

export interface HomeAssistantEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export function getHomeAssistantConfig() {
  const raw = process.env.HOME_ASSISTANT_URL?.trim();
  const token = process.env.HOME_ASSISTANT_TOKEN?.trim();
  if (!raw || !token) throw new DeviceControlError("Home Assistant bridge is not configured on the server.", "HA_NOT_CONFIGURED", 409);
  let url: URL;
  try { url = new URL(raw); } catch { throw new DeviceControlError("HOME_ASSISTANT_URL is invalid.", "HA_CONFIG_INVALID", 500); }
  const local = ["localhost","127.0.0.1","::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new DeviceControlError("Home Assistant must use HTTPS unless it is localhost.", "HA_INSECURE_URL", 500);
  if (url.username || url.password || url.search || url.hash) throw new DeviceControlError("HOME_ASSISTANT_URL must be only the instance origin.", "HA_CONFIG_INVALID", 500);
  return { origin: url.origin, token };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { origin, token } = getHomeAssistantConfig();
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const text = await response.text();
  let payload: unknown;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw new DeviceControlError(`Home Assistant rejected the request (HTTP ${response.status}).`, "HA_REQUEST_FAILED", response.status === 401 ? 401 : 502);
  return payload as T;
}

export async function getHomeAssistantStatus() {
  try {
    const result = await request<{ message?: string }>("/api/");
    return { configured: true, connected: result?.message === "API running." || Boolean(result) };
  } catch (error) {
    if (error instanceof DeviceControlError && error.code === "HA_NOT_CONFIGURED") return { configured: false, connected: false };
    return { configured: true, connected: false, error: error instanceof Error ? error.message : "Home Assistant unavailable" };
  }
}

export async function listHomeAssistantEntities(): Promise<HomeAssistantEntity[]> {
  const list = await request<HomeAssistantEntity[]>("/api/states");
  if (!Array.isArray(list)) throw new DeviceControlError("Home Assistant returned an invalid entity list.", "HA_INVALID_RESPONSE", 502);
  return list.filter((entity) => entity && typeof entity.entity_id === "string" && /^(climate|remote|switch|light|fan|cover|lock|sensor|binary_sensor|camera|scene|script|button)\./.test(entity.entity_id));
}

async function service(domain: string, action: string, data: Record<string, unknown>) {
  return request<HomeAssistantEntity[]>(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(action)}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Controls an explicitly mapped entity. No fuzzy entity matching is allowed.
 * Home Assistant/local integrations decide how the LAN/IR command is delivered.
 */
export async function sendHomeAssistantControl(entityId: string, updates: Record<string, unknown>) {
  if (!/^(climate|remote|switch|light|fan|cover)\.[a-z0-9_]+$/.test(entityId)) throw new DeviceControlError("Invalid Home Assistant entity ID.", "HA_ENTITY_INVALID", 400);
  const [domain] = entityId.split(".");
  const calls: Array<{ domain: string; action: string; data: Record<string, unknown> }> = [];

  if (domain === "climate") {
    if (updates.isOn !== undefined) calls.push({ domain, action: updates.isOn ? "turn_on" : "turn_off", data: { entity_id: entityId } });
    if (updates.mode !== undefined) calls.push({ domain, action: "set_hvac_mode", data: { entity_id: entityId, hvac_mode: updates.mode } });
    if (updates.targetTemp !== undefined) calls.push({ domain, action: "set_temperature", data: { entity_id: entityId, temperature: updates.targetTemp } });
    if (updates.fanSpeed !== undefined) calls.push({ domain, action: "set_fan_mode", data: { entity_id: entityId, fan_mode: updates.fanSpeed } });
  } else if (domain === "light") {
    if (updates.isOn !== undefined) calls.push({ domain, action: updates.isOn ? "turn_on" : "turn_off", data: { entity_id: entityId } });
    if (updates.brightness !== undefined) calls.push({ domain, action: "turn_on", data: { entity_id: entityId, brightness_pct: updates.brightness } });
  } else if (domain === "fan") {
    if (updates.isOn !== undefined) calls.push({ domain, action: updates.isOn ? "turn_on" : "turn_off", data: { entity_id: entityId } });
    if (updates.percentage !== undefined) calls.push({ domain, action: "set_percentage", data: { entity_id: entityId, percentage: updates.percentage } });
  } else if (domain === "lock") {
    if (typeof updates.isLocked !== "boolean") throw new DeviceControlError("Lock control requires a locked/unlocked value.", "HA_CONTROL_UNSUPPORTED");
    calls.push({ domain, action: updates.isLocked ? "lock" : "unlock", data: { entity_id: entityId } });
  } else if (domain === "cover") {
    if (updates.curtainState !== undefined) {
      const action = updates.curtainState === "open" ? "open_cover" : updates.curtainState === "closed" ? "close_cover" : "stop_cover";
      calls.push({ domain, action, data: { entity_id: entityId } });
    }
    if (updates.curtainPosition !== undefined) calls.push({ domain, action: "set_cover_position", data: { entity_id: entityId, position: updates.curtainPosition } });
  } else if (domain === "remote") {
    if (updates.remoteKey === undefined) throw new DeviceControlError("This Home Assistant remote requires an exact command key.", "HA_REMOTE_KEY_REQUIRED");
    calls.push({ domain, action: "send_command", data: { entity_id: entityId, command: String(updates.remoteKey) } });
  } else {
    if (typeof updates.isOn !== "boolean") throw new DeviceControlError(`This ${domain} entity currently supports power control through the bridge.`, "HA_CONTROL_UNSUPPORTED");
    calls.push({ domain, action: updates.isOn ? "turn_on" : "turn_off", data: { entity_id: entityId } });
  }

  if (!calls.length) throw new DeviceControlError("No supported Home Assistant action was requested.", "HA_CONTROL_UNSUPPORTED");
  for (const call of calls) await service(call.domain, call.action, call.data);
  return { sent: calls.length, provider: "Home Assistant" };
}

export async function getHomeAssistantEntity(entityId: string) {
  return request<HomeAssistantEntity>(`/api/states/${encodeURIComponent(entityId)}`);
}
