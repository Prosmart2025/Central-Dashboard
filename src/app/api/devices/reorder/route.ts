import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Persist icon order after a drag, and optionally move devices between rooms.
 *
 * Body: { order: [{ id, sortOrder, roomId? }, ...] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const order = body?.order;

    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ success: false, error: "`order` array is required" }, { status: 400 });
    }

    const entries = order
      .filter((e) => e && typeof e.id === "string")
      .map((e, index) => ({
        id: e.id as string,
        sortOrder: Number.isFinite(Number(e.sortOrder)) ? Number(e.sortOrder) : index,
        roomId: typeof e.roomId === "string" && e.roomId ? (e.roomId as string) : undefined,
      }));

    if (entries.length === 0) {
      return NextResponse.json({ success: false, error: "No valid entries" }, { status: 400 });
    }

    // Reject unknown ids up-front so a bad payload cannot silently half-apply.
    const ids = entries.map((e) => e.id);
    const found = await db
      .select({ id: devices.id, integration: devices.integration })
      .from(devices)
      .where(inArray(devices.id, ids));
    const known = new Set(found.map((f) => f.id));
    const unknown = ids.filter((id) => !known.has(id));

    if (unknown.length > 0) {
      return NextResponse.json(
        { success: false, error: `Unknown device id(s): ${unknown.slice(0, 5).join(", ")}` },
        { status: 400 }
      );
    }

    for (const entry of entries) {
      await db
        .update(devices)
        .set({
          sortOrder: entry.sortOrder,
          ...(entry.roomId ? { roomId: entry.roomId } : {}),
          integration: { ...found.find((d) => d.id === entry.id)?.integration, source: found.find((d) => d.id === entry.id)?.integration?.source || "manual", layoutOverride: true, ...(entry.roomId ? { roomOverride: true } : {}) },
          updatedAt: new Date(),
        })
        .where(eq(devices.id, entry.id));
    }

    return NextResponse.json({ success: true, updated: entries.length });
  } catch (error) {
    console.error("POST /api/devices/reorder error:", error);
    return NextResponse.json({ success: false, error: "Failed to save layout" }, { status: 500 });
  }
}
