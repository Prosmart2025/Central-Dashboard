import "server-only";
import { db } from "@/db";
import { devices,rooms,scenes,activityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getHomeAssistantInventory } from "./home-assistant-inventory";
import { mapHomeAssistantDomain,mapHomeAssistantState } from "./home-assistant-mapping";
import { syncedIntegration } from "./sync-preferences";
import type { DeviceIntegration,RoomIntegration,SceneIntegration } from "@/types/integration";
const safe=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,"_");
export const haRoomId=(area:string)=>`ha_area_${safe(area)}`;

export async function syncHomeAssistantCatalog(){
  const inventory=await getHomeAssistantInventory();
  const allExisting=await db.select().from(devices);
  const present=new Set<string>();let added=0,updated=0,importedScenes=0;
  const unassigned="ha_area_unassigned";
  const unassignedIntegration:RoomIntegration={source:"home-assistant",roomId:"unassigned",homeName:"Home Assistant"};
  await db.insert(rooms).values({id:unassigned,name:"Unassigned · Home Assistant",icon:"Home",sortOrder:99999,integration:unassignedIntegration}).onConflictDoUpdate({target:rooms.id,set:{name:"Unassigned · Home Assistant",integration:unassignedIntegration}});
  for(const [index,area] of inventory.areas.entries()){
    const integration:RoomIntegration={source:"home-assistant",roomId:area.area_id,homeName:"Home Assistant"};
    await db.insert(rooms).values({id:haRoomId(area.area_id),name:area.name,icon:"Home",sortOrder:20000+index,integration}).onConflictDoUpdate({target:rooms.id,set:{name:area.name,sortOrder:20000+index,integration}});
  }
  for(const item of inventory.entities){
    const entityId=item.state.entity_id;present.add(entityId);const domain=entityId.split(".")[0];
    if(domain==="scene"||domain==="script"){
      const id=`ha_scene_${safe(entityId)}`;const integration:SceneIntegration={source:"home-assistant",homeAssistantEntityId:entityId,enabled:!['unavailable','unknown','off'].includes(item.state.state)};
      const data={name:String(item.state.attributes.friendly_name||item.entity.name||entityId),description:`Home Assistant · ${item.entity.platform||"entity"}`,icon:"Sparkles",gradient:"from-blue-500 to-cyan-600",actions:[],sortOrder:10000+importedScenes,integration};
      await db.insert(scenes).values({id,...data}).onConflictDoUpdate({target:scenes.id,set:data});importedScenes++;continue;
    }
    if(domain==="button"||!['light','switch','fan','cover','climate','lock','sensor','binary_sensor','camera'].includes(domain))continue;
    const mapping=mapHomeAssistantDomain(entityId,item.state.attributes);
    const old=allExisting.find(d=>d.integration?.source==="home-assistant"&&d.integration.homeAssistantEntityId===entityId);
    const areaId=item.entity.area_id||item.device?.area_id;const roomId=areaId?haRoomId(areaId):unassigned;
    const provider=item.entity.platform||"homeassistant";
    const integration:DeviceIntegration={...(old?.integration||{}),source:"home-assistant",homeAssistantEntityId:entityId,entityDomain:domain,provider,manufacturer:item.device?.manufacturer,model:item.device?.model,areaId,accountPresent:true,syncedAt:new Date().toISOString()};
    const data={name:String(item.device?.name_by_user||item.device?.name||item.state.attributes.friendly_name||item.entity.name||item.entity.original_name||entityId),category:mapping.category,icon:old?.icon||mapping.icon,roomId:old?.integration?.roomOverride?old.roomId:roomId,protocol:`Home Assistant · ${provider}`,online:item.state.state!=="unavailable",state:mapHomeAssistantState(item.state),integration:syncedIntegration(integration),sortOrder:old?.sortOrder??30000+updated+added,updatedAt:new Date()};
    if(old){await db.update(devices).set(data).where(eq(devices.id,old.id));updated++;}else{await db.insert(devices).values({id:`ha_${safe(entityId)}`,tuyaDeviceId:null,...data});added++;}
  }
  for(const row of allExisting.filter(d=>d.integration?.source==="home-assistant"&&d.integration.homeAssistantEntityId&&!present.has(d.integration.homeAssistantEntityId))){
    await db.update(devices).set({online:false,integration:syncedIntegration({...row.integration!,accountPresent:false})}).where(eq(devices.id,row.id));
  }
  await db.insert(activityLogs).values({deviceName:"Generic provider sync",action:`Home Assistant imported ${added} new and updated ${updated} entities; ${importedScenes} scenes/scripts.`,type:"system",source:"Home Assistant"});
  return{entities:inventory.entities.length,areas:inventory.areas.length,added,updated,importedScenes,providers:[...new Set(inventory.entities.map(x=>x.entity.platform||"homeassistant"))].sort()};
}
