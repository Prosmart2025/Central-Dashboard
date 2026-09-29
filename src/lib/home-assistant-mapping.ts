import type { DeviceCategory, DeviceState } from "@/types/smart-home";
import type { HomeAssistantEntity } from "./home-assistant";

export function mapHomeAssistantDomain(entityId:string,attributes:Record<string,unknown>):{category:DeviceCategory;icon:string;readOnly:boolean} {
  const domain=entityId.split(".")[0];
  const deviceClass=String(attributes.device_class||"");
  switch(domain){
    case "light":return{category:"light",icon:"Lightbulb",readOnly:false};
    case "switch":return{category:"socket",icon:"Zap",readOnly:false};
    case "fan":return{category:"fan",icon:"Wind",readOnly:false};
    case "cover":return{category:"curtain",icon:"Blinds",readOnly:false};
    case "climate":return{category:"climate",icon:"AirVent",readOnly:false};
    case "lock":return{category:"lock",icon:"Lock",readOnly:false};
    case "camera":return{category:"camera",icon:"Camera",readOnly:true};
    case "binary_sensor":return{category:"sensor",icon:deviceClass==="motion"||deviceClass==="occupancy"?"Eye":"Gauge",readOnly:true};
    default:return{category:"sensor",icon:"Gauge",readOnly:true};
  }
}
const n=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:undefined;
export function mapHomeAssistantState(entity:HomeAssistantEntity):DeviceState {
  const domain=entity.entity_id.split(".")[0],a=entity.attributes||{};
  const state:DeviceState={reportedAt:entity.last_updated||new Date().toISOString()};
  if(["switch","light","fan"].includes(domain))state.isOn=entity.state==="on";
  if(domain==="light"&&n(a.brightness)!==undefined)state.brightness=Math.round(n(a.brightness)!/255*100);
  if(domain==="fan"){state.isOn=entity.state==="on";if(n(a.percentage)!==undefined)state.presetScene=`${n(a.percentage)}%`;}
  if(domain==="cover"){
    state.curtainPosition=n(a.current_position);
    state.curtainState=entity.state==="open"||entity.state==="opening"?"open":entity.state==="closed"||entity.state==="closing"?"closed":"paused";
  }
  if(domain==="climate"){
    state.isOn=entity.state!=="off"&&entity.state!=="unavailable";
    state.targetTemp=n(a.temperature);state.currentTemp=n(a.current_temperature);state.humidity=n(a.current_humidity);
    if(["cool","heat","auto","dry","fan_only"].includes(entity.state))state.mode=(entity.state==="fan_only"?"fan":entity.state) as DeviceState["mode"];
    if(typeof a.fan_mode==="string")state.fanSpeed=({medium:"mid"} as Record<string,string>)[a.fan_mode] as DeviceState["fanSpeed"]||(["auto","low","mid","high"].includes(a.fan_mode)?a.fan_mode as DeviceState["fanSpeed"]:undefined);
  }
  if(domain==="lock")state.isLocked=entity.state==="locked";
  if(domain==="binary_sensor")state.motionDetected=entity.state==="on";
  if(domain==="sensor"){
    const value=Number(entity.state);if(Number.isFinite(value)){const cls=String(a.device_class||"");if(cls==="temperature")state.currentTemp=value;else if(cls==="humidity")state.humidity=value;else if(cls==="battery")state.battery=value;else if(cls==="power")state.powerWatts=value;else if(cls==="energy")state.energyKwh=value;}
  }
  state.readOnly=["sensor","binary_sensor","camera"].includes(domain)||["unavailable","unknown"].includes(entity.state);
  if(state.readOnly)state.readOnlyReason=["unavailable","unknown"].includes(entity.state)?"Provider reports this entity unavailable.":"Read-only Home Assistant entity.";
  return state;
}
