import "server-only";
import WebSocket from "ws";
import { getHomeAssistantConfig, listHomeAssistantEntities, type HomeAssistantEntity } from "./home-assistant";
import { DeviceControlError } from "./device-capabilities";

interface EntityRegistry { entity_id:string; platform?:string; device_id?:string; area_id?:string; name?:string; original_name?:string; disabled_by?:string|null }
interface DeviceRegistry { id:string; name?:string; name_by_user?:string; manufacturer?:string; model?:string; area_id?:string; disabled_by?:string|null }
interface AreaRegistry { area_id:string; name:string }

async function websocketRegistries() {
  const {origin,token}=getHomeAssistantConfig();
  const url=new URL(origin);url.protocol=url.protocol==="https:"?"wss:":"ws:";url.pathname="/api/websocket";
  return new Promise<{entities:EntityRegistry[];devices:DeviceRegistry[];areas:AreaRegistry[]}>((resolve,reject)=>{
    const ws=new WebSocket(url,{handshakeTimeout:10_000});let id=1;const pending=new Map<number,(message:any)=>void>();const timer=setTimeout(()=>{ws.terminate();reject(new DeviceControlError("Home Assistant registry request timed out.","HA_TIMEOUT",504));},15_000);
    const fail=(error:unknown)=>{clearTimeout(timer);try{ws.terminate();}catch{}reject(error instanceof Error?error:new Error("WebSocket failed"));};
    ws.on("error",fail);
    ws.on("message",raw=>{
      let message:any;try{message=JSON.parse(raw.toString());}catch{return;}
      if(message.type==="auth_required"){ws.send(JSON.stringify({type:"auth",access_token:token}));return;}
      if(message.type==="auth_invalid"){fail(new DeviceControlError("Home Assistant rejected the access token.","HA_AUTH_INVALID",401));return;}
      if(message.type==="auth_ok"){
        const call=(type:string)=>new Promise<any[]>((res,rej)=>{const request=id++;pending.set(request,msg=>msg.success?res(msg.result||[]):rej(new DeviceControlError(`Home Assistant rejected ${type}.`,"HA_REGISTRY_FAILED",502)));ws.send(JSON.stringify({id:request,type}));});
        Promise.all([call("config/entity_registry/list"),call("config/device_registry/list"),call("config/area_registry/list")]).then(([entities,devices,areas])=>{clearTimeout(timer);ws.close();resolve({entities,devices,areas});},fail);return;
      }
      if(typeof message.id==="number"&&pending.has(message.id)){const callback=pending.get(message.id)!;pending.delete(message.id);callback(message);}
    });
  });
}

export interface HomeAssistantCatalogEntity {
  state:HomeAssistantEntity;
  entity:EntityRegistry;
  device?:DeviceRegistry;
  area?:AreaRegistry;
}
export async function getHomeAssistantInventory() {
  const [states,registries]=await Promise.all([listHomeAssistantEntities(),websocketRegistries()]);
  const stateMap=new Map(states.map(s=>[s.entity_id,s]));
  const deviceMap=new Map(registries.devices.map(d=>[d.id,d]));
  const areaMap=new Map(registries.areas.map(a=>[a.area_id,a]));
  const entities:HomeAssistantCatalogEntity[]=[];
  for(const entity of registries.entities){
    if(entity.disabled_by)continue;
    const state=stateMap.get(entity.entity_id);if(!state)continue;
    const device=entity.device_id?deviceMap.get(entity.device_id):undefined;
    if(device?.disabled_by)continue;
    const areaId=entity.area_id||device?.area_id;
    entities.push({state,entity,device,area:areaId?areaMap.get(areaId):undefined});
  }
  // Keep supported states absent from registry (for example helpers) discoverable.
  for(const state of states)if(!registries.entities.some(e=>e.entity_id===state.entity_id))entities.push({state,entity:{entity_id:state.entity_id,platform:"homeassistant"}});
  return {entities,areas:registries.areas,devices:registries.devices};
}
