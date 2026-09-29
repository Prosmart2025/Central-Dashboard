import { NextResponse } from "next/server";
import { db } from "@/db";
import { devices, rooms, scenes, activityLogs, wallSettings } from "@/db/schema";
import { ensureDatabaseSeeded } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Delete existing records
    await db.delete(devices);
    await db.delete(rooms);
    await db.delete(scenes);
    await db.delete(activityLogs);
    await db.delete(wallSettings);

    // Re-seed
    await ensureDatabaseSeeded();

    return NextResponse.json({ success: true, message: "Database reseeded successfully" });
  } catch (error) {
    console.error("POST /api/seed error:", error);
    return NextResponse.json({ success: false, error: "Failed to reseed database" }, { status: 500 });
  }
}
