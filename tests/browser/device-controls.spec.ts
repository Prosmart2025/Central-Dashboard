import { test, expect, type Page } from "@playwright/test";

// Synthetic devices and intercepted commands ONLY. These tests never control a home.
const at = "2026-01-01T00:00:00.000Z";
const base = { online:true, roomId:"fixture_room", protocol:"Smart Life",sortOrder:0,updatedAt:at };
const switchDevice={...base,id:"fixture_switch",name:"Fixture wall switch",category:"socket",icon:"Zap",tuyaDeviceId:"fixture_remote_switch",
 state:{isOn:false,channels:[{code:"switch_1",label:"Gang 1",isOn:false},{code:"switch_2",label:"Gang 2",isOn:false}]},
 integration:{source:"smartlife",category:"kg",functions:[{code:"switch_1",type:"Boolean"},{code:"switch_2",type:"Boolean"}],reported:{switch_1:false,switch_2:false}}};
const cover={...base,id:"fixture_cover",name:"Fixture dual shutter",category:"curtain",icon:"Blinds",tuyaDeviceId:"fixture_remote_cover",
 state:{curtainPosition:35,motors:[1,2].map(n=>({id:n===1?"control":"control_2",label:`Motor ${n}`,position:35,canOpen:true,canClose:true,canStop:true,canPosition:n===2,calibrated:n===2}))},
 integration:{source:"smartlife",category:"clkg",functions:[{code:"control",type:"Enum",values:'{"range":["open","stop","close"]}'},{code:"control_2",type:"Enum",values:'{"range":["open","stop","close"]}'}],reported:{control:"stop",control_2:"stop"}}};
const ac={...base,id:"fixture_ac",name:"Fixture IR AC",category:"climate",icon:"AirVent",tuyaDeviceId:"fixture_ir_ac",state:{isOn:false},integration:{source:"smartlife",category:"infrared_ac",functions:[],reported:{},infrared:{hubId:"fixture_hub",remoteId:"fixture_remote",categoryId:5,keys:[],available:true,keyRange:[{mode:0,temp_list:[{temp:22,fan_list:[{fan:0}]}]}]}}};
const fixtures=[switchDevice,cover,ac];
async function setup(page:Page, accept=false) {
 const stats={commands:[] as Array<{id:string;state:Record<string,unknown>}>,scenes:0,groups:[] as string[]};
 await page.route("**/api/**",async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  if(path==="/api/smartlife")return route.fulfill({json:{success:true,data:{connected:true}}});
  if(path==="/api/devices")return route.fulfill({json:{success:true,data:fixtures}});
  if(path==="/api/rooms")return route.fulfill({json:{success:true,data:[{id:"all",name:"All Devices",icon:"LayoutGrid"},{id:"fixture_room",name:"Workshop from Tuya",icon:"Home",integration:{source:"smartlife",homeId:"h1",homeName:"Fixture Home"}}]}});
  if(path==="/api/scenes")return route.fulfill({json:{success:true,data:[{id:"fixture_scene",name:"Fixture Tuya scene",icon:"Sparkles",gradient:"from-teal-500 to-cyan-600",actions:[],integration:{source:"smartlife",homeId:"h1",sceneId:"scene1"}}]}});
  if(path.startsWith("/api/favorites/") && path.endsWith("/trigger")) {
    stats.groups.push(route.request().postDataJSON().action);
    return route.fulfill({json:{success:true,confirmed:0,applied:1,total:1,results:[],message:"Fixture group request accepted; movement unconfirmed."}});
  }
  if(path==="/api/scenes/fixture_scene/trigger"){stats.scenes++;return route.fulfill({status:502,json:{success:false,error:"Fixture scene rejected"}});}
  const fixture=fixtures.find(d=>path===`/api/devices/${d.id}`);
  if(fixture){
   if(route.request().method()==="PATCH"){
    stats.commands.push({id:fixture.id,state:route.request().postDataJSON().state});
    await new Promise(r=>setTimeout(r,900));
    const message=accept?"Tuya accepted the command but has not reported the requested state.":"Fixture provider rejected the command; state unchanged.";
    return route.fulfill({status:accept?200:502,json:{success:accept,confirmed:false,message,error:accept?undefined:message,data:{...fixture,integration:{...fixture.integration,command:{status:accept?"accepted":"failed",message,provider:"fixture",at}}}}});
   }
   return route.fulfill({json:{success:true,data:fixture}});
  }
  if(route.request().method()!=="GET") return route.abort();
  return route.continue();
 });
 await page.goto("/");
 // Wait until the mocked connection check has hydrated the dashboard before
 // dispatching the custom refresh event; otherwise no listener exists yet.
 await expect(page.getByRole("button",{name:"Sync Tuya account",exact:true})).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event("smartlife-updated")));
 await expect(page.getByRole("heading",{name:"Fixture wall switch",exact:true})).toBeVisible();
 return stats;
}

