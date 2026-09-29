# Tuya Wall Screen Dashboard

A touch-first Next.js dashboard for tablets, wall panels, and laptops. It works immediately in **demo mode** with seeded smart-home devices. To control your own devices, connect the dashboard to Tuya Cloud.

> **Hosting:** the Arena preview URL is a temporary sandbox address and cannot serve a wall tablet. For a persistent public HTTPS URL, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## 1. Add devices to your Tuya home

1. Install **Tuya Smart** or **Smart Life** on your phone.
2. Pair each bulb, plug, curtain, air conditioner, camera, lock, or sensor in that app first. Confirm it can be controlled there.
3. Create or log into a [Tuya IoT Platform](https://platform.tuya.com/) developer account.
4. Create a **Cloud** project suitable for your Tuya/Smart Life home and select the same data center/region as the mobile app account.
5. In the project, enable the required IoT Cloud APIs (device management/control APIs; wording differs slightly by project type).
6. Use **Link Tuya App Account** / **Link Devices** in the project to scan its QR code from your Tuya Smart or Smart Life mobile app. This gives the project permission to see the devices you paired in the app.
7. Copy the project **Access ID** and **Access Secret**.

> A Cloud project can only list devices that are paired in the linked Tuya/Smart Life account. If Sync finds no devices, first re-check the correct app account, Cloud project type, data center, and device-link step.

## 2. Securely connect the dashboard to Tuya Cloud

Add these values to the server `.env` file. Never enter your Access Secret into browser forms or share it with a tablet user.

```dotenv
TUYA_ACCESS_ID=your_tuya_project_access_id
TUYA_ACCESS_SECRET=your_tuya_project_access_secret
TUYA_ENDPOINT=https://openapi.tuyaus.com
```

Use the endpoint matching your project data center:

- Americas: `https://openapi.tuyaus.com`
- Western Europe: `https://openapi.tuyaeu.com`
- China: `https://openapi.tuyacn.com`
- India: `https://openapi.tuyain.com`

Restart the app after changing `.env`. In the dashboard, open **Settings → Tuya Cloud API → Ping Tuya Cloud Gateway**. Then press **Sync Tuya Cloud** on the main screen. Imported devices are given a Tuya Cloud badge and their supported controls are sent to Tuya through the secure server API.

The dashboard reads device functions before sending a command, so it avoids inventing commands unsupported by a particular product. Tuya manufacturers use different data point names, therefore a specialty device may require a small mapping addition in `src/lib/tuya-mapping.ts`.

## 3. Use it on a laptop

- Use the hosted dashboard URL, or run it on a server that the laptop can reach.
- For a local LAN setup, open `http://YOUR-SERVER-IP:3000` on the laptop. Do not use `localhost` from a different device.
- Use the fullscreen button in the dashboard header for a clean control-panel experience.
- On a dedicated Windows or macOS wall laptop, Chrome/Edge can be launched in kiosk/fullscreen mode after the dashboard URL is working.

## 4. Use it on a tablet or wall display

1. Put the tablet and dashboard server on the same trusted Wi-Fi network, or deploy the dashboard on an HTTPS hostname reachable from the internet/VPN.
2. Open the dashboard URL in the tablet browser.
3. **Android / Chrome:** Menu → **Install app** or **Add to Home screen**.
4. **iPad / Safari:** Share → **Add to Home Screen**. The dashboard runs in a standalone, app-like view.
5. Launch from the home-screen icon. Use the dashboard fullscreen icon for kiosk mode. The configurable screensaver automatically shows a large ambient clock after inactivity and wakes on touch.

For a permanent wall panel, keep the tablet charging, disable aggressive battery sleep for the browser/PWA, set the display to stay awake while charging, and use a PIN/MDM profile for kiosk lockdown if needed.

## Safety and privacy notes

- Tuya Access Secrets remain server-side and are never returned by the browser API.
- Secure the dashboard with your own network authentication before exposing it beyond your trusted home LAN.
- Camera feeds in this demo are a visual dashboard simulation. Connect an approved camera stream or NVR integration separately before using it as a real security monitor.
