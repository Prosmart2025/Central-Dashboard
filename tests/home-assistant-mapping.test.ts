import test from "node:test";
import assert from "node:assert/strict";
import {mapHomeAssistantDomain,mapHomeAssistantState} from "../src/lib/home-assistant-mapping";

test("maps Shelly light/switch and Sonoff entities by domain without name guessing",()=>{
 assert.deepEqual(mapHomeAssistantDomain("switch.sonoff_relay",{}),{category:"socket",icon:"Zap",readOnly:false});
 assert.deepEqual(mapHomeAssistantDomain("light.shelly_dimmer",{}),{category:"light",icon:"Lightbulb",readOnly:false});
 assert.deepEqual(mapHomeAssistantDomain("cover.shelly_shutter",{}),{category:"curtain",icon:"Blinds",readOnly:false});
});
test("maps provider-reported state without manufacturing sensor values",()=>{
 const climate=mapHomeAssistantState({entity_id:"climate.office",state:"cool",attributes:{temperature:22,current_temperature:24,fan_mode:"medium"}});
 assert.equal(climate.isOn,true);assert.equal(climate.targetTemp,22);assert.equal(climate.currentTemp,24);assert.equal(climate.fanSpeed,"mid");
 const unavailable=mapHomeAssistantState({entity_id:"switch.gone",state:"unavailable",attributes:{}});assert.equal(unavailable.readOnly,true);assert.equal(unavailable.isOn,false);
 const sensor=mapHomeAssistantState({entity_id:"sensor.temp",state:"invalid",attributes:{device_class:"temperature"}});assert.equal(sensor.currentTemp,undefined);
});
test("cover state uses actual reported position",()=>{
 const cover=mapHomeAssistantState({entity_id:"cover.shutter",state:"open",attributes:{current_position:68}});assert.equal(cover.curtainPosition,68);assert.equal(cover.curtainState,"open");
});
