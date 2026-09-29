# Tuya Smart Wall Panel — production

**Current persistent URL:** https://tuya-smart-wall-panel.vercel.app

The old `tuya-wall-dashboard.vercel.app` is a different deployment. E2B preview URLs are temporary and are not the tablet URL.

## Account mirror (release `tuya-account-v3`)

Use **Sync Tuya account** after connecting Smart Life by QR.

- Imports the devices returned by the authorised Smart Life account, retaining Tuya device IDs.
- Imports the actual home/room lists and per-device room assignments. Room order follows the order returned by Tuya, not the demo list.
- A virtual IR remote with no separate room is displayed under its explicitly linked IR hub's room; this is labelled in its control panel.
- Imports writable functions, type/range/scale metadata, per-gang switches, and each shutter motor independently.
- Imports existing Tuya Tap-to-Run scenes. Automations and proprietary app features not exposed by these APIs are not recreated or guessed.
- Reads paired IR remotes and key ranges through the documented Tuya IR API, using server-side developer credentials. That service can impose its own permissions or quotas.
- Hides the 17 original demo devices and six original demo scenes once a real account is connected. Data is retained, not deleted.
- Sync is read-only on the physical home. It runs in six-device batches and reports per-item metadata errors.
- Manual panel arrangements are retained. Explicit account sync restores Tuya room assignments; changes in the panel do not edit the Tuya phone app.

## Command results

The server validates a command against the actual device specification before dispatch.

- **Failed/not sent:** reported state is unchanged. No successful-toggle animation is manufactured.
- **Accepted:** the provider accepted the request; this is not proof that hardware responded.
- **Confirmed:** a follow-up status read matches the requested value.
- Shutter instructions are transient. The panel shows the motor's reported position rather than instantly jumping to the requested endpoint.
- Shutter percentage control respects Tuya's direction mapping and is disabled when the device reports incomplete calibration. Open/Close/Stop are sent as explicit motor instructions.
- IR has no feedback from the appliance. A successful IR request means Tuya accepted it, not that the appliance received the signal. Keep the paired hub online and within line of sight.
- Group actions report individual failures and do not rewrite all local states when only some requests succeed.

## Tablet access

Open the current URL in Chrome or Samsung Internet. Refresh the page after a deployment; reopen the home-screen shortcut if it still shows an older build. Rooms, Arrange, Quick Groups and device control panels remain available.

## Secrets

`DATABASE_URL`, `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_ENDPOINT` and `SMARTLIFE_SESSION_KEY` are server-side Vercel production environment variables. Never use the `NEXT_PUBLIC_` prefix for credentials. Smart Life consumer sessions are encrypted in the dedicated Neon database.

No credentials should be pasted into chat, source files, diagnostics or screenshots. Environment files and browser test artifacts are excluded from deployment uploads.

## Verification

- Unit command-planning tests cover gang isolation, unsupported requests, numeric scales, motor direction and calibration.
- Browser tests intercept all physical command requests and use synthetic fixtures.
- The local rejection regression verifies a provider failure leaves persisted state unchanged and appears as a group failure.
- Real-device imports are tested with read-only metadata requests. Physical actuation must be checked by the owner; no physical commands are used during automated diagnosis.

Before exposing physical controls beyond a trusted household, configure access control for the dashboard. A connected, publicly accessible panel should not be treated as an authentication boundary.
