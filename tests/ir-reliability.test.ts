import test from "node:test";
import assert from "node:assert/strict";
import {normalizeIrProfile,pairedRemote} from "../src/lib/ir-profile";
import {buildInfraredRequests} from "../src/lib/infrared-plan";
import {climateFans,climateTemperatures} from "../src/lib/climate-controls";
import {mergeCardPreferences,mergeImportedIntegration,cardSpanClass,isCardHidden} from "../src/lib/card-preferences";
import {isIrQuotaPaused,IR_QUOTA_PAUSE_MS} from "../src/lib/ir-quota";
import type {InfraredBinding} from "../src/types/integration";
import type {SmartDevice} from "../src/types/smart-home";
const remote={remote_id:"synthetic-remote",remote_name:"Synthetic AC",category_id:5,remote_index:111,brand_name:"Test brand"};
const payload={category_id:5,remote_index:111,brand_id:100,single_air:false,duplicate_power:false,key_list:[{key:"PowerOn",standard_key:true,key_id:0},{key:"PowerOff",standard_key:true,key_id:0},{key:"T",standard_key:true,key_id:0}],key_range:[{mode:0,temp_list:[{temp:20,fan_list:[{fan:0},{fan:1}]},{temp:22,fan_list:[{fan:3}]}]},{mode:3,temp_list:[{temp:null,fan_list:[{fan:0},{fan:2},{fan:3}]}]},{mode:4,temp_list:[{temp:25,fan_list:[]}]}]};
const ir=normalizeIrProfile("synthetic-hub",remote,payload);

test("IR profile keeps hub and remote distinct, verifies index/category match",()=>{
 assert.equal(ir.hubId,"synthetic-hub");assert.equal(ir.remoteId,"synthetic-remote");assert.equal(ir.singleAir,false);assert.equal(ir.definitionVersion,2);
 assert.throws(()=>normalizeIrProfile("hub",remote,{...payload,remote_index:999}));
 assert.throws(()=>normalizeIrProfile("hub",remote,{...payload,category_id:2}));
 assert.throws(()=>pairedRemote([],ir));assert.equal(pairedRemote([remote],ir).remote_id,remote.remote_id);
});
test("TV standard command follows documented camelCase fields and exact key case",()=>{
 const tv:InfraredBinding={...ir,categoryId:2,keys:[{key:"Power",key_id:1,standard_key:true}]};
 assert.deepEqual(buildInfraredRequests(tv,{remoteKey:"Power"},{}),[{path:"/v2.0/infrareds/synthetic-hub/remotes/synthetic-remote/command",body:{categoryId:2,remoteIndex:111,key:"Power"}}]);
 assert.throws(()=>buildInfraredRequests(tv,{remoteKey:"power"},{}));
});
test("working Sound Bar raw-key contract is preserved",()=>{
 const sound:InfraredBinding={...ir,categoryId:13,keys:[{key:"learned-opaque-key",key_id:123456,standard_key:false}]};
 assert.deepEqual(buildInfraredRequests(sound,{remoteKey:"learned-opaque-key"},{}),[{path:"/v2.0/infrareds/synthetic-hub/remotes/synthetic-remote/raw/command",body:{category_id:13,key_id:123456,key:"learned-opaque-key"}}]);
});
test("same blaster/model uses same generic plan regardless of device name or ID",()=>{
 const peer={...ir,remoteId:"another-remote"};const a=buildInfraredRequests(ir,{isOn:true,mode:"cool",targetTemp:20,fanSpeed:"low"},{}),b=buildInfraredRequests(peer,{isOn:true,mode:"cool",targetTemp:20,fanSpeed:"low"},{});
 assert.deepEqual(a.map(p=>p.body),b.map(p=>p.body));assert.deepEqual(a.map(p=>p.body.code),["power","mode","temp","wind"]);assert.ok(b.every(p=>p.path.includes("another-remote")));
});
test("null-temperature fan modes retain fan speeds without inventing 0°C",()=>{
 const device={id:"fake",category:"climate",integration:{source:"smartlife",infrared:ir},state:{},name:"fake",icon:"AirVent",roomId:"fake",online:true} as SmartDevice;
 assert.deepEqual(climateTemperatures(device,"fan"),[]);assert.deepEqual(climateFans(device,"fan",22),["auto","mid","high"]);
 assert.deepEqual(buildInfraredRequests(ir,{mode:"fan",fanSpeed:"high"},{mode:"cool",targetTemp:20}),[
  {path:"/v2.0/infrareds/synthetic-hub/air-conditioners/synthetic-remote/command",body:{code:"mode",value:3}},
  {path:"/v2.0/infrareds/synthetic-hub/air-conditioners/synthetic-remote/command",body:{code:"wind",value:3}},
 ]);
 assert.throws(()=>buildInfraredRequests(ir,{mode:"fan",targetTemp:22},{}));assert.throws(()=>buildInfraredRequests(ir,{mode:"dry",fanSpeed:"high"},{}));
});
test("unsupported swing is not guessed; standard power is routed through AC API",()=>{
 const swing={...ir,keys:[...ir.keys,{key:"Swing",key_id:10,standard_key:true}]};
 assert.throws(()=>buildInfraredRequests(swing,{swing:true},{}));assert.throws(()=>buildInfraredRequests(swing,{remoteKey:"Swing"},{}));
 assert.equal(buildInfraredRequests(ir,{remoteKey:"PowerOn"},{})[0].body.code,"power");
});
test("dashboard hide and size survive imports and never alter device identity",()=>{
 const prefs=mergeCardPreferences({source:"smartlife",homeId:"h"},{hidden:true,cardSize:"large"});
 assert.equal(isCardHidden({integration:prefs}),true);assert.equal(prefs.cardSize,"large");assert.equal(prefs.homeId,"h");
 const resync=mergeImportedIntegration(prefs,{source:"smartlife",hidden:false,cardSize:"standard",homeId:"h"});
 assert.equal(resync.hidden,true);assert.equal(resync.cardSize,"large");assert.equal(mergeCardPreferences(resync,{hidden:false}).hidden,false);
 assert.throws(()=>mergeCardPreferences(resync,{cardSize:"999px"}));assert.throws(()=>mergeCardPreferences(resync,{hidden:"false"}));
 assert.equal(cardSpanClass("standard"),"");assert.equal(cardSpanClass("wide"),"sm:col-span-2");assert.match(cardSpanClass("large"),/sm:row-span-2/);
});

