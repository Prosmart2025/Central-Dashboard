import QRCode from "qrcode";

/** Protocol reference: tuya/tuya-device-sharing-sdk, tuya_sharing/user.py. */
const PUBLIC_CLIENT_ID = "HA_3y9q4ak7g4ephrvke";
const AUTH_SCHEMA = "haauthorize";
const LOGIN_ORIGIN = "https://apigw.iotbing.com";
const TIMEOUT_MS = 15_000;
export const QR_VALIDITY_SECONDS = 180;

export type LoginApp = "smartlife" | "tuyaSmart";
export type LoginFetch = typeof fetch;
export type LoginEnvelope = {
  success?: boolean;
  result?: unknown;
  code?: string | number;
  msg?: string;
  t?: number;
};

export type ApprovedLogin = {
  terminal_id: string;
  endpoint: string;
  username?: string;
  uid: string;
  expire_time: number;
  access_token: string;
  refresh_token: string;
  t: number;
};

export class SmartLifeLoginError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus = 400,
    public readonly retryable = false,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "SmartLifeLoginError";
  }
}

const USER_CODE_HINT =
  "In the phone app that already controls your home, open Me → Settings (gear) → Account and Security → User Code, then use Copy. Paste that value here. The Cloud project's UID, Access ID, email and password are not the app User Code.";

/** Remove copy/paste-only spacing without changing the code's case. */
export function normalizeUserCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new SmartLifeLoginError("Enter the User Code from your Smart Life or Tuya Smart phone app.", "USER_CODE_REQUIRED", 400, false, USER_CODE_HINT);
  }
  const clean = value.normalize("NFKC").replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, "");
  if (!clean) {
    throw new SmartLifeLoginError("Enter the User Code from your Smart Life or Tuya Smart phone app.", "USER_CODE_REQUIRED", 400, false, USER_CODE_HINT);
  }
  if (clean.length > 128 || /[@:=/?<>"'\\]/u.test(clean)) {
    throw new SmartLifeLoginError("This does not look like an app User Code. Use the copied code, not a login, URL or project credential.", "USER_CODE_FORMAT", 400, false, USER_CODE_HINT);
  }
  return clean;
}

function upstreamError(payload: LoginEnvelope, defaultMessage: string) {
  const code = String(payload.code || "TUYA_LOGIN_REJECTED").slice(0, 80);
  const message = typeof payload.msg === "string" ? payload.msg : defaultMessage;
  if (/USER.?CODE.*(?:INCORRECT|INVALID)|USERCODE_INCORRECT/i.test(code) || /user\s*code.*(?:incorrect|invalid)/i.test(message)) {
    return new SmartLifeLoginError(
      "Tuya did not recognise this User Code, so it did not issue a QR code.",
      "USERCODE_INCORRECT",
      400,
      false,
      USER_CODE_HINT,
    );
  }
  if (/expired|expire|invalid.?token/i.test(code + " " + message)) {
    return new SmartLifeLoginError("This QR code has expired. Generate a fresh QR code and scan it again.", "QR_EXPIRED", 410, false);
  }
  if (/denied|rejected|cancel/i.test(code + " " + message)) {
    return new SmartLifeLoginError("The login was not approved in the phone app. You can generate a fresh QR code to try again.", "QR_DECLINED", 400, false);
  }
  return new SmartLifeLoginError(
    "Tuya could not complete this login request.",
    code,
    502,
    true,
    "Check that the same account is signed in on your phone, then try again. If this continues, use the error code below when contacting Tuya support.",
  );
}

