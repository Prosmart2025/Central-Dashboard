"use client";

export interface SyncSummary {
  total: number; processed:number; added:number; updated:number; importedScenes:number; importedRooms:number; homes:number;
  warnings:Array<{device:string;reason:string}>;
  message:string;
}
/** Calls one bounded metadata batch at a time; aborting never sends device actions. */
export async function syncSmartLifeAccount(onProgress?: (message:string)=>void, signal?:AbortSignal):Promise<SyncSummary> {
  let offset = 0;
  const summary:SyncSummary = {total:0,processed:0,added:0,updated:0,importedScenes:0,importedRooms:0,homes:0,warnings:[],message:""};
  for (let page=0;page<1000;page++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const response = await fetch("/api/smartlife", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"sync",offset,restoreRooms:true}),signal,cache:"no-store"});
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Tuya account import failed.");
    const data = result.data;
    summary.total = data.total; summary.processed=data.processed ?? data.total; summary.added+=data.added || 0; summary.updated+=data.updated || 0;
    summary.importedScenes+=data.importedScenes || 0;summary.importedRooms+=data.importedRooms || 0;summary.homes=data.homes || 0;summary.warnings.push(...(data.warnings || []));
    onProgress?.(`Importing Tuya rooms and controls: ${summary.processed}/${summary.total} devices…`);
    if (data.done !== false) {
      summary.message = `Imported ${summary.total} Tuya devices, ${summary.importedRooms} rooms and ${summary.importedScenes} Tap-to-Run scenes${summary.warnings.length ? ` · ${summary.warnings.length} items need attention` : ""}.`;
      return summary;
    }
    if (!Number.isInteger(data.nextOffset) || data.nextOffset <= offset) throw new Error("Tuya import stopped advancing. Your existing devices have been kept.");
    offset=data.nextOffset;
  }
  throw new Error("Import reached its safety limit; existing data has been retained.");
}
