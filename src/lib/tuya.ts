import "server-only";

import { createHash, createHmac, randomUUID } from "crypto";

export type TuyaStatusItem = {
  code: string;
  value: unknown;
};

export type TuyaCloudDevice = {
  id: string;
  name: string;
  category?: string;
  category_name?: string;
  product_id?: string;
  product_name?: string;
  online?: boolean;
  icon?: string;
  /**
   * The associated-users endpoint returns status inline. When present this is
   * used directly, avoiding one extra API request per device.
   */
  status?: TuyaStatusItem[];
};

type TuyaFunction = {
  code: string;
  type?: string;
  values?: string;
};

type TuyaApiResponse<T> = {
  success: boolean;
  result: T;
  msg?: string;
  code?: number;
  t?: number;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

const globalForTuya = globalThis as typeof globalThis & {
  __tuyaTokenCache?: TokenCache;
  __tuyaFunctionsCache?: Map<string, TuyaFunction[]>;
};

function assertNoPublicCredentials() {
  // NEXT_PUBLIC_* values are inlined into the browser bundle, so they must never hold Tuya secrets.
  const leaked = Object.keys(process.env).filter(
    (key) => key.startsWith("NEXT_PUBLIC_") && /TUYA/i.test(key) && /SECRET|ACCESS_ID|CLIENT/i.test(key)
  );

  if (leaked.length > 0) {
    throw new TuyaConfigurationError(
      `Remove browser-exposed Tuya variables (${leaked.join(", ")}). Use server-only TUYA_ACCESS_ID and TUYA_ACCESS_SECRET instead.`
    );
  }
}

function getConfig() {
  assertNoPublicCredentials();

  const accessId = process.env.TUYA_ACCESS_ID?.trim();
  const accessSecret = process.env.TUYA_ACCESS_SECRET?.trim();
  const endpoint = (process.env.TUYA_ENDPOINT?.trim() || "https://openapi.tuyaus.com").replace(/\/$/, "");

  if (!accessId || !accessSecret) {
    throw new TuyaConfigurationError(
      "Tuya Cloud is not configured. Set TUYA_ACCESS_ID and TUYA_ACCESS_SECRET as server-side environment variables in your hosting provider (Vercel: Settings -> Environment Variables), then redeploy."
    );
  }

  return { accessId, accessSecret, endpoint };
}

export class TuyaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TuyaConfigurationError";
  }
}

export class TuyaApiError extends Error {
  constructor(message: string, public readonly code?: number | string) {
    super(message);
    this.name = "TuyaApiError";
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex").toUpperCase();
}

/**
 * Server-side Tuya OpenAPI client.
 * Implements the current request format documented by Tuya:
 * HMAC-SHA256(client_id + access_token + t + nonce + stringToSign, secret)
 */
async function tuyaRequest<T>(
  method: "GET" | "POST",
  pathWithQuery: string,
  body?: Record<string, unknown>,
  accessToken?: string
): Promise<T> {
  const { accessId, accessSecret, endpoint } = getConfig();
  const timestamp = String(Date.now());
  const nonce = randomUUID().replace(/-/g, "");
  const serializedBody = body ? JSON.stringify(body) : "";
  const contentHash = sha256(serializedBody);
  const stringToSign = `${method}\n${contentHash}\n\n${pathWithQuery}`;
  const signPayload = `${accessId}${accessToken || ""}${timestamp}${nonce}${stringToSign}`;

  const response = await fetch(`${endpoint}${pathWithQuery}`, {
    method,
    headers: {
      client_id: accessId,
      sign: sign(signPayload, accessSecret),
      sign_method: "HMAC-SHA256",
      t: timestamp,
      nonce,
      ...(accessToken ? { access_token: accessToken } : {}),
      "Content-Type": "application/json",
    },
    body: method === "POST" ? serializedBody : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });

  const payload = (await response.json().catch(() => null)) as TuyaApiResponse<T> | null;
  if (!response.ok || !payload?.success) {
    throw new TuyaApiError(payload?.msg || `Tuya Cloud request failed with HTTP ${response.status}.`, payload?.code);
  }

  return payload.result;
}

async function getAccessToken() {
  const cached = globalForTuya.__tuyaTokenCache;
  if (cached && cached.expiresAt > Date.now() + 90_000) {
    return cached.accessToken;
  }

  const token = await tuyaRequest<{ access_token: string; expire_time?: number }>(
    "GET",
    "/v1.0/token?grant_type=1"
  );

  if (!token.access_token) {
    throw new TuyaApiError("Tuya Cloud did not return an access token.");
  }

  // Tuya typically returns seconds. Refresh 90 seconds before expiry.
  const lifetimeMilliseconds = Math.max((token.expire_time || 7200) * 1000, 120_000);
  globalForTuya.__tuyaTokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + lifetimeMilliseconds,
  };