test("profile with no key_range still allows AC mode, fan and 16-30C temperature",()=>{
 const bare:InfraredBinding={...ir,keyRange:[]};
 const device={id:"f",category:"climate",integration:{source:"smartlife",infrared:bare},state:{},name:"f",icon:"AirVent",roomId:"r",online:true} as SmartDevice;
 assert.equal(climateTemperatures(device,"cool").length,15);assert.deepEqual(climateTemperatures(device,"fan"),[]);
 assert.ok(climateFans(device,"cool",22).includes("high"));
 assert.deepEqual(buildInfraredRequests(bare,{targetTemp:24},{mode:"cool"}).map(p=>p.body),[{code:"temp",value:24}]);
 assert.throws(()=>buildInfraredRequests(bare,{targetTemp:5},{mode:"cool"}));
 assert.throws(()=>buildInfraredRequests(bare,{targetTemp:22.5},{mode:"cool"}));
 // A profile WITH ranges is still strict.
 assert.throws(()=>buildInfraredRequests(ir,{targetTemp:19},{mode:"cool"}));
});
test("quota pause expires instead of locking the card forever",()=>{
 const now=Date.now(),at=(ms:number)=>new Date(now-ms).toISOString();
 assert.equal(isIrQuotaPaused({code:"IR_CONTROL_QUOTA",at:at(1000)},now),true);
 assert.equal(isIrQuotaPaused({code:"IR_CONTROL_QUOTA",at:at(IR_QUOTA_PAUSE_MS+1000)},now),false);
 assert.equal(isIrQuotaPaused({code:"IR_CONTROL_QUOTA"},now),false);
 assert.equal(isIrQuotaPaused({code:"DEVICE_OFFLINE",at:at(1000)},now),false);assert.equal(isIrQuotaPaused(undefined,now),false);
});
