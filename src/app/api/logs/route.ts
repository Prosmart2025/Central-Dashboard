import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

    const logs = await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.timestamp))
      .limit(limit);

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("GET /api/logs error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch logs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const [inserted] = await db
      .insert(activityLogs)
      .values({
        deviceId: body.deviceId || null,
        deviceName: body.deviceName || "System",
        action: body.action || "Action recorded",
        type: body.type || "system",
        source: body.source || "Wall Tablet",
      })
      .returning();

    return NextResponse.json({ success: true, data: inserted }, { status: 201 });
  } catch (error) {
    console.error("POST /api/logs error:", error);
    return NextResponse.json({ success: false, error: "Failed to create log" }, { status: 500 });
  }
}