async function requestLogin(url: URL, method: "GET" | "POST", transport: LoginFetch): Promise<LoginEnvelope> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await transport(url, {
      method,
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    const raw = await response.text();
    let payload: LoginEnvelope;
    try {
      payload = JSON.parse(raw) as LoginEnvelope;
      if (!payload || typeof payload !== "object") throw new Error("Invalid payload");
    } catch {
      throw new SmartLifeLoginError(
        "Tuya returned an unreadable response instead of a QR login result. Please retry.",
        "TUYA_INVALID_RESPONSE", 502, true,
      );
    }
    if (response.status === 429) {
      throw new SmartLifeLoginError("Too many login requests. Wait a moment, then generate a new QR code.", "TUYA_RATE_LIMIT", 429, true);
    }
    if (!response.ok && payload.success !== false) {
      throw new SmartLifeLoginError("Tuya's login service is temporarily unavailable. Please retry.", "TUYA_UNAVAILABLE", 502, true);
    }
    return payload;
  } catch (error) {
    if (error instanceof SmartLifeLoginError) throw error;
    if (controller.signal.aborted) {
      throw new SmartLifeLoginError("Tuya did not respond in 15 seconds. Please retry generating the QR code.", "TUYA_TIMEOUT", 504, true);
    }
    throw new SmartLifeLoginError("The dashboard server could not reach Tuya's login service. Please retry.", "TUYA_NETWORK", 502, true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function createLoginQr(
  input: unknown,
  app: LoginApp = "smartlife",
  transport: LoginFetch = fetch,
) {
  const userCode = normalizeUserCode(input);
  const url = new URL("/v1.0/m/life/home-assistant/qrcode/tokens", LOGIN_ORIGIN);
  url.search = new URLSearchParams({ clientid: PUBLIC_CLIENT_ID, usercode: userCode, schema: AUTH_SCHEMA }).toString();
  const payload = await requestLogin(url, "POST", transport);
  if (!payload.success) throw upstreamError(payload, "QR generation failed");
  const data = payload.result as { qrcode?: unknown } | undefined;
  const qrToken = data?.qrcode;
  if (typeof qrToken !== "string" || !qrToken || qrToken.length > 2048) {
    throw new SmartLifeLoginError("Tuya did not return a usable QR login token. Please retry.", "QR_TOKEN_MISSING", 502, true);
  }
  const qrContent = `${app}--qrLogin?token=${qrToken}`;
  const imageOptions = { margin: 4, width: 320, errorCorrectionLevel: "Q" as const, color: { dark: "#000000", light: "#ffffff" } };
  try {
    const [qrImage, svg] = await Promise.all([
      QRCode.toDataURL(qrContent, imageOptions),
      QRCode.toString(qrContent, { ...imageOptions, type: "svg" }),
    ]);
    return {
      userCode,
      qrToken,
      qrContent,
      qrImage,
      qrSvgImage: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      expiresIn: QR_VALIDITY_SECONDS,
      expiresAt: Date.now() + QR_VALIDITY_SECONDS * 1000,
      app,
    };
  } catch {
    throw new SmartLifeLoginError("Tuya returned a login token, but the dashboard could not render its QR image. Please retry.", "QR_RENDER_FAILED", 500, true);
  }
}

export async function checkLoginQr(input: unknown, tokenInput: unknown, transport: LoginFetch = fetch): Promise<
  { state: "pending"; message: string } | { state: "approved"; login: ApprovedLogin }
> {
  const userCode = normalizeUserCode(input);
  if (typeof tokenInput !== "string" || !tokenInput || tokenInput.length > 2048) {
    throw new SmartLifeLoginError("Generate a QR code before checking approval.", "QR_TOKEN_REQUIRED");
  }
  const url = new URL(`/v1.0/m/life/home-assistant/qrcode/tokens/${encodeURIComponent(tokenInput)}`, LOGIN_ORIGIN);
  url.search = new URLSearchParams({ clientid: PUBLIC_CLIENT_ID, usercode: userCode }).toString();
  const payload = await requestLogin(url, "GET", transport);
  if (!payload.success) {
    // Only known waiting responses are pending. Never hide a real API failure.
    const status = `${String(payload.code || "")} ${payload.msg || ""}`;
    if (/expired|expire|invalid.?token|denied|reject|cancel|user.?code.*(?:invalid|incorrect)/i.test(status)) {
      throw upstreamError(payload, "Login failed");
    }
    if (/wait|pending|not\s+(?:yet\s+)?(?:scan|confirm|authoriz|login)|unscanned|unauthori[sz]ed|unconfirmed|not.?scanned/i.test(status)) {
      return { state: "pending", message: "Scan the QR code inside the selected phone app, then tap Confirm or Authorize." };
    }
    throw upstreamError(payload, "Could not check approval");
  }

  const info = payload.result as Partial<ApprovedLogin> | undefined;
  if (!info?.terminal_id || !info.endpoint || !info.uid || !info.access_token || !info.refresh_token || !Number.isFinite(Number(info.expire_time))) {
    throw new SmartLifeLoginError("Tuya approved the request but returned incomplete session details. Generate a new QR code.", "LOGIN_INCOMPLETE", 502, false);
  }
  let endpoint: URL;
  try { endpoint = new URL(info.endpoint); } catch {
    throw new SmartLifeLoginError("Tuya returned an invalid account endpoint.", "LOGIN_ENDPOINT_INVALID", 502);
  }
  // The endpoint originates at Tuya but is still validated before saving/using it.
  const trusted = ["iotbing.com", "tuyaus.com", "tuyaeu.com", "tuyacn.com", "tuyain.com"];
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || !trusted.some((host) => endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`))) {
    throw new SmartLifeLoginError("Tuya returned an unexpected account endpoint. Login has not been saved.", "LOGIN_ENDPOINT_INVALID", 502);
  }
  return {
    state: "approved",
    login: { ...info, endpoint: endpoint.origin, t: Number(payload.t || Date.now()), expire_time: Number(info.expire_time) } as ApprovedLogin,
  };
}
