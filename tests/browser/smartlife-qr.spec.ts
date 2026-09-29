import { expect, test, type Page } from "@playwright/test";
import { createLoginQr } from "../../src/lib/smartlife-login";

// Browser fixtures only. No real account login or device commands are sent.
const code = "browserTestUserCode";
async function syntheticQr(token: string, app: "smartlife" | "tuyaSmart" = "smartlife") {
  return createLoginQr(code, app, async () => Response.json({ success: true, result: { qrcode: token } }));
}

async function setupMock(page: Page, options: { rejectStart?: boolean; failSync?: boolean; expireFirst?: boolean; approve?: boolean } = {}) {
  const stats = { starts: 0, polls: 0, syncs: 0, lastInput: "", connected: false };
  await page.route("**/api/smartlife", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { success: true, data: { connected: stats.connected } } });
    }
    const body = route.request().postDataJSON();
    if (body.action === "start") {
      stats.starts++;
      stats.lastInput = body.userCode;
      if (options.rejectStart) return route.fulfill({ status: 400, json: {
        success: false, error: "Tuya did not recognise this User Code, so it did not issue a QR code.", code: "USERCODE_INCORRECT",
        hint: "Copy User Code in the phone app: Me → Settings → Account and Security → User Code.", retryable: false,
      } });
      return route.fulfill({ json: { success: true, data: await syntheticQr(`browser-fixture-${stats.starts}`, body.app) } });
    }
    if (body.action === "poll") {
      stats.polls++;
      if (options.expireFirst && stats.starts === 1) return route.fulfill({ status: 410, json: {
        success: false, error: "This QR code has expired. Generate a fresh QR code and scan it again.", code: "QR_EXPIRED", retryable: false,
      } });
      if (options.approve) {
        stats.connected = true;
        return route.fulfill({ json: { success: true, data: { connected: true, displayName: "Test account" } } });
      }
      return route.fulfill({ json: { success: true, data: { connected: false, pending: true, message: "Waiting for approval in the phone app." } } });
    }
    if (body.action === "sync") {
      stats.syncs++;
      if (options.failSync) return route.fulfill({ status: 503, json: { success: false, error: "Device sync temporarily unavailable.", code: "SYNC_ERROR", retryable: true } });
      return route.fulfill({ json: { success: true, message: "Test device sync completed." } });
    }
    return route.fulfill({ json: { success: true } });
  });
  return stats;
}

async function generateQr(page: Page) {
  await page.goto("/?connect=smartlife");
  await expect(page.getByLabel("App User Code", { exact: true })).toBeVisible();
  await page.getByLabel("App User Code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Generate QR", exact: true }).click();
}

test("Connect Smart Life opens the QR tab, not display settings", async ({ page }) => {
  await setupMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Connect Smart Life", exact: true }).click();
  await expect(page.getByLabel("App User Code", { exact: true })).toBeVisible();
  await expect(page.getByText("QR login v2", { exact: true })).toBeVisible();
});

test("blank code has visible validation and sends no upstream request", async ({ page }) => {
  const stats = await setupMock(page);
  await page.goto("/?connect=smartlife");
  await page.getByRole("button", { name: "Generate QR", exact: true }).click();
  await expect(page.getByTestId("smartlife-connect").getByRole("alert")).toContainText("Copy the User Code");
  expect(stats.starts).toBe(0);
});

test("invalid User Code error is visible; no placeholder/fake QR is shown", async ({ page }) => {
  await setupMock(page, { rejectStart: true });
  await generateQr(page);
  await expect(page.getByTestId("smartlife-connect").getByRole("alert")).toContainText("did not issue a QR code");
  await expect(page.getByTestId("smartlife-connect").getByRole("alert")).toContainText("USERCODE_INCORRECT");
  await expect(page.getByTestId("qr-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate QR", exact: true })).toBeEnabled();
});

test("accepted synthetic response produces a loaded, refreshable tablet QR image", async ({ page }) => {
  const stats = await setupMock(page);
  await generateQr(page);
  const image = page.getByRole("img", { name: "Scan this QR code with your Smart Life or Tuya Smart app" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  const first = await image.getAttribute("src");
  await page.getByRole("button", { name: "Refresh QR", exact: true }).click();
  await expect.poll(() => stats.starts).toBe(2);
  await expect(image).toBeVisible();
  await expect.poll(() => image.getAttribute("src")).not.toBe(first);
  expect(stats.lastInput).toBe(code);
});

test("copy-paste whitespace is normalized before generation", async ({ page }) => {
  const stats = await setupMock(page);
  await page.goto("/?connect=smartlife");
  await page.getByLabel("App User Code", { exact: true }).fill(" \u200bBrowser Code４２ ");
  await page.getByRole("button", { name: "Generate QR", exact: true }).click();
  await expect.poll(() => stats.lastInput).toBe("BrowserCode42");
});

test("expiry remains visible and Refresh QR starts a new flow", async ({ page }) => {
  const stats = await setupMock(page, { expireFirst: true });
  await generateQr(page);
  await expect(page.getByRole("timer")).toHaveText("Expired");
  await expect(page.getByRole("button", { name: "I've scanned it", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh QR", exact: true }).click();
  await expect.poll(() => stats.starts).toBe(2);
  await expect(page.getByRole("timer")).toContainText("remaining");
});

test("changing code/app stops the old polling loop", async ({ page }) => {
  const stats = await setupMock(page);
  await generateQr(page);
  await expect.poll(() => stats.polls).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Change code / app", exact: true }).click();
  await expect(page.getByLabel("App User Code", { exact: true })).toBeVisible();
  const polls = stats.polls;
  await page.waitForTimeout(4300);
  expect(stats.polls).toBe(polls);
});

test("mock approval imports once; a sync failure is not hidden as success", async ({ page }) => {
  const stats = await setupMock(page, { approve: true, failSync: true });
  await generateQr(page);
  await expect(page.getByTestId("smartlife-connect").getByText("CONNECTED", { exact: true })).toBeVisible();
  await expect(page.getByTestId("smartlife-connect").getByRole("alert")).toContainText("Device sync temporarily unavailable");
  await expect(page.getByRole("button", { name: "Sync devices", exact: true })).toBeEnabled();
  expect(stats.syncs).toBe(1);
  await expect(page.getByTestId("qr-panel")).toHaveCount(0);
});
