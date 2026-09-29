import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

async function withServer(run:(url:string,requests:Array<{path:string;body:any}>)=>Promise<void>){
 const requests:Array<{path:string;body:any}>=[];
 const server=http.createServer(async(req,res)=>{let raw="";for await(const c of req)raw+=c;requests.push({path:req.url||"",body:raw?JSON.parse(raw):null});res.setHeader("Content-Type","application/json");res.end(JSON.stringify(req.url==="/api/"?{message:"API running."}:[]));});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const a=server.address();try{await run(`http://127.0.0.1:${typeof a==='object'&&a?a.port:0}`,requests);}finally{await new Promise<void>(r=>server.close(()=>r()));}
}
test("Home Assistant climate commands map exactly to documented service calls",async()=>withServer(async(url,requests)=>{
 process.env.HOME_ASSISTANT_URL=url;process.env.HOME_ASSISTANT_TOKEN="test-token";
 const {sendHomeAssistantControl}=await import("../src/lib/home-assistant");
 const result=await sendHomeAssistantControl("climate.dining_ac",{isOn:true,mode:"cool",targetTemp:22,fanSpeed:"high"});
 assert.equal(result.sent,4);assert.deepEqual(requests.map(r=>r.path),["/api/services/climate/turn_on","/api/services/climate/set_hvac_mode","/api/services/climate/set_temperature","/api/services/climate/set_fan_mode"]);
  assert.equal(requests[2].body.temperature,22);
}));
test("Home Assistant remote sends exact key and rejects unsupported thermostat request",async()=>withServer(async(url,requests)=>{
 process.env.HOME_ASSISTANT_URL=url;process.env.HOME_ASSISTANT_TOKEN="test-token";const {sendHomeAssistantControl}=await import("../src/lib/home-assistant");
 await sendHomeAssistantControl("remote.living_tv",{remoteKey:"Power"});assert.deepEqual(requests[0],{path:"/api/services/remote/send_command",body:{entity_id:"remote.living_tv",command:"Power"}});
  await assert.rejects(sendHomeAssistantControl("remote.living_tv",{targetTemp:22}));
}));
