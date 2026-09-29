import { NextResponse } from "next/server";
import { importChannelNames } from "@/lib/channel-names";
import { DeviceControlError } from "@/lib/device-capabilities";
export const dynamic="force-dynamic";
export const maxDuration=30;
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}) {
  try {const {id}=await params;return NextResponse.json({success:true,...await importChannelNames(id)});}
  catch(error){return NextResponse.json({success:false,error:error instanceof Error&&!error.message.includes("Failed query")?error.message:"Could not import names; local names have been retained."},{status:error instanceof DeviceControlError?error.httpStatus:502});}
}
