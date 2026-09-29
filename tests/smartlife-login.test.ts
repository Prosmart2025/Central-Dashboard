import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import jsQR from "jsqr";
import { checkLoginQr, createLoginQr, normalizeUserCode, SmartLifeLoginError, type LoginFetch } from "../src/lib/smartlife-login";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as { PNG: { sync: { read(data: Buffer): { data: Buffer; width: number; height: number } } } };
const fakeUserCode = "testUserCode42";
const fakeQrToken = "test-only-authorization-token";
const mockTransport = (body: unknown, status = 200): LoginFetch => async () => Response.json(body, { status });
const rejectsWith = (code: string) => (error: unknown) => error instanceof SmartLifeLoginError && error.code === code;

// All success cases below use synthetic upstream responses. They do not prove a
// real account can log in; that requires the user's actual app User Code + scan.

test("normalizes invisible paste characters without changing code case", () => {
  assert.equal(normalizeUserCode("  test\u200bUser\u00a0Code４２\n"), fakeUserCode);
});

test("empty code, email and URL get actionable local validation", () => {
  assert.throws(() => normalizeUserCode(" \u200b "), rejectsWith("USER_CODE_REQUIRED"));
  assert.throws(() => normalizeUserCode(undefined), rejectsWith("USER_CODE_REQUIRED"));
  assert.throws(() => normalizeUserCode("person@example.test"), rejectsWith("USER_CODE_FORMAT"));
  assert.throws(() => normalizeUserCode("https://example.test"), rejectsWith("USER_CODE_FORMAT"));
});

test("generates and DECodes a Smart Life QR from a synthetic accepted token", async () => {
  let request: URL | undefined;
  let method: string | undefined;
  const transport: LoginFetch = async (input, options) => {
    request = new URL(String(input));
    method = options?.method;
    return Response.json({ success: true, result: { qrcode: fakeQrToken } });
  };
  const qr = await createLoginQr(fakeUserCode, "smartlife", transport);
  assert.equal(method, "POST");
  assert.equal(request?.hostname, "apigw.iotbing.com");
  assert.equal(request?.searchParams.get("schema"), "haauthorize");
  assert.equal(request?.searchParams.get("usercode"), fakeUserCode);
  assert.match(qr.qrImage, /^data:image\/png;base64,/);
  const png = PNG.sync.read(Buffer.from(qr.qrImage.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, `smartlife--qrLogin?token=${fakeQrToken}`);
  assert.match(decodeURIComponent(qr.qrSvgImage.split(",")[1]), /<svg/);
  assert.equal(qr.expiresIn, 180);
  assert.ok(qr.expiresAt > Date.now() + 175_000);
});

test("Tuya Smart app selection renders the matching QR scheme", async () => {
  const qr = await createLoginQr(fakeUserCode, "tuyaSmart", mockTransport({ success: true, result: { qrcode: fakeQrToken } }));
  const png = PNG.sync.read(Buffer.from(qr.qrImage.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, `tuyaSmart--qrLogin?token=${fakeQrToken}`);
});

test("upstream invalid User Code produces a clear error, never a fake QR", async () => {
  await assert.rejects(createLoginQr(fakeUserCode, "smartlife", mockTransport({ success: false, code: "USERCODE_INCORRECT", msg: "User Code Incorrect" })), (error: unknown) => {
    assert.ok(error instanceof SmartLifeLoginError);
    assert.equal(error.code, "USERCODE_INCORRECT");
    assert.match(error.hint || "", /Account and Security/);
    assert.match(error.message, /did not issue a QR/);
    return true;
  });
});

test("missing token is not reported as successful QR generation", async () => {
  await assert.rejects(createLoginQr(fakeUserCode, "smartlife", mockTransport({ success: true, result: {} })), rejectsWith("QR_TOKEN_MISSING"));
});

test("HTML gateway errors become readable errors rather than JSON parsing crashes", async () => {
  const transport: LoginFetch = async () => new Response("<html>Gateway timeout</html>", { status: 504 });
  await assert.rejects(createLoginQr(fakeUserCode, "smartlife", transport), rejectsWith("TUYA_INVALID_RESPONSE"));
});

test("network failures are retryable and do not include secret request URLs", async () => {
  const transport: LoginFetch = async () => { throw new Error(`failed fetch usercode=${fakeUserCode}`); };
  await assert.rejects(createLoginQr(fakeUserCode, "smartlife", transport), (error: unknown) => {
    assert.ok(error instanceof SmartLifeLoginError);
    assert.equal(error.code, "TUYA_NETWORK");
    assert.equal(error.retryable, true);
    assert.ok(!error.message.includes(fakeUserCode));
    return true;
  });
});

test("hanging upstream request is aborted within the server timeout", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const transport: LoginFetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const result = assert.rejects(createLoginQr(fakeUserCode, "smartlife", transport), rejectsWith("TUYA_TIMEOUT"));
  context.mock.timers.tick(15_001);
  await result;
  context.mock.timers.reset();
});

test("poll recognises an explicitly pending scan", async () => {
  const result = await checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: false, code: "WAITING_SCAN", msg: "Waiting for scan" }));
  assert.equal(result.state, "pending");
});

test("poll never labels expired, invalid-code or unknown failure responses as waiting", async () => {
  await assert.rejects(checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: false, code: "QR_EXPIRED", msg: "QR code expired" })), rejectsWith("QR_EXPIRED"));
  await assert.rejects(checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: false, code: "USERCODE_INCORRECT", msg: "User Code Incorrect" })), rejectsWith("USERCODE_INCORRECT"));
  await assert.rejects(checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: false, code: "ANOTHER_ERROR", msg: "Unexpected server problem" })), rejectsWith("ANOTHER_ERROR"));
});

test("rejected authorization is reported clearly", async () => {
  await assert.rejects(checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: false, code: "AUTH_DENIED", msg: "Cancelled" })), rejectsWith("QR_DECLINED"));
});

const approved = {
  terminal_id: "fake-terminal",
  endpoint: "https://apigw.tuyaeu.com",
  uid: "fake-uid",
  access_token: "test-only-access",
  refresh_token: "test-only-refresh",
  expire_time: 7200,
};

test("successful synthetic approval is parsed only with complete session data", async () => {
  const result = await checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: true, t: 1700000000000, result: approved }));
  assert.equal(result.state, "approved");
  if (result.state === "approved") assert.equal(result.login.t, 1700000000000);
  await assert.rejects(checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: true, result: { uid: "fake" } })), rejectsWith("LOGIN_INCOMPLETE"));
});

test("untrusted endpoints in approval payloads are not saved", async () => {
  await assert.rejects(checkLoginQr(fakeUserCode, fakeQrToken, mockTransport({ success: true, result: { ...approved, endpoint: "http://127.0.0.1" } })), rejectsWith("LOGIN_ENDPOINT_INVALID"));
});
