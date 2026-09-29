import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { wallSettings } from "@/db/schema";
import { getDashboardCatalog } from "@/lib/dashboard-catalog";
import { supportsGroupAction } from "@/lib/device-capabilities";
import { controlDevice } from "@/lib/device-control";
export const dynamic="force-dynamic";
export const maxDuration=300;

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    const [settings]=await db.select().from(wallSettings).limit(1);
    const favorite=settings?.favorites?.find(f=>f.id===id);
    if(!favorite)return NextResponse.json({success:false,error:"Group not found"},{status:404});
    const catalog=await getDashboardCatalog();
    const list=catalog.devices.filter(d=>favorite.deviceIds?.length?favorite.deviceIds.includes(d.id):favorite.category?d.category===favorite.category && supportsGroupAction(d):false);
    if(!list.length)return NextResponse.json({success:false,error:"This group has no devices. Choose members in Customise."},{status:422});
    const body=await req.json().catch(()=>({}));
    let action=body.action||favorite.action||"auto";
    if(!["auto","on","off","toggle","stop"].includes(action))return NextResponse.json({success:false,error:"Invalid group action"},{status:400});
    if(action==="auto"){
      const on=list.filter(d=>d.category==="curtain"?(d.state.curtainPosition??0)>=50:d.state.isOn===true).length;
      action=on>=list.length/2?"off":"on";
    }
    if(action==="stop" && list.some(d=>d.category!=="curtain"))return NextResponse.json({success:false,error:"Stop is only supported for shutter groups."},{status:422});
    const results=[];
    const sendOne = async (device: typeof list[number]) => {
      const turnOn=action==="on"?true:action==="off"?false:!(device.category==="curtain"?(device.state.curtainPosition??0)>=50:device.state.isOn);
      const update=device.category==="curtain"?{curtainState:action==="stop"?"paused":turnOn?"open":"closed",motorCode:"all"}:{isOn:turnOn};
      try {
        const result=await controlDevice(device.id,update);
        return {id:device.id,name:device.name,ok:result.success,confirmed:result.confirmed,error:result.success?undefined:result.message,data:result.data,message:result.message};
      }catch(error){return {id:device.id,name:device.name,ok:false,confirmed:false,error:error instanceof Error?error.message:"Request failed"};}
    };
    for (let index = 0; index < list.length; index += 2) {
      results.push(...await Promise.all(list.slice(index, index + 2).map(sendOne)));
    }
    const accepted=results.filter(r=>r.ok).length;
    const confirmed=results.filter(r=>r.confirmed).length;
    const failed=results.length-accepted;
    return NextResponse.json({success:failed===0,applied:accepted,confirmed,total:list.length,action,results,
      message:`${favorite.label}: ${accepted} accepted, ${confirmed} confirmed by reported state${failed?`, ${failed} failed (see device details)`:""}.`});
  }catch{return NextResponse.json({success:false,error:"The group request failed. No local state was fabricated."},{status:500});}
}
