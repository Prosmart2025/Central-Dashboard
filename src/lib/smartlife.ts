import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "crypto";
import { checkLoginQr, createLoginQr, SmartLifeLoginError, type LoginApp } from "./smartlife-login";
import { db } from "@/db";
import { smartLifeSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildDeviceCommands, valuesOf } from "./device-capabilities";
import type { TuyaSpecification } from "@/types/integration";

/** Public credentials used by Home Assistant's official Tuya integration. */
const CLIENT_ID = "HA_3y9q4ak7g4ephrvke";
const SESSION_ID = "primary";

type TokenInfo = {
  t: number;
  uid: string;
  expire_time: number;
  access_token: string;
  refresh_token: string;
};

export type SmartLifeSession = {
  userCode: string;
  terminalId: string;
  endpoint: string;
  username?: string;
  token: TokenInfo;
};

export type SmartLifeDevice = {
  id: string;
  name: string;
  category: string;
  product_id?: string;
  product_name?: string;
  online?: boolean;
  icon?: string;
  status?: Array<{ code: string; value: unknown }>;
  function?: Record<string, unknown> | Array<{ code: string }>;
  homeId?: string;
  homeName?: string;
  displayOrder?: number;
};

type ApiResponse<T> = {
  success: boolean;
  result?: T;
  code?: number | string;
  msg?: string;
  t?: number;
};

export class SmartLifeError extends Error {
  code?: number | string;
  constructor(message: string, code?: number | string) {
    super(message);
    this.name = "SmartLifeError";
    this.code = code;
  }
}

function sessionKey() {
  const source =
    process.env.SMARTLIFE_SESSION_KEY ||
    process.env.TUYA_ACCESS_SECRET ||
    process.env.DATABASE_URL;
  if (!source) throw new SmartLifeError("A server encryption key is unavailable.");
  return createHash("sha256").update(source).digest();
}

function encryptSession(value: SmartLifeSession) {
  const key = sessionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, body].map((b) => b.toString("base64url")).join(".");
}

