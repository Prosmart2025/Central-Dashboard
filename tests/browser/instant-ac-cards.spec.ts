import {test,expect,type Page} from "@playwright/test";
const home="fixture-home";
const switchCard={id:"card_switch",name:"Managed switch",category:"socket",icon:"Zap",roomId:"fixture_room",protocol:"Smart Life",online:true,tuyaDeviceId:"fake-switch",state:{isOn:false,channels:[{code:"switch_1",label:"Ceiling",isOn:false}]},integration:{source:"smartlife",homeId:home,reported:{switch_1:false},functions:[{code:"switch_1",type:"Boolean"}]}};
const ac={id:"card_ac",name:"Instant AC",category:"climate",icon:"AirVent",roomId:"fixture_room",protocol:"Smart Life",online:true,tuyaDeviceId:"fake-ac",state:{isOn:true,targetTemp:22,mode:"cool",fanSpeed:"auto"},integration:{source:"smartlife",homeId:home,functions:[],reported:{},infrared:{hubId:"fake-hub",remoteId:"fake-ac",categoryId:5,available:true,keys:[],keyRange:[{mode:0,temp_list:[20,21,22,23,24,25,26].map(temp=>({temp,fan_list:[{fan:0},{fan:1},{fan:3}]}))},{mode:3,temp_list:[{temp:null,fan_list:[{fan:0},{fan:3}]}]}]}}};
const tv={...switchCard,id:"card_tv",name:"Fixture television",category:"remote",icon:"Tv",state:{},integration:{source:"smartlife",infrared:{hubId:"same-hub",remoteId:"tv-remote",categoryId:2,remoteIndex:444,available:true,keys:[{key:"Power",key_id:1,key_name:"On/Off",standard_key:true},{key:"Volume+",key_id:50,key_name:"Volume Up",standard_key:true}]}}};
const sound={...tv,id:"card_sound",name:"Fixture Sound Bar",integration:{source:"smartlife",infrared:{hubId:"same-hub",remoteId:"sound-remote",categoryId:13,available:true,keys:[{key:"opaque-volume",key_id:909,key_name:"Volume Up",standard_key:false}]}}};
async function setup(page:Page,{delay=0,fail=false}={}){
 const data:any[]=structuredClone([switchCard,ac,tv,sound]);
 const stats={sent:[] as Array<{id:string;state:Record<string,unknown>}>,active:0,maxActive:0,metadata:[] as any[],deleted:[] as string[],remoteDeletes:0};
 await page.route("**/api/**",async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==="/api/smartlife")return route.fulfill({json:{success:true,data:{connected:true}}});
  if(path==="/api/devices")return route.fulfill({json:{success:true,data:data.filter(d=>!d.integration.hidden)}});
  if(path==="/api/devices/hidden")return route.fulfill({json:{success:true,data:data.filter(d=>d.integration.hidden)}});
  if(path==="/api/rooms")return route.fulfill({json:{success:true,data:[{id:"all",name:"All Devices",icon:"Home"},{id:"fixture_room",name:"Fixture Room",icon:"Home"}]}});
  if(path==="/api/scenes")return route.fulfill({json:{success:true,data:[]}});
  const d=data.find(v=>path===`/api/devices/${v.id}`);
  if(d){
   if(req.method()==="DELETE"){stats.deleted.push(d.id);d.integration.hidden=true;return route.fulfill({json:{success:true,message:"Hidden only"}});}
   if(req.method()==="PATCH"){
    const body=req.postDataJSON();
    if(!body.state){stats.metadata.push(body);d.integration={...d.integration,...body};return route.fulfill({json:{success:true,data:d}});}
    stats.sent.push({id:d.id,state:body.state});stats.active++;stats.maxActive=Math.max(stats.maxActive,stats.active);if(delay)await new Promise(r=>setTimeout(r,delay));stats.active--;
    const message=fail?"Fixture provider rejected command.":"Accepted; physical response not confirmed.";
    const command={id:`receipt-${stats.sent.length}`,status:fail?"failed":"unconfirmed",message,provider:"fixture",at:new Date().toISOString(),requested:body.state};
    d.integration.command=command;return route.fulfill({status:fail?409:200,json:{success:!fail,message,error:fail?message:undefined,confirmed:false,data:d}});
   }
   return route.fulfill({json:{success:true,data:d}});
  }
  if(req.method()!=="GET"){stats.remoteDeletes++;return route.abort();}
  return route.continue();
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'Sync Tuya account',exact:true})).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event('smartlife-updated')));
 await expect(page.getByRole('heading',{name:'Managed switch',exact:true})).toBeVisible();return {stats,data};
}

