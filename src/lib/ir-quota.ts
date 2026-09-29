/** Shared (client + server) rule for the persisted Tuya 60001001 quota pause.
 * The pause protects the quota from bursts, but must not lock a card forever:
 * once it expires, the NEXT deliberate user action may try again. It is never
 * an automatic retry, and a renewed 60001001 simply restarts the pause. */
export const IR_QUOTA_PAUSE_MS = 10 * 60 * 1000;
export function isIrQuotaPaused(command?: {code?: string; at?: string} | null, now = Date.now()): boolean {
  if (command?.code !== "IR_CONTROL_QUOTA") return false;
  const at = Date.parse(command.at || "");
  // A flag without a usable timestamp is treated as expired, not permanent.
  return Number.isFinite(at) && now - at < IR_QUOTA_PAUSE_MS;
}
