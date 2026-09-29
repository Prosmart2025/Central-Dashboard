# Full control without Tuya IoT Core's developer pool

The dashboard cannot bypass Tuya's server-side `60001001` entitlement. The supported no-$25k route is to send those AC/TV/remote actions through a controller on the home network.

The dashboard now supports an **optional Home Assistant / local bridge** while keeping the public Vercel interface:

1. Run Home Assistant on an always-on home device (Home Assistant Green, Raspberry Pi, NAS, mini PC, etc.).
2. Add your preferred local IR integration. Common options include a supported local Tuya IR integration with learned/native IR commands or another local emitter integration. Configure it so each AC appears as a `climate.*` entity and TV/Sound Bar remotes appear as `remote.*` entities.
3. Give Vercel an authenticated HTTPS path to Home Assistant. Nabu Casa's remote URL is the simplest supported option; alternatively use your own protected HTTPS tunnel. Do not expose an unauthenticated Home Assistant.
4. In Home Assistant: profile → **Long-Lived Access Tokens** → create a dedicated token with the minimum access appropriate for this dashboard.
5. In Vercel → `tuya-smart-wall-panel` → **Settings → Environment Variables**, add server-side production values:
   - `HOME_ASSISTANT_URL` = the HTTPS Home Assistant origin
   - `HOME_ASSISTANT_TOKEN` = the long-lived token
   Do not use the `NEXT_PUBLIC_` prefix.
6. Redeploy the existing Vercel project.
7. Open an affected dashboard card → **IR control method / quota alternative** → select **Home Assistant / local bridge** → select the exact compatible entity → Save.

For AC cards, the bridge sends documented Home Assistant climate services (`turn_on/off`, `set_hvac_mode`, `set_temperature`, `set_fan_mode`). TV/Sound Bar cards send the exact displayed command to `remote.send_command`. No fuzzy entity matching is used.

This is an alternative control provider, not a quota exploit. Local compatibility depends on the home integration and the IR codes/profile you configure there. The Vercel dashboard cannot directly open TCP/UDP connections to private LAN devices without a reachable bridge.

## Cloud alternatives

- Upgrade/reallocate Tuya IoT Core controllable-device capacity, then explicitly clear/retry the dashboard quota lock.
- Create exact Tap-to-Run scenes in the Smart Life/Tuya app, sync them, and map each desired action in **My assigned Tuya scenes** mode.

The dashboard never automatically guesses a scene or silently falls back after an uncertain IR send, because that could duplicate or misroute appliance commands.
