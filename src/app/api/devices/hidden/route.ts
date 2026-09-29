import {NextResponse} from "next/server";
import {getHiddenCards} from "@/lib/card-management";
export const dynamic="force-dynamic";
export async function GET(){
 try{return NextResponse.json({success:true,data:await getHiddenCards()},{headers:{"Cache-Control":"no-store"}});}
 catch{return NextResponse.json({success:false,error:"Could not load hidden cards."},{status:500});}
}
