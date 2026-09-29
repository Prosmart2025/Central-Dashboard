import test from "node:test";
import assert from "node:assert/strict";
import {applyChannelLabels,mergeChannelOverrides,parseTuyaChannelNames,sceneActionKey,resolveControlRoute,controlFailure} from "../src/lib/device-preferences";
import {dispatchStandardControl} from "../src/lib/control-execution";
import {buildInfraredRequest,buildInfraredRequests} from "../src/lib/infrared-plan";
import {climateTemperatures,climateFans,nearestTemperature} from "../src/lib/climate-controls";
import type {DeviceIntegration,InfraredBinding,TuyaFunction} from "../src/types/integration";
import type {SmartDevice} from "../src/types/smart-home";
const functions:TuyaFunction[]=[{code:"switch_1",type:"Boolean"},{code:"switch_2",type:"Boolean"},{code:"switch_backlight",type:"Boolean"}];
const channels=[{code:"switch_1",label:"Gang 1",isOn:false},{code:"switch_2",label:"Gang 2",isOn:true}];
const names={switch_1:"Office LED",switch_2:"Office Spots"};
const meta:DeviceIntegration={source:"smartlife",category:"kg",functions,reported:{switch_1:false,switch_2:true},functionsFetchedAt:new Date().toISOString(),tuyaChannelNames:names};

test("imports only known gang names, never main-device or settings labels",()=>{
 const imported=parseTuyaChannelNames([{identifier:"switch_1",name:"Ceiling"},{identifier:"switch_2",name:"Desk"},{identifier:"main",name:"Device name"},{identifier:"switch_backlight",name:"Backlight"},{identifier:"1",name:"Not an exact code"}],functions);
 assert.deepEqual(imported,{switch_1:"Ceiling",switch_2:"Desk"});
});
test("custom gang name wins and survives reimport/refresh; blank resets to Tuya",()=>{
 const overrides=mergeChannelOverrides(undefined,{switch_2:"Desk lamp"},functions);
 const state=applyChannelLabels({channels},{...meta,channelNames:overrides});
 assert.equal(state.channels?.[0].label,"Office LED");assert.equal(state.channels?.[1].label,"Desk lamp");assert.equal(state.channels?.[1].labelSource,"custom");
 assert.equal(state.channels?.[1].isOn,true);
 const reimport=applyChannelLabels({channels},{...meta,channelNames:overrides,tuyaChannelNames:{switch_2:"Updated in app"}});
 assert.equal(reimport.channels?.[1].label,"Desk lamp");
 const reset=mergeChannelOverrides(overrides,{switch_2:""},functions);
 assert.equal(applyChannelLabels({channels},{...meta,channelNames:reset}).channels?.[1].label,"Office Spots");
});
test("invalid rename never changes gang identity or state",()=>{
 assert.throws(()=>mergeChannelOverrides(undefined,{switch_9:"Wrong"},functions));
 assert.throws(()=>mergeChannelOverrides(undefined,{switch_1:"A".repeat(81)},functions));
 assert.throws(()=>mergeChannelOverrides(undefined,{switch_1:"Line\nBreak"},functions));
});
test("cached switch action needs one provider send, no preflight reads or sleeps",async()=>{
 const calls:string[]=[];
 const result=await dispatchStandardControl({online:true,integration:meta},{channelCode:"switch_2",channelValue:false},{
  loadSpec:async()=>{calls.push("spec");return {functions};},readState:async()=>{calls.push("read");return {category:"kg",online:true,status:meta.reported};},
  send:async(commands)=>{calls.push("send");assert.deepEqual(commands,[{code:"switch_2",value:false}]);return true;},
 });
 assert.deepEqual(calls,["send"]);assert.equal(result.capabilitiesCached,true);assert.equal(result.preflightRead,false);
});
test("stale metadata is refreshed once, offline devices cannot be sent commands",async()=>{
 let spec=0,read=0,sends=0;
 const api={loadSpec:async()=>{spec++;return {functions};},readState:async()=>{read++;return {category:"kg",online:false,status:meta.reported};},send:async()=>{sends++;return true;}};
 await assert.rejects(dispatchStandardControl({online:false,integration:{...meta,functionsFetchedAt:"2020-01-01T00:00:00Z"}},{isOn:true},api));
 assert.equal(spec,1);assert.equal(read,1);assert.equal(sends,0);
});
test("shutter percentage move still gets a fresh calibration/direction read",async()=>{
 const fs:TuyaFunction[]=[{code:"control",type:"Enum",values:{range:["open","close","stop"]}},{code:"percent_control",type:"Integer",values:{min:0,max:100,step:1}}];
 let read=0;
 await dispatchStandardControl({online:true,integration:{...meta,category:"clkg",functions:fs}},{curtainPosition:70},{loadSpec:async()=>({functions:fs}),readState:async()=>{read++;return{category:"clkg",online:true,status:{control_back_mode:"back",cur_calibration:"end"}};},send:async(commands)=>{assert.deepEqual(commands,[{code:"percent_control",value:70}]);return true;}});
 assert.equal(read,1);
});

