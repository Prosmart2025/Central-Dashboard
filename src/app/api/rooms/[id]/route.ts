import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms, devices } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Rename a room or change its icon. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.icon === "string" && body.icon.trim()) updates.icon = body.icon.trim();
    if (typeof body.sortOrder === "number") updates.sortOrder = body.sortOrder;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    await db.update(rooms).set(updates).where(eq(rooms.id, id));
    const [updated] = await db.select().from(rooms).where(eq(rooms.id, id));
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PATCH /api/rooms/[id] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update room" }, { status: 500 });
  }
}

/**
 * Delete a room. Devices are never deleted with it - they are reassigned to
 * `fallbackRoomId` (default "unassigned") so nothing disappears from the wall.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (id === "all") {
      return NextResponse.json(
        { success: false, error: "The 'All Devices' view cannot be deleted" },
        { status: 400 }
      );
    }

    const fallback = req.nextUrl.searchParams.get("fallbackRoomId") || "unassigned";

    if (fallback !== "unassigned") {
      const target = await db.select().from(rooms).where(eq(rooms.id, fallback)).limit(1);
      if (!target.length) {
        return NextResponse.json({ success: false, error: "Fallback room not found" }, { status: 400 });
      }
    } else {
      // Ensure the catch-all room exists before moving devices into it.
      const existing = await db.select().from(rooms).where(eq(rooms.id, "unassigned")).limit(1);
      if (!existing.length) {
        await db.insert(rooms).values({
          id: "unassigned",
          name: "Unassigned",
          icon: "LayoutGrid",
          sortOrder: 98,
        });
      }
    }

    const moved = await db
      .update(devices)
      .set({ roomId: fallback })
      .where(eq(devices.roomId, id))
      .returning({ id: devices.id });

    await db.delete(rooms).where(eq(rooms.id, id));

    return NextResponse.json({
      success: true,
      message: `Room removed. ${moved.length} device(s) moved to "${fallback}".`,
      movedCount: moved.length,
    });
  } catch (error) {
    console.error("DELETE /api/rooms/[id] error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete room" }, { status: 500 });
  }
}
