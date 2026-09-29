# Functional maintenance — tuya-functional-v5

Persistent dashboard: https://tuya-smart-wall-panel.vercel.app

This release is not a redesign. Existing navigation, colour theme, room tabs, group controls, integrations, credentials, and default card geometry are retained. UI changes are limited to immediate AC interactions and the requested card-management controls.

## IR findings and changes

- The account registry confirms Dining AC is paired with Dining Remote. Its Carrier remote index matches Reception AC's profile. They are different physical hub IDs; sharing a brand/model does not make those IDs interchangeable. No name-based or device-specific routing is used.
- Dining AC's recorded refusal was `60001001` (Tuya's control-pool quota). A profile match alone cannot clear a cloud entitlement failure or verify appliance reception.
- Tuya's standard remote-command executable example uses `categoryId` / `remoteIndex` plus the exact case-sensitive key. The planner now uses that standard-key format. Raw keys retain `category_id`, `key_id`, and the exact returned key. Sound Bar raw-key routing is unchanged.
- Each remote is checked against the actual hub's paired-remote registry. A stale or changed key/profile is refreshed; conflicting profile/category metadata is rejected before sending.
- AC settings use ordered documented single-field commands, instead of assuming every profile supports a multi-key scene command. No profile-specific ID or brand workaround is introduced.
- Nullable temperature entries and empty fan lists are handled correctly. A fan-only mode does not become 0°C or lose its legitimate fan controls.
- Only actual supported controls are exposed. Tuya's IR AC API does not promise swing; no swing command is invented. Standard (non-IR) AC swing datapoints are used where actually published.
- Commands to the same physical IR hub are serialized across serverless instances with a PostgreSQL advisory lock. No arbitrary retry delay or repeated fallback emission is used.
- Receipt diagnostics record the exact endpoint, body, hub, remote and verified profile used. IR acceptance remains **unconfirmed**, not measured appliance state. Partial failures stop further commands and are explicitly reported.

## Immediate AC interactions

- The existing temperature dial and mode/fan/power controls send on change, without Save/Apply.
- The selected target updates immediately while reported state stays separate.
- The first request dispatches immediately; while it is in flight, newer pending targets replace obsolete ones. Power-off supersedes pending on/settings; changing mode discards stale pending temperature/fan requests from the previous mode.
- Edge-triggered remote keys remain discrete actions. A failed/uncertain request stops its queued burst; it is never automatically retransmitted.

## Card removal and sizing

Use the small **… Card options** menu on a card (or its control panel).

- **Remove card** hides the existing local record; it never deletes/unpairs/renames the Tuya device.
- Hidden preferences survive sync, including concurrent metadata refreshes. Hidden cards are excluded from dashboard groups and direct commands are blocked.
- Restore under **Settings → Security & Reset → Hidden cards**.
- **Card size → Standard / Wide / Large** changes only that card's persisted responsive grid span. Standard is the unchanged default. Wide/Large clamp to one column on narrow screens.
- Records absent from a fully returned Tuya catalog are marked unavailable, not silently treated as live devices.

## Verification and limitations

- Unit tests exercise IR profile consistency, exact TV and Sound Bar payloads, generic AC command order, null-temperature modes, instant dispatch/coalescing, power-off priority and visibility/size merge rules.
- Desktop and Android-tablet browser tests intercept physical requests and test AC, TV, Sound Bar, switches, hide/restore and resize controls.
- Disposable local database tests verify that hide/restore preserves Tuya IDs and state and that hidden/size preferences survive import writes. They verify no physical commands are needed for card management.
- `scripts/audit-live-infrared.ts` checks live Tuya registry/key/status data and generates command plans without sending signals.
- Real IR reception, appliance compatibility with a paired code library, line of sight and quota entitlement cannot be proven by a read-only audit or a successful HTTP response. These are stated separately from code test results. No claim of physically tested power cycling is made.

## IR AC responsiveness fixes (quota pause, ranges, status read)

- The persisted `IR_CONTROL_QUOTA` pause now expires after 10 minutes (`src/lib/ir-quota.ts`), shared by the server guard and the AC card. The next deliberate user action may try again; a renewed `60001001` restarts the pause. No automatic retry is added. The manual "Retry direct IR after quota change" button still clears it immediately.
- A remote whose Tuya profile returns no `key_range` at all no longer loses its temperature, mode and fan controls. The UI offers all modes/fans and 16-30C, and the planner accepts whole-number temperatures in that span. Profiles that DO return ranges stay strict.
- A failed `/ac/status` read no longer aborts an AC send: the last known state is used as the planning basis (AC commands are absolute per field). A `60001001` from that read still surfaces immediately.
- Not changed: the Tuya IoT Core controllable-device entitlement itself (must be raised in the Tuya developer console), and the index/category mismatch guard.
