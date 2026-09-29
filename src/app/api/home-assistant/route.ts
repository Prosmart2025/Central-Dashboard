import { NextResponse } from "next/server";
import { getHomeAssistantStatus, listHomeAssistantEntities } from "@/lib/home-assistant";
import { syncHomeAssistantCatalog } from "@/lib/home-assistant-sync";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req:Request){
  try{
    const body=await req.json().catch(()=>({}));
    if(body.action!=="sync")return NextResponse.json({success:false,error:"Unsupported action"},{status:400});
    const data=await syncHomeAssistantCatalog();
    return NextResponse.json({success:true,data,message:`Imported ${data.added} new and updated ${data.updated} provider entities across ${data.areas} areas.`});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:"Provider sync failed"},{status:502});}
}

export async function GET() {
  const status = await getHomeAssistantStatus();
  if (!status.configured || !status.connected) return NextResponse.json({ success: true, data: { ...status, entities: [] } }, { headers: { "Cache-Control": "no-store" } });
  try {
    const entities = await listHomeAssistantEntities();
    return NextResponse.json({ success: true, data: { ...status, entities: entities.map((entity) => ({ entityId: entity.entity_id, name: String(entity.attributes?.friendly_name || entity.entity_id), domain: entity.entity_id.split(".")[0], state: entity.state })) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Home Assistant unavailable" }, { status: 502 });
  }
}