test('AC target changes instantly and first request sends immediately; rapid targets coalesce',async({page})=>{
 const {stats}=await setup(page,{delay:900});await page.getByRole('heading',{name:'Instant AC',exact:true}).click();
 const dialog=page.getByRole('dialog'),dial=dialog.getByRole('slider',{name:'Target temperature dial'}),plus=dialog.getByRole('button',{name:'Increase temperature',exact:true});
 await plus.click();await expect(dial).toHaveAttribute('aria-valuenow','23');await expect.poll(()=>stats.sent.length).toBe(1);
 await expect(plus).toBeEnabled();await plus.click();await plus.click();await plus.click();await expect(dial).toHaveAttribute('aria-valuenow','26');
 await expect.poll(()=>stats.sent.length).toBe(2);await expect.poll(()=>stats.active).toBe(0);
 expect(stats.sent).toEqual([{id:'card_ac',state:{targetTemp:23}},{id:'card_ac',state:{targetTemp:26}}]);expect(stats.maxActive).toBe(1);
 await expect(dialog.getByRole('button',{name:/Apply|Set temperature only/})).toHaveCount(0);
});
test('fan-only mode, fan speed and power send without Apply; no temperature is invented',async({page})=>{
 const {stats}=await setup(page);await page.getByRole('heading',{name:'Instant AC',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'fan',exact:true}).click();await expect.poll(()=>stats.sent.length).toBe(1);expect(stats.sent[0].state).toEqual({mode:'fan'});
 await expect(dialog.getByRole('slider',{name:'Target temperature dial'})).toHaveCount(0);
 await dialog.getByRole('button',{name:'high',exact:true}).click();await expect.poll(()=>stats.sent.length).toBe(2);expect(stats.sent[1].state).toEqual({fanSpeed:'high'});
 await dialog.getByRole('button',{name:'Send AC OFF',exact:true}).click();await expect.poll(()=>stats.sent.length).toBe(3);expect(stats.sent[2].state).toEqual({isOn:false});
});
test('provider rejection is visible, never silently retried by instant controls',async({page})=>{
 const {stats}=await setup(page,{delay:500,fail:true});await page.getByRole('heading',{name:'Instant AC',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Increase temperature',exact:true}).click();await dialog.getByRole('button',{name:'Increase temperature',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Fixture provider rejected');await page.waitForTimeout(900);expect(stats.sent.length).toBe(1);
});
test('TV and Sound Bar preserve exact distinct key identities and target cards',async({page})=>{
 const {stats}=await setup(page);await page.getByRole('heading',{name:'Fixture television',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Volume Up',exact:true}).click();await expect.poll(()=>stats.sent.length).toBe(1);expect(stats.sent[0]).toEqual({id:'card_tv',state:{remoteKey:'Volume+'}});
 await page.getByRole('button',{name:'Close device controls'}).click();await page.getByRole('heading',{name:'Fixture Sound Bar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Volume Up',exact:true}).click();await expect.poll(()=>stats.sent.length).toBe(2);expect(stats.sent[1]).toEqual({id:'card_sound',state:{remoteKey:'opaque-volume'}});
});
test('remove card only hides dashboard entry; reload/sync does not resurrect it',async({page})=>{
 const {stats}=await setup(page);page.on('dialog',d=>d.accept());
 const card=page.getByTestId('device-card-card_switch');await card.getByLabel('Card options for Managed switch',{exact:true}).click();await card.getByRole('button',{name:'Remove card',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Managed switch',exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.dispatchEvent(new Event('smartlife-updated')));await page.waitForTimeout(200);await expect(page.getByRole('heading',{name:'Managed switch',exact:true})).toHaveCount(0);
 expect(stats.deleted).toEqual(['card_switch']);expect(stats.remoteDeletes).toBe(0);expect(stats.sent).toEqual([]);
 await page.getByRole('button',{name:'Panel Settings',exact:true}).click();await page.getByRole('button',{name:'Security & Reset',exact:true}).click();await page.getByText('Hidden cards',{exact:true}).click();await page.getByRole('button',{name:'Restore',exact:true}).click();await expect.poll(()=>stats.metadata.some(v=>v.hidden===false)).toBe(true);
});
test('card resizing persists and is clamped to available columns on narrow screens',async({page})=>{
 const {stats}=await setup(page);const card=page.getByTestId('device-card-card_switch');const width=(await card.boundingBox())!.width;
 await card.getByLabel('Card options for Managed switch',{exact:true}).click();await card.getByLabel('Card size for Managed switch',{exact:true}).selectOption('wide');await expect(card).toHaveAttribute('data-card-size','wide');expect((await card.boundingBox())!.width).toBeGreaterThan(width*1.5);
 await card.getByLabel('Card options for Managed switch',{exact:true}).click();await card.getByLabel('Card size for Managed switch',{exact:true}).selectOption('large');await expect(card).toHaveAttribute('data-card-size','large');
 await page.evaluate(()=>window.dispatchEvent(new Event('smartlife-updated')));await expect(card).toHaveAttribute('data-card-size','large');
 await page.setViewportSize({width:390,height:844});await expect(card).toBeVisible();const box=(await card.boundingBox())!;expect(box.width).toBeLessThanOrEqual(390);expect(box.x).toBeGreaterThanOrEqual(0);
 await page.getByRole('heading',{name:'Managed switch',exact:true}).click();await page.getByRole('dialog').getByRole('switch',{name:'Ceiling',exact:true}).click();await expect.poll(()=>stats.sent.length).toBe(1);
});
