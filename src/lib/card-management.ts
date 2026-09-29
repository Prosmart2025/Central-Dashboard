import "server-only";
import {db} from "@/db";
import {devices} from "@/db/schema";
import {asc,eq} from "drizzle-orm";
import {DeviceControlError} from "./device-capabilities";
import {mergeCardPreferences} from "./card-preferences";

/** This module never imports a Tuya write client. Removing a card is local-only. */
export async function setCardHidden(id:string,hidden:boolean){
 return db.transaction(async tx=>{
   const [device]=await tx.select().from(devices).where(eq(devices.id,id)).for("update");
   if(!device)throw new DeviceControlError("Card not found.","NOT_FOUND",404);
   const [updated]=await tx.update(devices).set({integration:mergeCardPreferences(device.integration,{hidden})}).where(eq(devices.id,id)).returning();
   return updated;
 });
}
export async function getHiddenCards(){
 const all=await db.select().from(devices).orderBy(asc(devices.name));
 return all.filter(d=>d.integration?.hidden).map(d=>({id:d.id,name:d.name,icon:d.icon,roomId:d.roomId,removedAt:d.integration?.hiddenAt,available:d.integration?.accountPresent!==false}));
}
