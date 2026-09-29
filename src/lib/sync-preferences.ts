import "server-only";
import {devices} from "@/db/schema";
import {sql} from "drizzle-orm";
import type {DeviceIntegration} from "@/types/integration";

/** Preserve local preferences at the SQL UPDATE boundary (even during a sync race). */
export function syncedIntegration(incoming:DeviceIntegration){
 return sql<DeviceIntegration>`coalesce(${devices.integration}, '{}'::jsonb) || ${JSON.stringify(incoming)}::jsonb || coalesce((
   select jsonb_object_agg(key, value) from jsonb_each(coalesce(${devices.integration}, '{}'::jsonb))
   where key in ('hidden', 'hiddenAt', 'cardSize', 'channelNames', 'irControlMode', 'sceneBindings', 'layoutOverride')
 ), '{}'::jsonb)`;
}
