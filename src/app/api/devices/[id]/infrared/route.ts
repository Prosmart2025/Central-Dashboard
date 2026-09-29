import {inspectInfraredPath} from "@/lib/ir-diagnostics";
import {NextResponse} from "next/server";
import {db} from "@/db";
import {devices} from "@/db/schema";
import {eq} from "drizzle-orm";
import {getInfraredRemotes,getInfraredBinding} from "@/lib/infrared";
export const dynamic="force-dynamic";
export const maxDuration=45;
/** Re-import exact paired remote keys. Never re-pair, rematch or transmit IR. */
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}) {
  try{
    const {id}=await params;const [device]=await db.select().from(devices).where(eq(devices.id,id));
    if(!device?.integration?.infrared)return NextResponse.json({success:false,error:"No paired infrared remote is linked."},{status:404});
    const old=device.integration.infrared;
    const list=await getInfraredRemotes(old.hubId);const remote=list.find(r=>r.remote_id===old.remoteId);
    if(!remote)return NextResponse.json({success:false,error:"This remote is no longer paired to this hub in Tuya. Recheck it in the phone app, then sync the account. No command was sent."},{status:409});
    const binding=await getInfraredBinding(old.hubId,remote);
    const updated=await db.transaction(async tx=>{
      const [current]=await tx.select().from(devices).where(eq(devices.id,id)).for("update");
      if(!current)throw new Error("Device removed.");
      const [row]=await tx.update(devices).set({integration:{...current.integration,source:current.integration?.source||"smartlife",infrared:binding}}).where(eq(devices.id,id)).returning();return row;
    });
    return NextResponse.json({success:true,data:updated,message:`Refreshed ${binding.keys.length} keys and the supported AC ranges. No signal was transmitted.`});
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error&&!error.message.includes("Failed query")?error.message:"Could not refresh the IR definition."},{status:502});}
}

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;const [device]=await db.select().from(devices).where(eq(devices.id,id));
    if(!device?.integration?.infrared)return NextResponse.json({success:false,error:"No IR remote linked."},{status:404});
    return NextResponse.json({success:true,data:await inspectInfraredPath(device.integration.infrared)},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return NextResponse.json({success:false,error:error instanceof Error&&!error.message.includes("Failed query")?error.message:"IR diagnostic failed."},{status:502});}
}