const ir:InfraredBinding={hubId:"test-hub",remoteId:"test-ac",categoryId:5,available:true,keys:[],keyRange:[{mode:0,temp_list:[{temp:20,fan_list:[{fan:0},{fan:1}]},{temp:22,fan_list:[{fan:0}]}]},{mode:1,temp_list:[{temp:25,fan_list:[{fan:3}]}]}]};
test("IR quota is identified as IR-specific, with no invented reset time",()=>{
 const error=Object.assign(new Error("Your controllable device pool quota is insufficient."),{code:60001001});
 const failure=controlFailure(error,"Tuya IR");assert.equal(failure.code,"IR_CONTROL_QUOTA");assert.equal(failure.httpStatus,409);assert.match(failure.message,/No IR signal/);assert.match(failure.message,/did not provide a reset time/);
});
test("IR ON/OFF and isolated temperature use dedicated single-key endpoint",()=>{
 assert.deepEqual(buildInfraredRequest(ir,{isOn:false},{}),{path:"/v2.0/infrareds/test-hub/air-conditioners/test-ac/command",body:{code:"power",value:0}});
 assert.equal(buildInfraredRequest(ir,{targetTemp:20},{mode:"cool"}).body.value,20);
});
test("IR rejects unsupported mode/temp/fan combinations before transmission",()=>{
 assert.throws(()=>buildInfraredRequest(ir,{isOn:true,mode:"heat",targetTemp:20,fanSpeed:"low"},{}));
 assert.throws(()=>buildInfraredRequest(ir,{isOn:true,mode:"cool",targetTemp:22,fanSpeed:"high"},{}));
 assert.throws(()=>buildInfraredRequest(ir,{isOn:"true"},{}));
 assert.throws(()=>buildInfraredRequest(ir,{targetTemp:20.5},{}));
});
test("IR raw keys require their actual key ID and never auto-switch format",()=>{
 const tv:InfraredBinding={...ir,categoryId:2,keys:[{key:"power",standard_key:false,key_id:12},{key:"volume",key_id:9}]};
 const request=buildInfraredRequest(tv,{remoteKey:"power"},{});assert.match(request.path,/raw\/command$/);assert.equal(request.body.key_id,12);
 assert.throws(()=>buildInfraredRequest(tv,{remoteKey:"volume"},{}));
});
test("multi-setting AC commands use ordered documented single fields without model-specific exceptions",()=>{
 const plans=buildInfraredRequests(ir,{isOn:true,mode:"cool",targetTemp:20,fanSpeed:"auto"},{});
 assert.deepEqual(plans.map(p=>p.body),[{code:"power",value:1},{code:"mode",value:0},{code:"temp",value:20},{code:"wind",value:0}]);
 assert.ok(plans.every(p=>p.path.endsWith("/command")&&!p.path.includes("scenes")));
});

test("scene routing is opt-in and matches only the exact assigned action",()=>{
 const integration:DeviceIntegration={source:"smartlife",infrared:ir,irControlMode:"scenes",sceneBindings:[{request:{isOn:true},sceneId:"exact-on-scene"},{request:{mode:"cool",isOn:true,targetTemp:20,fanSpeed:"auto"},sceneId:"exact-settings"}]};
 assert.deepEqual(resolveControlRoute(integration,{isOn:true}),{kind:"scene",sceneId:"exact-on-scene"});
 assert.deepEqual(resolveControlRoute(integration,{fanSpeed:"auto",targetTemp:20,isOn:true,mode:"cool"}),{kind:"scene",sceneId:"exact-settings"});
 assert.throws(()=>resolveControlRoute(integration,{isOn:false}));
 assert.throws(()=>resolveControlRoute(integration,{fanSpeed:"auto",targetTemp:22,isOn:true,mode:"cool"}));
 assert.deepEqual(resolveControlRoute({...integration,irControlMode:"direct"},{isOn:true}),{kind:"infrared"});
 assert.equal(sceneActionKey({isOn:true,targetTemp:20}),sceneActionKey({targetTemp:20,isOn:true}));
});
test("AC dial uses supported temperatures and does not invent intermediate values",()=>{
 const device={id:"fake",name:"fake",roomId:"fake",icon:"AirVent",category:"climate",online:true,state:{},integration:{source:"smartlife",infrared:ir}} as SmartDevice;
 assert.deepEqual(climateTemperatures(device,"cool"),[20,22]);
 assert.equal(nearestTemperature(climateTemperatures(device,"cool"),21.8),22);
 assert.deepEqual(climateFans(device,"heat",25),["high"]);
 const realThermostat={...device,integration:{source:"smartlife" as const,functions:[{code:"temp_set",type:"Integer",values:{min:160,max:180,scale:1,step:5}}]}};
 assert.deepEqual(climateTemperatures(realThermostat,"cool"),[16,16.5,17,17.5,18]);
});
