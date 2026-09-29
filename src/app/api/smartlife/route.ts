import { NextRequest, NextResponse } from "next/server";
import {
  beginSmartLifeLogin,
  completeSmartLifeLogin,
  disconnectSmartLife,
  getSmartLifeConnection,
  listSmartLifeDevices,
  SmartLifeError,
} from "@/lib/smartlife";
import { db } from "@/db";
import { activityLogs, devices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncSmartLifeCatalog } from "@/lib/smartlife-sync";
import { SmartLifeLoginError } from "@/lib/smartlife-login";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const LOGIN_VERSION = "qr-login-v2";

function reply(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ...payload, loginVersion: LOGIN_VERSION, catalogVersion: "tuya-local-bridge-v7" }, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-SmartLife-Login-Version": LOGIN_VERSION,
    },
  });
}

function failure(error: unknown, requestId: string) {
  if (error instanceof SmartLifeLoginError) {
    return reply({ success: false, error: error.message, code: error.code, hint: error.hint, retryable: error.retryable, requestId }, error.httpStatus);
  }
  if (error instanceof SmartLifeError) {
    return reply({ success: false, error: error.message, code: error.code || "SMARTLIFE_ERROR", requestId }, 502);
  }
  return reply({ success: false, error: "The dashboard could not complete the request. Please retry.", code: "DASHBOARD_ERROR", retryable: true, requestId }, 500);
}

export async function GET() {
  return reply({ success: true, data: await getSmartLifeConnection() });
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  let action = "unknown";
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid object");
    } catch {
      return reply({ success: false, error: "Invalid request. Refresh the dashboard and try again.", code: "INVALID_REQUEST", requestId }, 400);
    }
    action = typeof body.action === "string" ? body.action : "unknown";

    if (action === "start") {
      if (body.app !== undefined && body.app !== "smartlife" && body.app !== "tuyaSmart") {
        return reply({ success: false, error: "Choose Smart Life or Tuya Smart.", code: "INVALID_APP", requestId }, 400);
      }
      const login = await beginSmartLifeLogin(body.userCode, body.app === "tuyaSmart" ? "tuyaSmart" : "smartlife");
      return reply({ success: true, data: login });
    }

    if (action === "poll") {
      const login = await completeSmartLifeLogin(typeof body.userCode === "string" ? body.userCode : "", typeof body.qrToken === "string" ? body.qrToken : "");
      return reply({ success: true, data: login });
    }

    if (action === "sync") {
      const summary = await syncSmartLifeCatalog(Number(body.offset ?? 0), body.restoreRooms === true);
      return reply({
        success: true,
        message: summary.done ? `Tuya metadata import complete: ${summary.total} devices.` : `Importing Tuya rooms and controls: ${summary.processed}/${summary.total} devices…`,
        data: summary,
      });
    }

    if (action === "disconnect") {
      await disconnectSmartLife();
      return reply({ success: true, message: "Smart Life account disconnected." });
    }

    return reply({ success: false, error: "Unsupported action.", code: "INVALID_ACTION", requestId }, 400);
  } catch (error) {
    // Log diagnostics, never the request body, account code, QR token or session.
    console.warn("smartlife_login", {
      requestId,
      action,
      code: error instanceof SmartLifeLoginError || error instanceof SmartLifeError ? error.code : "DASHBOARD_ERROR",
    });
    return failure(error, requestId);
  }
}
