import { getDashboardCatalog } from "@/lib/dashboard-catalog";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { devices, activityLogs } from "@/db/schema";
import { ensureDatabaseSeeded } from "@/lib/seed-data";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDatabaseSeeded();
    const { devices: allDevices } = await getDashboardCatalog();
    return NextResponse.json({ success: true, data: allDevices });
  } catch (error) {
    console.error("GET /api/devices error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch devices" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newId = body.id || `dev_${Date.now()}`;
    const newDevice = {
      id: newId,
      name: body.name || "New Smart Device",
      category: body.category || "light",
      roomId: body.roomId || "living_room",
      icon: body.icon || "Sparkles",
      protocol: body.protocol || "Zigbee 3.0",
      online: true,
      state: body.state || { isOn: false },
      tuyaDeviceId: body.tuyaDeviceId || `tuya_${Math.random().toString(36).substring(2, 9)}`,
      sortOrder: body.sortOrder || 99,
    };

    await db.insert(devices).values(newDevice);

    await db.insert(activityLogs).values({
      deviceId: newId,
      deviceName: newDevice.name,
      action: `Added to ${newDevice.roomId}`,
      type: "device",
      source: "Wall Tablet",
    });

    return NextResponse.json({ success: true, data: newDevice }, { status: 201 });
  } catch (error) {
    console.error("POST /api/devices error:", error);
    return NextResponse.json({ success: false, error: "Failed to create device" }, { status: 500 });
  }
}