  return token.access_token;
}

export function isTuyaConfigured() {
  return Boolean(process.env.TUYA_ACCESS_ID?.trim() && process.env.TUYA_ACCESS_SECRET?.trim());
}

export async function testTuyaConnection() {
  const token = await getAccessToken();
  return {
    connected: true,
    tokenPreview: `${token.slice(0, 5)}••••${token.slice(-4)}`,
  };
}

export type TuyaDiscoveryResult = {
  devices: TuyaCloudDevice[];
  strategy: "app-account" | "uid" | "project-asset" | "none";
  attempts: Array<{ strategy: string; endpoint: string; found: number; error?: string }>;
};

/**
 * Devices reach a Tuya Cloud project through two different routes, and they are
 * returned by two different endpoints:
 *
 *  1. "Link Tuya App Account" (what home users do by scanning the QR code in the
 *     Tuya IoT Platform). These devices belong to an *associated app user* and
 *     are ONLY returned by /v1.0/iot-01/associated-users/devices.
 *     This endpoint also returns each device's status inline, which avoids an
 *     extra status request per device.
 *
 *  2. Devices assigned to an industrial *asset* within the project, returned by
 *     /v1.3/iot-03/devices.
 *
 * The app-account route is tried first because it is the normal path for a home
 * setup. Querying only the asset dimension is why a correctly linked account can
 * still appear to have zero devices.
 */
export async function discoverTuyaDevices(): Promise<TuyaDiscoveryResult> {
  const token = await getAccessToken();
  const attempts: TuyaDiscoveryResult["attempts"] = [];

  // Route 1: devices linked through the Tuya Smart / Smart Life app account.
  // This endpoint pages with `last_row_key`; without following it, accounts with
  // more than one page of devices silently lose the remainder.
  const appAccountEndpoint = "/v1.0/iot-01/associated-users/devices";
  try {
    const collected: TuyaCloudDevice[] = [];
    const seen = new Set<string>();
    let lastRowKey = "";
    let reportedTotal: number | undefined;
    let pageError: string | undefined;

    for (let page = 0; page < 20; page++) {
      // Tuya signs the URL with query parameters sorted alphabetically by key.
      // Sending them in any other order fails with "sign invalid".
      const params: Array<[string, string]> = [["size", "100"]];
      if (lastRowKey) params.push(["last_row_key", lastRowKey]);
      params.sort(([a], [b]) => a.localeCompare(b));
      const query = "?" + params.map(([k, v]) => `${k}=${v}`).join("&");

      let result: {
        devices?: TuyaCloudDevice[];
        total?: number;
        has_more?: boolean;
        last_row_key?: string;
      };

      try {
        result = await tuyaRequest("GET", `${appAccountEndpoint}${query}`, undefined, token);
      } catch (error) {
        // Preserve everything gathered so far rather than losing the whole sync
        // because one later page failed.
        pageError = error instanceof Error ? error.message : "page request failed";
        break;
      }

      const batch = result.devices || [];
      if (reportedTotal === undefined) reportedTotal = result.total;

      for (const device of batch) {
        if (device?.id && !seen.has(device.id)) {
          seen.add(device.id);
          collected.push(device);
        }
      }

      // Stop when Tuya says there is no more, or it stops advancing the cursor.
      if (!result.has_more || batch.length === 0) break;
      if (!result.last_row_key || result.last_row_key === lastRowKey) break;
      lastRowKey = result.last_row_key;
    }

    const shortfall =
      reportedTotal !== undefined && reportedTotal !== collected.length
        ? `Tuya reported ${reportedTotal} total; retrieved ${collected.length}`
        : undefined;
    const note = [pageError, shortfall].filter(Boolean).join("; ");

    attempts.push({
      strategy: "app-account",
      endpoint: `${appAccountEndpoint}?size=100 (paged)`,
      found: collected.length,
      ...(note ? { error: note } : {}),
    });

    if (collected.length > 0) {
      return { devices: collected, strategy: "app-account", attempts };
    }
  } catch (error) {
    attempts.push({
      strategy: "app-account",
      endpoint: appAccountEndpoint,
      found: 0,
      error: error instanceof Error ? error.message : "request failed",
    });
  }

  // Route 2: devices owned by a specific Tuya app user (UID).
  // The UID is shown in the Tuya IoT Platform under
  // Cloud project -> Devices -> Link App Account, in the "UID" column.
  const uid = process.env.TUYA_UID?.trim();
  if (uid) {
    const uidEndpoint = `/v1.0/users/${encodeURIComponent(uid)}/devices`;
    try {
      const result = await tuyaRequest<TuyaCloudDevice[] | { devices?: TuyaCloudDevice[] }>(
        "GET",
        uidEndpoint,
        undefined,
        token
      );
      const devices = Array.isArray(result) ? result : result?.devices || [];
      attempts.push({ strategy: "uid", endpoint: uidEndpoint, found: devices.length });
      if (devices.length > 0) {
        return { devices, strategy: "uid", attempts };
      }
    } catch (error) {
      attempts.push({
        strategy: "uid",
        endpoint: uidEndpoint,
        found: 0,
        error: error instanceof Error ? error.message : "request failed",
      });
    }
  }

  // Route 3: devices attached to a project asset.
  const assetEndpoint = "/v1.3/iot-03/devices?page_size=100";
  try {
    const result = await tuyaRequest<{ list?: TuyaCloudDevice[] }>("GET", assetEndpoint, undefined, token);
    const devices = result.list || [];
    attempts.push({ strategy: "project-asset", endpoint: assetEndpoint, found: devices.length });
    if (devices.length > 0) {
      return { devices, strategy: "project-asset", attempts };
    }
  } catch (error) {
    attempts.push({
      strategy: "project-asset",
      endpoint: assetEndpoint,
      found: 0,
      error: error instanceof Error ? error.message : "request failed",
    });
  }

  return { devices: [], strategy: "none", attempts };
}

