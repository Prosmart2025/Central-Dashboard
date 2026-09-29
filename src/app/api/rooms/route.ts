import { getDashboardCatalog } from "@/lib/dashboard-catalog";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { ensureDatabaseSeeded } from "@/lib/seed-data";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDatabaseSeeded();
    const { rooms: allRooms } = await getDashboardCatalog();
    return NextResponse.json({ success: true, data: allRooms });
  } catch (error) {
    console.error("GET /api/rooms error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch rooms" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newRoom = {
      id: body.id || `room_${Date.now()}`,
      name: body.name || "New Room",
      icon: body.icon || "Home",
      sortOrder: body.sortOrder || 99,
    };
    await db.insert(rooms).values(newRoom);
    return NextResponse.json({ success: true, data: newRoom }, { status: 201 });
  } catch (error) {
    console.error("POST /api/rooms error:", error);
    return NextResponse.json({ success: false, error: "Failed to create room" }, { status: 500 });
  }
}
