import test from "node:test";
import assert from "node:assert/strict";
import { buildDeviceCommands, commandsMatch, motorList, stateFromSpecification, DeviceControlError } from "../src/lib/device-capabilities";
import type { TuyaFunction } from "../src/types/integration";
const bool=(code:string):TuyaFunction=>({code,type:"Boolean"});
const en=(code:string,range:string[]):TuyaFunction=>({code,type:"Enum",values:JSON.stringify({range})});
const integer=(code:string,min=0,max=100,scale=0,step=1):TuyaFunction=>({code,type:"Integer",values:JSON.stringify({min,max,scale,step})});
const throws=(f:()=>unknown)=>assert.throws(f,(e:unknown)=>e instanceof DeviceControlError);

test("only the requested switch gang is sent",()=>{
 assert.deepEqual(buildDeviceCommands([bool("switch_1"),bool("switch_2"),bool("switch_3")],{},"kg",{channelCode:"switch_2",channelValue:true}),[{code:"switch_2",value:true}]);
});
test("whole switch power includes all gangs, not a settings DP",()=>{
 const p=buildDeviceCommands([bool("switch_1"),bool("switch_2"),bool("switch_backlight")],{},"kg",{isOn:false});
 assert.deepEqual(p,[{code:"switch_1",value:false},{code:"switch_2",value:false}]);
});
test("unsupported, empty and wrong-type requests cannot appear successful",()=>{
 throws(()=>buildDeviceCommands([],{},"infrared_ac",{isOn:true}));
 throws(()=>buildDeviceCommands([bool("switch_1")],{},"kg",{channelCode:"switch_9",channelValue:true}));
 throws(()=>buildDeviceCommands([bool("switch_1")],{},"kg",{isOn:"true"}));
 throws(()=>buildDeviceCommands([bool("switch_1")],{},"kg",{}));
 throws(()=>buildDeviceCommands([bool("switch_1")],{},"kg",{online:true}));
});
test("unsupported additional feature prevents a misleading partial power command",()=>{
 throws(()=>buildDeviceCommands([bool("switch")],{},"kt",{isOn:true,targetTemp:22}));
});
test("explicit shutter open sends control, not percent/stop",()=>{
 const fs=[en("control",["open","stop","close"]),integer("percent_control")];
 assert.deepEqual(buildDeviceCommands(fs,{cur_calibration:"start"},"clkg",{curtainState:"open",curtainPosition:100}),[{code:"control",value:"open"}]);
});
test("uncalibrated shutters reject percentage but permit open/stop commands",()=>{
 const fs=[en("control",["open","stop","close"]),integer("percent_control")];
 throws(()=>buildDeviceCommands(fs,{cur_calibration:"start"},"clkg",{curtainPosition:50}));
 assert.deepEqual(buildDeviceCommands(fs,{cur_calibration:"start"},"clkg",{curtainState:"paused"}),[{code:"control",value:"stop"}]);
});
test("CLKG position inversion follows Tuya/Home Assistant control_back_mode",()=>{
 const fs=[en("control",["open","stop","close"]),integer("percent_control")];
 assert.deepEqual(buildDeviceCommands(fs,{control_back_mode:"forward"},"clkg",{curtainPosition:75}),[{code:"percent_control",value:25}]);
 assert.deepEqual(buildDeviceCommands(fs,{control_back_mode:"back"},"clkg",{curtainPosition:75}),[{code:"percent_control",value:75}]);
 assert.equal(motorList(fs,{percent_control:25,control_back_mode:"forward"},"clkg")[0].position,75);
});
test("second shutter motor never controls first motor accidentally",()=>{
 const fs=[en("control",["open","stop","close"]),integer("percent_control"),en("control_2",["open","stop","close"]),integer("percent_control_2")];
 assert.deepEqual(buildDeviceCommands(fs,{},"clkg",{motorCode:"control_2",curtainState:"closed"}),[{code:"control_2",value:"close"}]);
 assert.deepEqual(buildDeviceCommands(fs,{},"clkg",{motorCode:"all",curtainState:"open"}),[{code:"control",value:"open"},{code:"control_2",value:"open"}]);
});
test("special curtain enums are translated only when published",()=>{
 const fs=[en("mach_operate",["FZ","ZZ","STOP"]),integer("position")];
 assert.deepEqual(buildDeviceCommands(fs,{},"cl",{curtainState:"open"}),[{code:"mach_operate",value:"FZ"}]);
 throws(()=>buildDeviceCommands([en("control",["open","close"])],{},"clkg",{curtainState:"paused"}));
});
test("temperature uses published scale, not a guessed multiplier",()=>{
 assert.deepEqual(buildDeviceCommands([integer("temp_set",16,30,0)],{},"kt",{targetTemp:22}),[{code:"temp_set",value:22}]);
 assert.deepEqual(buildDeviceCommands([integer("temp_set",160,300,1,5)],{},"kt",{targetTemp:22.5}),[{code:"temp_set",value:225}]);
 throws(()=>buildDeviceCommands([integer("temp_set",16,30)],{},"kt",{targetTemp:99}));
});
test("brightness uses each light's published range",()=>{
 assert.deepEqual(buildDeviceCommands([integer("bright_value",25,255)],{},"dj",{brightness:50}),[{code:"bright_value",value:140}]);
});
test("empty IR capabilities do not fabricate a power state or thermostat data",()=>{
 const state=stateFromSpecification({functions:[],status:[]},[],"infrared_ac","climate");
 assert.equal(state.isOn,undefined); assert.equal(state.targetTemp,undefined); assert.equal(state.currentTemp,undefined); assert.equal(state.readOnly,true);
});
test("commands are confirmed only by matching reported data",()=>{
 assert.equal(commandsMatch([{code:"switch_2",value:true}],{switch_2:false}),false);
 assert.equal(commandsMatch([{code:"switch_2",value:true}],{}),false);
 assert.equal(commandsMatch([{code:"switch_2",value:true}],{switch_2:true}),true);
 assert.equal(commandsMatch([{code:"control",value:"open"}],{control:"open"}),false);
});
