import {test,expect,type Page} from "@playwright/test";
const HOME="test-home";
const fixtureSwitch={id:"pref_switch",name:"Preference switch",roomId:"fixture_room",category:"socket",icon:"Zap",protocol:"Smart Life",online:true,tuyaDeviceId:"fake-switch",state:{isOn:false,channels:[{code:"switch_1",label:"App ceiling",isOn:false},{code:"switch_2",label:"App desk",isOn:false}]},integration:{source:"smartlife",homeId:HOME,category:"kg",reported:{switch_1:false,switch_2:false},tuyaChannelNames:{switch_1:"App ceiling",switch_2:"App desk"},channelNames:{},functions:[{code:"switch_1",type:"Boolean"},{code:"switch_2",type:"Boolean"}]}};
const fixtureAc={id:"pref_ac",name:"Dial AC",roomId:"fixture_room",category:"climate",icon:"AirVent",protocol:"Smart Life",online:true,tuyaDeviceId:"fake-ac",state:{isOn:false,targetTemp:22,mode:"cool",fanSpeed:"auto"},integration:{source:"smartlife",homeId:HOME,category:"infrared_ac",functions:[],reported:{},irControlMode:"direct",sceneBindings:[],infrared:{hubId:"fake-hub",remoteId:"fake-remote",categoryId:5,available:true,keys:[],keyRange:[{mode:0,temp_list:[20,22,24,26].map(temp=>({temp,fan_list:[{fan:0},{fan:1}]}))},{mode:1,temp_list:[24,26].map(temp=>({temp,fan_list:[{fan:3}]}))}]}}};

async function setup(page:Page, options:{verify?:boolean;quota?:boolean}={}){
 const fixtures:any[]=structuredClone([fixtureSwitch,fixtureAc]);
 const stats={commands:[] as Array<Record<string,unknown>>,metadata:[] as Array<Record<string,unknown>>,reads:0,imports:0,irRefresh:0};
 const applyNames=(d:any)=>{d.state.channels=d.state.channels?.map((ch:any)=>({...ch,label:d.integration.channelNames?.[ch.code]||d.integration.tuyaChannelNames?.[ch.code]||ch.code}));};
 await page.route("**/api/**",async route=>{
  const path=new URL(route.request().url()).pathname;
   if(path==="/api/smartlife")return route.fulfill({json:{success:true,data:{connected:true}}});
   if(path==="/api/home-assistant")return route.fulfill({json:{success:true,data:{configured:true,connected:true,entities:[{entityId:"climate.dining_ac",name:"Dining AC Local",domain:"climate",state:"off"},{entityId:"remote.living_tv",name:"Living TV Local",domain:"remote",state:"on"}]}}});
  if(path==="/api/devices")return route.fulfill({json:{success:true,data:fixtures}});
  if(path==="/api/rooms")return route.fulfill({json:{success:true,data:[{id:"all",name:"All Devices",icon:"Home"},{id:"fixture_room",name:"Test room",icon:"Home"}]}});
  if(path==="/api/scenes")return route.fulfill({json:{success:true,data:[{id:"test_scene_on",name:"My AC ON scene",icon:"Sparkles",gradient:"from-cyan-500 to-blue-600",actions:[],integration:{source:"smartlife",homeId:HOME,sceneId:"tuya-test-scene",enabled:true}}]}});
  if(path==="/api/devices/pref_switch/channel-names"){
   stats.imports++;const d=fixtures[0];d.integration.tuyaChannelNames.switch_1="Refreshed Tuya ceiling";applyNames(d);
   return route.fulfill({json:{success:true,data:d,message:"Names imported; local overrides retained."}});
  }
  if(path==="/api/devices/pref_ac/infrared"){stats.irRefresh++;return route.fulfill({json:{success:true,data:fixtures[1],message:"Definition refreshed. No signal sent."}});}
  const d=fixtures.find(x=>path===`/api/devices/${x.id}`);
  if(d){
   if(route.request().method()==="PATCH"){
    const body=route.request().postDataJSON();
     if(!body.state){stats.metadata.push(body);if(body.channelNames){d.integration.channelNames=body.channelNames;applyNames(d);}if(body.irControlMode)d.integration.irControlMode=body.irControlMode;if(body.sceneBindings)d.integration.sceneBindings=body.sceneBindings;if(body.homeAssistantEntityId!==undefined)d.integration.homeAssistantEntityId=body.homeAssistantEntityId||undefined;if(body.clearCommandError)d.integration.command=undefined;
      return route.fulfill({json:{success:true,data:d}});
    }
    stats.commands.push(body.state);
    if(options.quota&&d.id==="pref_ac"&&d.integration.irControlMode!=="scenes"){
     const message="Tuya's separate IR developer API rejected this action (60001001: control-pool quota). No IR signal was sent.";
     d.integration.command={id:"test-rejected",status:"failed",code:"IR_CONTROL_QUOTA",message,provider:"Tuya IR",at:new Date().toISOString()};
     return route.fulfill({status:409,json:{success:false,error:message,message,code:"IR_CONTROL_QUOTA",data:d}});
    }
    const message=d.integration.irControlMode==="scenes"?"Tuya accepted the explicitly assigned scene. No developer IR request was used.":"Provider accepted; checking reported state separately…";
    d.integration.command={id:"test-receipt",status:"accepted",message,provider:"test-provider",at:new Date().toISOString(),requested:body.state};
    return route.fulfill({json:{success:true,message,confirmed:false,verificationPending:Boolean(options.verify),commandId:"test-receipt",data:d}});
   }
   stats.reads++;if(options.verify){await new Promise(r=>setTimeout(r,450));d.state.isOn=true;d.state.channels[0].isOn=true;d.integration.reported.switch_1=true;d.integration.command.status="confirmed";d.integration.command.message="Tuya reported the requested state.";}
   return route.fulfill({json:{success:true,data:d}});
  }
  // All write requests not explicitly mocked are blocked, including scene actions.
  if(route.request().method()!=="GET")return route.abort();
  return route.continue();
 });
 await page.goto("/");await expect(page.getByRole("button",{name:"Sync Tuya account",exact:true})).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event("smartlife-updated")));
 await expect(page.getByRole("heading",{name:"Preference switch",exact:true})).toBeVisible();return stats;
}