test("failed gang request never flips its visual or reported state",async({page})=>{
 const stats=await setup(page);
 await page.getByRole("heading",{name:"Fixture wall switch",exact:true}).click();
 const dialog=page.getByRole("dialog");const gang=dialog.getByRole("switch",{name:"Gang 2",exact:true});
 await expect(gang).toHaveAttribute("aria-checked","false");await gang.click();
 await expect(gang).toBeDisabled();await expect(gang).toHaveAttribute("aria-checked","false");
 await expect(dialog.getByRole("alert")).toContainText("provider rejected");
 await expect(gang).toBeEnabled();await expect(gang).toHaveAttribute("aria-checked","false");
 expect(stats.commands).toEqual([{id:"fixture_switch",state:{channelCode:"switch_2",channelValue:true}}]);
});

test("cloud acceptance without reported feedback does not fake switch ON",async({page})=>{
 await setup(page,true);await page.getByRole("heading",{name:"Fixture wall switch",exact:true}).click();
 const dialog=page.getByRole("dialog");const gang=dialog.getByRole("switch",{name:"Gang 1",exact:true});
 await gang.click();await expect(dialog.getByText("Tuya accepted the command but has not reported the requested state.",{exact:true})).toBeVisible();
 await expect(gang).toHaveAttribute("aria-checked","false");
});

test("dual shutter addresses motor 2 explicitly without simultaneous stop or percentage",async({page})=>{
 const stats=await setup(page,true);await page.getByRole("heading",{name:"Fixture dual shutter",exact:true}).click();
 const dialog=page.getByRole("dialog");await expect(dialog.getByText(/unfinished travel calibration/)).toBeVisible();
 await dialog.getByRole("button",{name:"Open",exact:true}).nth(1).click();
 await expect.poll(()=>stats.commands.length).toBe(1);
 expect(stats.commands[0]).toEqual({id:"fixture_cover",state:{motorCode:"control_2",curtainState:"open"}});
});

test("IR AC opens paired remote controls rather than generic thermostat toggles",async({page})=>{
 const stats=await setup(page,true);await page.getByRole("heading",{name:"Fixture IR AC",exact:true}).click();
 const dialog=page.getByRole("dialog");await expect(dialog.getByText("Paired Tuya infrared remote",{exact:true})).toBeVisible();
 await expect(dialog.getByText("Infrared · no appliance state feedback",{exact:true})).toBeVisible();
 await dialog.getByRole("button",{name:"Send AC ON",exact:true}).click();
 await expect.poll(()=>stats.commands.length).toBe(1);expect(stats.commands[0]).toEqual({id:"fixture_ac",state:{isOn:true}});
});

test("actual room names refresh and a rejected Tuya scene stays rejected",async({page})=>{
 const stats=await setup(page);
 await expect(page.getByRole("button",{name:/Workshop from Tuya/})).toBeVisible();
 await page.getByRole("button",{name:/Fixture Tuya scene/}).click();
 await expect.poll(()=>stats.scenes).toBe(1);
 await expect(page.getByText("Fixture scene rejected",{exact:true})).toBeVisible();
 expect(stats.commands.length).toBe(0);
});


test("opening shutter group does nothing until an explicit stop/open/close is selected",async({page})=>{
 const stats=await setup(page,true);
 await page.getByRole("button",{name:/All Shutters/}).click();
 const dialog=page.getByRole("dialog",{name:"All Shutters group controls"});
 await expect(dialog).toBeVisible();expect(stats.groups).toEqual([]);
 await dialog.getByRole("button",{name:"Stop all",exact:true}).click();
 await expect.poll(()=>stats.groups.length).toBe(1);expect(stats.groups).toEqual(["stop"]);
 await expect(dialog.getByRole("status")).toContainText("movement unconfirmed");
});
