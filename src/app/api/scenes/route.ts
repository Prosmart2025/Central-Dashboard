import { getDashboardCatalog } from "@/lib/dashboard-catalog";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes } from "@/db/schema";
import { ensureDatabaseSeeded } from "@/lib/seed-data";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDatabaseSeeded();
    const { scenes: allScenes } = await getDashboardCatalog();
    return NextResponse.json({ success: true, data: allScenes });
  } catch (error) {
    console.error("GET /api/scenes error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch scenes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newId = body.id || `scene_${Date.now()}`;
    const newScene = {
      id: newId,
      name: body.name || "Custom Scene",
      description: body.description || "User defined scene",
      icon: body.icon || "Sparkles",
      gradient: body.gradient || "from-blue-600 to-indigo-700",
      actions: body.actions || [],
      sortOrder: body.sortOrder || 99,
    };

    await db.insert(scenes).values(newScene);
    return NextResponse.json({ success: true, data: newScene }, { status: 201 });
  } catch (error) {
    console.error("POST /api/scenes error:", error);
    return NextResponse.json({ success: false, error: "Failed to create scene" }, { status: 500 });
  }
}