export async function listTuyaDevices(): Promise<TuyaCloudDevice[]> {
  const { devices } = await discoverTuyaDevices();
  return devices;
}

export async function getTuyaDeviceStatus(deviceId: string): Promise<TuyaStatusItem[]> {
  const token = await getAccessToken();
  return tuyaRequest<TuyaStatusItem[]>(
    "GET",
    `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/status`,
    undefined,
    token
  );
}

export async function getTuyaDeviceFunctions(deviceId: string): Promise<TuyaFunction[]> {
  const cache = globalForTuya.__tuyaFunctionsCache || new Map<string, TuyaFunction[]>();
  globalForTuya.__tuyaFunctionsCache = cache;
  const cached = cache.get(deviceId);
  if (cached) return cached;

  const token = await getAccessToken();
  // Tuya returns { category, functions: [...] } here - NOT a bare array.
  // Treating the object as an array made every command dispatch throw, which
  // is why cloud devices (shutters especially) appeared uncontrollable.
  const result = await tuyaRequest<TuyaFunction[] | { category?: string; functions?: TuyaFunction[] }>(
    "GET",
    `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/functions`,
    undefined,
    token
  );

  const functions = Array.isArray(result) ? result : result?.functions ?? [];
  cache.set(deviceId, functions);
  return functions;
}

/** A short backoff is local pacing, NOT a claimed reset of Tuya's quota. */
let quotaRetryAfter = 0;
export class TuyaQuotaError extends TuyaApiError {
  constructor() {
    super("Tuya rejected the command: controllable device pool quota is insufficient (60001001). No quota reset time was supplied.", 60001001);
    this.name = "TuyaQuotaError";
  }
}
export function getTuyaQuotaState() {
  return { blocked:Date.now()<quotaRetryAfter, resetAt:null, retryAfter:quotaRetryAfter?new Date(quotaRetryAfter).toISOString():null };
}
export function isQuotaBlocked() { return Date.now() < quotaRetryAfter; }
let commandQueue: Promise<void> = Promise.resolve();
let lastCommandAt=0;
export async function sendTuyaCommands(deviceId: string, commands: Array<{code:string;value:unknown}>):Promise<boolean> {
  if (!commands.length) throw new TuyaApiError("No commands to send.", "EMPTY_COMMAND");
  if (isQuotaBlocked()) throw new TuyaQuotaError();
  const wait = commandQueue.then(async () => {
    const remaining=140-(Date.now()-lastCommandAt);
    if(remaining>0)await new Promise(r=>setTimeout(r,remaining));
    lastCommandAt=Date.now();
  });
  commandQueue=wait.catch(()=>{});await wait;
  const token=await getAccessToken();
  try {
    const result=await tuyaRequest<boolean>("POST",`/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/commands`,{commands},token);
    if(result!==true)throw new TuyaApiError("Tuya did not accept the command.","COMMAND_REJECTED");
    return true;
  }catch(error){
    if((error instanceof TuyaApiError && String(error.code)==="60001001") || (error instanceof Error && /quota.*insufficient/i.test(error.message))){quotaRetryAfter=Date.now()+60_000;throw new TuyaQuotaError();}
    throw error;
  }
}

