# Control update — tuya-controls-v4

Production URL: https://tuya-smart-wall-panel.vercel.app

## Gang names

- `GET /v1.0/devices/{device_id}/multiple-names` supplies Tuya's names keyed by exact DP codes. Device/main and settings labels are not mistaken for gangs.
- **Device → Rename gangs → Import names from Tuya** refreshes these names without sending commands.
- **Save gang names** stores dashboard-only overrides in the existing encrypted-server/database architecture. It does not change the phone app.
- Empty local names revert to imported names. Overrides survive sync, commands and status readbacks.
- **Sync Tuya account** also imports gang names.

## Responsiveness

Previously each normal switch request fetched device details and specifications, sent a command, then waited through two delayed state polls before replying.

The fast path now uses imported capability metadata for up to 24 hours and performs a single provider send before acknowledgement. Missing/stale capabilities and shutter percentage moves retain the necessary preflight checks. Reported state is read separately using a command receipt; stale reads cannot overwrite a newer command. No requested switch state is fabricated as observed state.

Group dispatch is bounded to two devices at a time. This reduces avoidable waiting without launching an uncontrolled fleet-wide burst. Provider/network latency still applies; no physical timing benchmark is claimed without owner testing. The device panel shows its last provider request duration.

## Remaining quota / infrared controls

The Smart Life consumer connection and the Tuya IR developer API are different paths. `60001001` on Direct IR is a Tuya entitlement/control-pool refusal, not proof that the emitter or appliance is broken. The provider does not supply a reset time.

**Device → IR control method / quota alternative** offers:

1. **Direct IR API**: the paired hub/remote ID, exact key format and supported AC ranges. Existing Tuya permissions and quota apply.
2. **My assigned Tuya scenes**: explicitly map an exact action (power, a remote key, temperature or a selected AC settings combination) to an existing, enabled Tap-to-Run scene in that home. Saving a mapping does not run it. Mapped actions use Smart Life's scene API rather than Direct IR. Unmapped actions send nothing. Scenes may affect other devices, so the owner chooses the scene; names are never fuzzy-matched and no automatic fallback is used after an uncertain transmission.

**Refresh IR definition** reads the paired key/range metadata. It never re-pairs a device or emits a signal. If an accepted IR command still has no effect, verify the same action in the Tuya app, the hub's line of sight, and its paired code library. No API response can confirm IR reception by an appliance.

## AC dial

The restored circular dial has touch, keyboard and +/- controls. It follows the remote/thermostat's actual supported values (including non-contiguous IR temperature ranges). Draft changes are not sent until **Set temperature only** or **Apply & turn on**. Current/reported or last-requested settings are labelled separately from the selected target. No room temperature is invented.

## Verification

Unit tests cover label precedence, exact scene routing, IR validation and command request counts. Browser tests use intercepted command responses. Database tests use disposable local fixtures. No household appliances are operated by automated tests or metadata imports.
