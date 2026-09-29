import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { wallSettings } from "@/db/schema";
import { ensureDatabaseSeeded } from "@/lib/seed-data";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function publicSettings<T extends { tuyaAccessSecret?: string | null }>(settings: T | null) {
  if (!settings) return null;
  const { tuyaAccessSecret: _secret, ...safeSettings } = settings;
  return safeSettings;
}

export async function GET() {
  try {
    await ensureDatabaseSeeded();
    const settingsList = await db.select().from(wallSettings).limit(1);
    const settings = settingsList[0] || null;
    return NextResponse.json({ success: true, data: publicSettings(settings) });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const existing = await db.select().from(wallSettings).limit(1);
    const targetId = existing[0]?.id || "default_panel";

    const updatePayload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.panelName !== undefined) updatePayload.panelName = body.panelName;
    if (body.favorites !== undefined) {
      if (!Array.isArray(body.favorites)) {
        return NextResponse.json({ success: false, error: "`favorites` must be an array" }, { status: 400 });
      }
      updatePayload.favorites = body.favorites;
    }
    if (body.theme !== undefined) updatePayload.theme = body.theme;
    if (body.tempUnit !== undefined) updatePayload.tempUnit = body.tempUnit;
    if (body.screenSaverTimeout !== undefined) updatePayload.screenSaverTimeout = body.screenSaverTimeout;
    if (body.screenSaverType !== undefined) updatePayload.screenSaverType = body.screenSaverType;
    if (body.soundFeedback !== undefined) updatePayload.soundFeedback = body.soundFeedback;
    if (body.kioskScale !== undefined) updatePayload.kioskScale = body.kioskScale;
    if (body.lockPin !== undefined) updatePayload.lockPin = body.lockPin;
    if (body.securityMode !== undefined) updatePayload.securityMode = body.securityMode;
    if (body.tuyaAccessId !== undefined) updatePayload.tuyaAccessId = body.tuyaAccessId;
    // Tuya credentials are intentionally read only from server environment variables.
    // Do not accept or return an access secret through the tablet browser.
    if (body.tuyaEndpoint !== undefined) updatePayload.tuyaEndpoint = body.tuyaEndpoint;
    if (body.outdoorCity !== undefined) updatePayload.outdoorCity = body.outdoorCity;
    if (body.outdoorTemp !== undefined) updatePayload.outdoorTemp = body.outdoorTemp;
    if (body.outdoorCondition !== undefined) updatePayload.outdoorCondition = body.outdoorCondition;

    if (existing.length === 0) {
      await db.insert(wallSettings).values({
        id: targetId,
        ...updatePayload,
      });
    } else {
      await db.update(wallSettings).set(updatePayload).where(eq(wallSettings.id, targetId));
    }

    const [updated] = await db.select().from(wallSettings).where(eq(wallSettings.id, targetId));
    return NextResponse.json({ success: true, data: publicSettings(updated) });
  } catch (error) {
    console.error("PATCH /api/settings error:", error);
    return NextResponse.json({ success: false, error: "Failed to update settings" }, { status: 500 });
  }
}
