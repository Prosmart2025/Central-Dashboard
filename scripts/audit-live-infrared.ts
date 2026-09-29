import {config} from "dotenv";
config({path:".env",quiet:true});

/** Read-only live-account comparison. It never calls a POST/control endpoint. */
async function main(){
 const base=process.env.DASHBOARD_AUDIT_URL||"https://tuya-smart-wall-panel.vercel.app";
 const {inspectInfraredPath}=await import("../src/lib/ir-diagnostics");
 const response=await fetch(`${base}/api/devices`,{signal:AbortSignal.timeout(30000)});
 const payload=await response.json();if(!response.ok||!payload.success)throw Error("Could not read dashboard catalog.");
 const remotes=payload.data.filter((d:any)=>d.integration?.infrared);
 const report=[];
 for(const device of remotes){
   try {
     const inspected=await inspectInfraredPath(device.integration.infrared);
     report.push({name:device.name,hub:payload.data.find((d:any)=>d.tuyaDeviceId===inspected.hubId)?.name||"linked hub",brand:inspected.brand,category:inspected.categoryId,profile:inspected.remoteIndex,pairing:inspected.pairingVerified,checks:inspected.checks.length,planFailures:inspected.checks.filter(c=>!c.ok),swingExposed:inspected.swingExposed,lastError:device.integration.command?.code||null});
   }catch(error){report.push({name:device.name,error:error instanceof Error?error.message:"Metadata read failed"});}
 }
 console.log(JSON.stringify({readOnly:true,physicalCommandsSent:0,remoteCount:remotes.length,report},null,2));
 if(report.some(r=>"error" in r||r.planFailures?.length))process.exitCode=1;
}
main().catch(error=>{console.error("IR metadata audit failed:",error.message);process.exitCode=1});