test("rename gangs updates tiles, persists through catalog refresh, and never switches power",async({page})=>{
 const stats=await setup(page);await page.getByRole("heading",{name:"Preference switch",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByText("Rename gangs",{exact:true}).click();
 await dialog.getByLabel("Name for switch_2",{exact:true}).fill("Reading lamp");
 await dialog.getByRole("button",{name:"Save gang names",exact:true}).click();
 await expect(dialog.getByRole("switch",{name:"Reading lamp",exact:true})).toHaveAttribute("aria-checked","false");
 await dialog.getByRole("button",{name:"Import names from Tuya",exact:true}).click();
 await expect(dialog.getByRole("switch",{name:"Reading lamp",exact:true})).toBeVisible();
 await expect(dialog.getByRole("switch",{name:"Refreshed Tuya ceiling",exact:true})).toBeVisible();
 await dialog.getByRole("button",{name:"Close device controls"}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event("smartlife-updated")));
 await expect(page.getByRole("button",{name:"Reading lamp",exact:true})).toBeVisible();
 expect(stats.commands).toEqual([]);expect(stats.imports).toBe(1);
});

test("AC dial respects supported increments and sends immediately without Apply",async({page})=>{
 const stats=await setup(page);await page.getByRole("heading",{name:"Dial AC",exact:true}).click();
 const dialog=page.getByRole("dialog"),dial=dialog.getByRole("slider",{name:"Target temperature dial"});
 await expect(dial).toHaveAttribute("aria-valuenow","22");
 await dialog.getByRole("button",{name:"Increase temperature",exact:true}).click();await expect(dial).toHaveAttribute("aria-valuenow","24");
 await expect.poll(()=>stats.commands.length).toBeGreaterThan(0);expect(stats.commands[0]).toEqual({targetTemp:24});
 await expect(dialog.getByRole("button",{name:"Set temperature only",exact:true})).toHaveCount(0);
 await expect(dialog.getByRole("button",{name:"Apply & turn on",exact:true})).toHaveCount(0);
});

test("quota failure explains IR route and scene mapping is saved without executing",async({page})=>{
 const stats=await setup(page,{quota:true});await page.getByRole("heading",{name:"Dial AC",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:"Send AC ON",exact:true}).click();
 await expect(dialog.getByText(/Tuya's separate IR developer API rejected this action.*No IR signal was sent/).last()).toBeVisible();
 await expect(dialog.getByTestId("ac-control-card").getByRole("button",{name:"Send AC ON",exact:true})).toBeDisabled();
 await expect(dialog.getByText(/Trial Edition documents a limit of 10/)).toBeVisible();
 await dialog.getByLabel("IR control method",{exact:true}).selectOption("scenes");
 await dialog.getByLabel("Action to map",{exact:true}).selectOption(JSON.stringify({isOn:true}));
 await dialog.getByLabel("Scene for action",{exact:true}).selectOption("test_scene_on");
 await dialog.getByRole("button",{name:"Assign scene to action",exact:true}).click();
 await dialog.getByRole("button",{name:"Save control method",exact:true}).click();
 await expect(dialog.getByText(/Scene mode saved/)).toBeVisible();expect(stats.commands.length).toBe(1);
 expect(stats.metadata.at(-1)).toMatchObject({irControlMode:"scenes",sceneBindings:[{request:{isOn:true},sceneId:"test_scene_on"}]});
 await dialog.getByRole("button",{name:"Send AC ON",exact:true}).click();
 await expect(dialog.getByTestId("ac-control-card").getByText(/explicitly assigned scene/)).toBeVisible();expect(stats.commands.length).toBe(2);
});

test("quota retry only clears dashboard block and sends no command",async({page})=>{
 const stats=await setup(page,{quota:true});await page.getByRole("heading",{name:"Dial AC",exact:true}).click();const dialog=page.getByRole("dialog");
 await dialog.getByRole("button",{name:"Send AC ON",exact:true}).click();await expect(dialog.getByRole("button",{name:"Retry direct IR after quota change",exact:true})).toBeVisible();
 await dialog.getByRole("button",{name:"Retry direct IR after quota change",exact:true}).click();
 await expect(dialog.getByTestId("ac-control-card").getByRole("button",{name:"Send AC ON",exact:true})).toBeEnabled();expect(stats.commands.length).toBe(1);expect(stats.metadata.at(-1)).toEqual({clearCommandError:true});
});

test("Home Assistant bridge maps only an explicit compatible entity and does not execute while saving",async({page})=>{
 const stats=await setup(page,{quota:true});await page.getByRole("heading",{name:"Dial AC",exact:true}).click();const dialog=page.getByRole("dialog");
 await dialog.getByText("IR control method / quota alternative",{exact:true}).click();
 await dialog.getByLabel("IR control method",{exact:true}).selectOption("home-assistant");
 await expect(dialog.getByLabel("Home Assistant entity",{exact:true})).toHaveValue("");
 await expect(dialog.getByLabel("Home Assistant entity",{exact:true}).locator("option")).toHaveCount(2);
 await dialog.getByLabel("Home Assistant entity",{exact:true}).selectOption("climate.dining_ac");
 await dialog.getByRole("button",{name:"Save control method",exact:true}).click();
 await expect(dialog.getByText(/Home Assistant bridge saved/)).toBeVisible();
 expect(stats.commands).toEqual([]);expect(stats.metadata.at(-1)).toMatchObject({irControlMode:"home-assistant",homeAssistantEntityId:"climate.dining_ac"});
});

test("generic provider sync is available from Integrations without changing navigation",async({page})=>{
 const stats=await setup(page);await page.getByRole("button",{name:"Panel Settings",exact:true}).click();
 await page.getByRole("button",{name:"Integrations",exact:true}).click();
 await expect(page.getByTestId("generic-integrations")).toBeVisible();
 await expect(page.getByText(/Shelly, Sonoff\/eWeLink/)).toBeVisible();
 expect(stats.commands).toEqual([]);
});

test("asynchronous status confirmation changes power only after a reported GET",async({page})=>{
 const stats=await setup(page,{verify:true});await page.getByRole("heading",{name:"Preference switch",exact:true}).click();
 const gang=page.getByRole("dialog").getByRole("switch",{name:"App ceiling",exact:true});
 await gang.click();await expect(gang).toHaveAttribute("aria-checked","false");
 await expect.poll(()=>stats.reads).toBeGreaterThan(0);await expect(gang).toHaveAttribute("aria-checked","true");expect(stats.commands.length).toBe(1);
});

test("refreshing an IR definition performs metadata lookup only",async({page})=>{
 const stats=await setup(page);await page.getByRole("heading",{name:"Dial AC",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByText("IR control method / quota alternative",{exact:true}).click();
 await dialog.getByRole("button",{name:"Refresh IR definition",exact:true}).click();
 await expect(dialog.getByText("Definition refreshed. No signal sent.",{exact:true})).toBeVisible();expect(stats.irRefresh).toBe(1);expect(stats.commands).toEqual([]);
});