function findFunctionCode(functions: TuyaFunction[], choices: string[]) {
  if (!Array.isArray(functions)) return undefined;
  const normalized = new Set(functions.map((fn) => fn?.code).filter(Boolean));
  return choices.find((choice) => normalized.has(choice));
}

function mapBrightnessForTuya(value: unknown, code: string) {
  const percent = Math.max(1, Math.min(100, Number(value)));
  return code.includes("value") ? Math.round((percent / 100) * 1000) : percent;
}

/**
 * Converts dashboard state edits into functions exposed by the actual Tuya device.
 * Function availability is fetched from Tuya first so unsupported dashboard controls
 * are skipped rather than sent with a guessed command code.
 */
export async function sendDashboardStateToTuya(
  deviceId: string,
  updates: Record<string, unknown>
): Promise<{ sent: number; skipped: string[] }> {
  const functions = await getTuyaDeviceFunctions(deviceId);
  const commands: Array<{ code: string; value: unknown }> = [];
  const skipped: string[] = [];

  const addIfAvailable = (updateKey: string, choices: string[], value: unknown) => {
    const code = findFunctionCode(functions, choices);
    if (!code) {
      skipped.push(updateKey);
      return;
    }
    commands.push({ code, value });
  };

  // A specific channel was targeted (e.g. gang 2 of a 3-gang switch).
  // This takes precedence: it names the exact DP, so no guessing is needed.
  if (updates.channelCode && typeof updates.channelValue === "boolean") {
    const code = String(updates.channelCode);
    if (findFunctionCode(functions, [code])) {
      commands.push({ code, value: updates.channelValue });
    } else {
      skipped.push(code);
    }
  } else if (typeof updates.isOn === "boolean") {
    // Aggregate power: drive every gang so "off" means the whole device is off.
    const gangs = (Array.isArray(functions) ? functions : [])
      .map((fn) => fn?.code)
      .filter((c): c is string => typeof c === "string" && /^switch_\d+$/.test(c));

    if (gangs.length > 1) {
      for (const code of gangs) commands.push({ code, value: updates.isOn });
    } else {
      addIfAvailable("isOn", ["switch_led", "switch_1", "switch", "switch_usb1", "power"], updates.isOn);
    }
  }

  if (updates.brightness !== undefined) {
    const code = findFunctionCode(functions, ["bright_value_v2", "bright_value", "bright"]);
    if (code) commands.push({ code, value: mapBrightnessForTuya(updates.brightness, code) });
    else skipped.push("brightness");
  }

  if (updates.targetTemp !== undefined) {
    const code = findFunctionCode(functions, ["temp_set", "temp_set_f", "target_temperature"]);
    if (code) {
      // Most Tuya thermostat DPs use tenths of a degree. The device function metadata remains authoritative.
      commands.push({ code, value: Math.round(Number(updates.targetTemp) * 10) });
    } else skipped.push("targetTemp");
  }

  if (updates.fanSpeed !== undefined) {
    addIfAvailable("fanSpeed", ["fan_speed_enum", "fan_speed", "windspeed"], updates.fanSpeed);
  }

  if (updates.mode !== undefined) {
    addIfAvailable("mode", ["mode", "work_mode", "mode_type"], updates.mode);
  }

  // Position is authoritative. The dashboard derives a curtainState alongside a
  // slider move ("paused" for any mid position), and sending that as control:stop
  // immediately halts the motor it just told to move. So when an explicit
  // position is supplied, the derived state is intentionally not transmitted.
  if (updates.curtainPosition !== undefined) {
    const position = Math.max(0, Math.min(100, Math.round(Number(updates.curtainPosition))));
    addIfAvailable(
      "curtainPosition",
      ["percent_control", "position", "percent_state", "control_percent"],
      position
    );
  } else if (updates.curtainState !== undefined) {
    const control =
      updates.curtainState === "open" ? "open" : updates.curtainState === "closed" ? "close" : "stop";
    addIfAvailable("curtainState", ["control", "control_back", "control_motor", "mach_operate"], control);
  }

  if (typeof updates.isLocked === "boolean") {
    const code = findFunctionCode(functions, ["lock", "closed_open", "door_lock"]);
    if (code) {
      const value = code === "closed_open" ? (updates.isLocked ? "close" : "open") : updates.isLocked;
      commands.push({ code, value });
    } else {
      skipped.push("isLocked");
    }
  }

  await sendTuyaCommands(deviceId, commands);
  return { sent: commands.length, skipped };
}

/** Server-only documented OpenAPI calls for metadata and IR commands. */
export async function tuyaCloudRequest<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
  const token = await getAccessToken();
  return tuyaRequest<T>(method, path, body, token);
}
