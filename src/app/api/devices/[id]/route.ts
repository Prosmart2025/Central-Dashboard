import {setCardHidden} from "@/lib/card-management";
import { updateDeviceMetadata } from "@/lib/device-metadata";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { devices, rooms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { controlDevice, refreshDevice } from "@/lib/device-control";
import { DeviceControlError } from "@/lib/device-capabilities";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const [device]=await db.select().from(devices).where(eq(devices.id,id));
  if(!device)return NextResponse.json({success:false,error:"Device not found"},{status:404});
  try {return NextResponse.json({success:true,data:req.nextUrl.searchParams.get("refresh")==="1"?await refreshDevice(device,req.nextUrl.searchParams.get("commandId")||undefined):device});}
  catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:"Could not read Tuya state.",data:device},{status:502});}
}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    const body=await req.json();
    if(!body || typeof body!=="object" || Array.isArray(body)) return NextResponse.json({success:false,error:"Invalid request"},{status:400});
    if(body.state!==undefined){
      const result=await controlDevice(id,body.state);
      return NextResponse.json(result,{status:result.success?200:result.httpStatus||502,headers:{"Server-Timing":`provider;dur=${result.data.integration?.command?.durationMs||0}`}});
    }
    const updated = await updateDeviceMetadata(id, body);
    return NextResponse.json({success:true,data:updated});
  } catch(error){
    return NextResponse.json({success:false,error:error instanceof DeviceControlError?error.message:"Device request failed; reported state was not changed.",code:error instanceof DeviceControlError?error.code:"REQUEST_FAILED"},{status:error instanceof DeviceControlError?error.httpStatus:500});
  }
}
export async function DELETE(_req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {const {id}=await params;await setCardHidden(id,true);return NextResponse.json({success:true,message:"Card hidden from this dashboard. Your Tuya device was not deleted or modified."});}
  catch(error){return NextResponse.json({success:false,error:error instanceof DeviceControlError?error.message:"Could not hide this card."},{status:error instanceof DeviceControlError?error.httpStatus:500});}
}
