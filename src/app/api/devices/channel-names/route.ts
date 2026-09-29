import { NextResponse } from "next/server";
import { getDashboardCatalog } from "@/lib/dashboard-catalog";
import { importChannelNames } from "@/lib/channel-names";
import { isCloudDevice, powerFunctions } from "@/lib/device-capabilities";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(req:Request) {
  try {
    const body=await req.json().catch(()=>({}));const offset=body.offset??0;
    if(!Number.isInteger(offset)||offset<0)return NextResponse.json({success:false,error:"Invalid offset"},{status:400});
    const {devices}=await getDashboardCatalog();
    const list=devices.filter(d=>isCloudDevice(d)&&d.tuyaDeviceId&&powerFunctions(d.integration?.functions||[]).length>0).sort((a,b)=>a.id.localeCompare(b.id));
    const slice=list.slice(offset,offset+5);let imported=0;const warnings:Array<{device:string;reason:string}>=[];
    for(const device of slice){try{const result=await importChannelNames(device.id);imported+=result.imported;}catch{warnings.push({device:device.name,reason:"Tuya did not return names; existing labels retained."});}}
    const processed=offset+slice.length;
    return NextResponse.json({success:true,total:list.length,processed,imported,nextOffset:processed<list.length?processed:null,done:processed>=list.length,warnings});
  }catch{return NextResponse.json({success:false,error:"Could not import gang names."},{status:500});}
}