function decryptSession(value: string): SmartLifeSession {
  const [ivValue, tagValue, bodyValue] = value.split(".");
  if (!ivValue || !tagValue || !bodyValue) throw new SmartLifeError("Stored Smart Life session is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", sessionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const raw = Buffer.concat([
    decipher.update(Buffer.from(bodyValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(raw) as SmartLifeSession;
}

async function saveSession(session: SmartLifeSession) {
  const payload = {
    id: SESSION_ID,
    userCode: session.userCode,
    encryptedSession: encryptSession(session),
    displayName: session.username || null,
    endpoint: session.endpoint,
    updatedAt: new Date(),
  };
  await db
    .insert(smartLifeSessions)
    .values(payload)
    .onConflictDoUpdate({ target: smartLifeSessions.id, set: payload });
}

export async function loadSmartLifeSession() {
  const [row] = await db
    .select()
    .from(smartLifeSessions)
    .where(eq(smartLifeSessions.id, SESSION_ID))
    .limit(1);
  if (!row) return null;
  return decryptSession(row.encryptedSession);
}

export async function disconnectSmartLife() {
  await db.delete(smartLifeSessions).where(eq(smartLifeSessions.id, SESSION_ID));
}

export async function getSmartLifeConnection() {
  try {
    const session = await loadSmartLifeSession();
    return {
      connected: Boolean(session),
      userCode: session?.userCode || null,
      displayName: session?.username || null,
      endpoint: session?.endpoint || null,
    };
  } catch (error) {
    return {
      connected: false,
      userCode: null,
      displayName: null,
      endpoint: null,
      error: error instanceof Error ? error.message : "Session could not be read",
    };
  }
}

/** Start the documented QR flow. Only Tuya can issue a real login token. */
export async function beginSmartLifeLogin(userCode: unknown, app: LoginApp = "smartlife") {
  return createLoginQr(userCode, app);
}

/** Persist credentials only after Tuya explicitly confirms approval. */
export async function completeSmartLifeLogin(userCode: string, qrToken: string) {
  const result = await checkLoginQr(userCode, qrToken);
  if (result.state === "pending") {
    return { connected: false, pending: true, state: "pending", message: result.message };
  }
  const info = result.login;
  const session: SmartLifeSession = {
    userCode: userCode.trim(),
    terminalId: info.terminal_id,
    endpoint: info.endpoint,
    username: info.username,
    token: {
      t: info.t,
      uid: info.uid,
      expire_time: info.expire_time,
      access_token: info.access_token,
      refresh_token: info.refresh_token,
    },
  };
  try {
    await saveSession(session);
  } catch {
    throw new SmartLifeLoginError(
      "Tuya approved the login, but the dashboard could not save the session. No connection has been confirmed.",
      "SESSION_SAVE_FAILED", 503, true,
      "Check the dashboard's database and server encryption key, then try again. Your phone approval is not a database save.",
    );
  }
  return { connected: true, pending: false, state: "connected", displayName: session.username || null };
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function randomAscii(length: number) {
  const alphabet = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
  let value = "";
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) value += alphabet[bytes[i] % alphabet.length];
  return value;
}

function deriveSecret(requestId: string, hashKey: string) {
  return createHmac("sha256", requestId).update(hashKey).digest("hex").slice(0, 16);
}

/** Matches tuya-device-sharing-sdk's AES-GCM wire representation. */
function encryptPayload(payload: string, secret: string) {
  const nonce = randomAscii(12);
  const cipher = createCipheriv("aes-128-gcm", Buffer.from(secret, "utf8"), Buffer.from(nonce, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return Buffer.from(nonce, "utf8").toString("base64") + ciphertext.toString("base64");
}

function decryptPayload(payload: string, secret: string) {
  const bytes = Buffer.from(payload, "base64");
  const nonce = bytes.subarray(0, 12);
  const encrypted = bytes.subarray(12, -16);
  const tag = bytes.subarray(-16);
  const decipher = createDecipheriv("aes-128-gcm", Buffer.from(secret, "utf8"), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function compactJson(value: unknown) {
  return JSON.stringify(value);
}

let refreshing: Promise<SmartLifeSession> | null = null;
async function refreshIfNeeded(session: SmartLifeSession): Promise<SmartLifeSession> {
  if (session.token.t + session.token.expire_time * 1000 - 90_000 > Date.now()) return session;
  if (refreshing) return refreshing;
  refreshing = db.transaction(async (tx) => {
    // Serialize refresh across serverless instances; never invalidate a newly
    // refreshed token by racing an older session from another request.
    const [row] = await tx.select().from(smartLifeSessions).where(eq(smartLifeSessions.id, SESSION_ID)).for("update");
    if (!row) throw new SmartLifeError("Reconnect Smart Life.", "SESSION_MISSING");
    const current = decryptSession(row.encryptedSession);
    if (current.token.t + current.token.expire_time * 1000 - 90_000 > Date.now()) return current;
    const result = await customerRequest<Record<string, unknown>>(current, "GET", `/v1.0/m/token/${encodeURIComponent(current.token.refresh_token)}`, undefined, undefined, true);
    if (typeof result.accessToken !== "string" || typeof result.refreshToken !== "string") throw new SmartLifeError("Session refresh failed. Reconnect Smart Life.", "REFRESH_FAILED");
    current.token = { t: Number(result.__responseTime || Date.now()), expire_time: Number(result.expireTime), uid: String(result.uid), access_token: result.accessToken, refresh_token: result.refreshToken };
    await tx.update(smartLifeSessions).set({ encryptedSession: encryptSession(current), updatedAt: new Date() }).where(eq(smartLifeSessions.id, SESSION_ID));
    return current;
  }).finally(() => { refreshing = null; });
  return refreshing;
}

async function customerRequest<T>(
  sourceSession: SmartLifeSession,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params?: Record<string, unknown>,
  body?: Record<string, unknown>,
  skipRefresh = false
): Promise<T> {
  const session = skipRefresh ? sourceSession : await refreshIfNeeded(sourceSession);
  const requestId = randomUUID();
  const hashKey = md5(requestId + session.token.refresh_token);
  const secret = deriveSecret(requestId, hashKey);

  let encryptedQuery = "";
  let encryptedBody = "";
  const url = new URL(session.endpoint + path);
  if (params && Object.keys(params).length > 0) {
    encryptedQuery = encryptPayload(compactJson(params), secret);
    url.searchParams.set("encdata", encryptedQuery);
  }
  if (body && Object.keys(body).length > 0) {
    encryptedBody = encryptPayload(compactJson(body), secret);
  }

  const headers: Record<string, string> = {
    "X-appKey": CLIENT_ID,
    "X-requestId": requestId,
    "X-sid": "",
    "X-time": String(Date.now()),
    "X-token": session.token.access_token,
    "Content-Type": "application/json",
  };
  const signKeys = ["X-appKey", "X-requestId", "X-sid", "X-time", "X-token"];
  const headerString = signKeys
    .filter((key) => headers[key])
    .map((key) => `${key}=${headers[key]}`)
    .join("||");
  const stringToSign = headerString + encryptedQuery + encryptedBody;
  headers["X-sign"] = createHmac("sha256", hashKey).update(stringToSign).digest("hex");

  const response = await fetch(url, {
    method,
    headers,
    body: encryptedBody ? JSON.stringify({ encdata: encryptedBody }) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  const payload = (await response.json()) as ApiResponse<string | T>;
  if (!response.ok || !payload.success) {
    throw new SmartLifeError(payload.msg || `Smart Life request failed (${response.status})`, payload.code);
  }
  if (payload.result === undefined || payload.result === null || payload.result === "") return {} as T;

  const decrypted = decryptPayload(String(payload.result), secret);
  let result: any;
  try {
    result = JSON.parse(decrypted);
  } catch {
    result = decrypted;
  }
  if (path.startsWith("/v1.0/m/token/")) result.__responseTime = payload.t;
  return result as T;
}

export async function listSmartLifeDevices() {
  const session = await loadSmartLifeSession();
  if (!session) throw new SmartLifeError("Smart Life QR login is not connected.");
  const homes = await customerRequest<Array<{ ownerId: string | number; name: string }>>(
    session,
    "GET",
    "/v1.0/m/life/users/homes"
  );
  const devices = new Map<string, SmartLifeDevice>();
  for (const home of homes || []) {
    const list = await customerRequest<SmartLifeDevice[]>(
      session,
      "GET",
      "/v1.0/m/life/ha/home/devices",
      { homeId: String(home.ownerId) }
    );
    if (!Array.isArray(list)) throw new SmartLifeError("Tuya returned an invalid device list.", "INVALID_CATALOG");
    for (const [index, device] of list.entries()) devices.set(device.id, { ...device, homeId: String(home.ownerId), homeName: home.name, displayOrder: index });
  }
  return { homes: homes || [], devices: Array.from(devices.values()) };
}

export async function getSmartLifeSpecification(deviceId: string, suppliedSession?: SmartLifeSession) {
  const session = suppliedSession || await loadSmartLifeSession();
  if (!session) throw new SmartLifeError("Smart Life QR login is not connected.");
  return customerRequest<{
    functions?: Array<{ code: string; type?: string; values?: string }>;
    status?: Array<{ code: string; type?: string; values?: string }>;
  }>(session, "GET", `/v1.1/m/life/${encodeURIComponent(deviceId)}/specifications`);
}

export async function sendSmartLifeCommands(
  deviceId: string,
  commands: Array<{ code: string; value: unknown }>,
  suppliedSession?: SmartLifeSession
) {
  const session = suppliedSession || await loadSmartLifeSession();
  if (!session) throw new SmartLifeError("Smart Life QR login is not connected.");
  if (!commands.length) throw new SmartLifeError("No command to send.", "EMPTY_COMMAND");
  const result = await customerRequest(
    session,
    "POST",
    `/v1.1/m/thing/${encodeURIComponent(deviceId)}/commands`,
    undefined,
    { commands }
  );
  if (result === false) throw new SmartLifeError("Tuya declined the device command.", "COMMAND_REJECTED");
  return true;
}

export async function getSmartLifeRoom(deviceId: string) {
  const session = await loadSmartLifeSession();
  if (!session) throw new SmartLifeError("Smart Life is not connected.");
  return customerRequest<{ id?: string | number; name?: string; displayOrder?: number } | null>(
    session, "GET", `/v1.0/m/thing/ha/${encodeURIComponent(deviceId)}/room`
  );
}

export async function getSmartLifeScenes(homeId: string) {
  const session = await loadSmartLifeSession();
  if (!session) throw new SmartLifeError("Smart Life is not connected.");
  return customerRequest<Array<{ scene_id: string; name: string; enabled?: boolean; actions?: unknown[] }>>(
    session, "GET", "/v1.0/m/scene/ha/home/scenes", { homeId }
  );
}

export async function getSmartLifeDeviceDetails(ids: string[], suppliedSession?: SmartLifeSession) {
  const session = suppliedSession || await loadSmartLifeSession();
  if (!session) throw new SmartLifeError("Smart Life is not connected.");
  return customerRequest<SmartLifeDevice[]>(session, "GET", "/v1.0/m/life/ha/devices/detail", { devIds: ids.join(",") });
}

export async function triggerSmartLifeScene(homeId: string, sceneId: string) {
  const session = await loadSmartLifeSession();
  if (!session) throw new SmartLifeError("Smart Life is not connected.");
  const result = await customerRequest(session, "POST", "/v1.0/m/scene/ha/trigger", undefined, { homeId, sceneId });
  if (result === false) throw new SmartLifeError("Tuya declined the scene.", "SCENE_REJECTED");
  return true;
}

/** Builds only supported commands; never succeeds with zero commands. */
export async function sendDashboardStateToSmartLife(deviceId: string, updates: Record<string, unknown>) {
  const [spec, list] = await Promise.all([getSmartLifeSpecification(deviceId), getSmartLifeDeviceDetails([deviceId])]);
  const device = list.find((d) => d.id === deviceId);
  if (!device || device.online === false) throw new SmartLifeError("Device is offline or no longer shared with this account.", "DEVICE_UNAVAILABLE");
  const commands = buildDeviceCommands((spec as TuyaSpecification).functions || [], valuesOf(device.status), device.category, updates);
  await sendSmartLifeCommands(deviceId, commands);
  return { sent: commands.length, skipped: [] as string[] };
}
