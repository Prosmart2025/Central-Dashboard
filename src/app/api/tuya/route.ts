import { NextRequest, NextResponse } from "next/server";
import { isTuyaConfigured, testTuyaConnection, TuyaApiError, TuyaConfigurationError } from "@/lib/tuya";
import { syncTuyaDevices } from "@/lib/tuya-mapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to contact Tuya Cloud.";
  const status = error instanceof TuyaConfigurationError ? 400 : error instanceof TuyaApiError ? 502 : 500;
  return NextResponse.json({ success: false, configured: isTuyaConfigured(), error: message }, { status });
}

export async function GET() {
  return NextResponse.json({
    success: true,
    configured: isTuyaConfigured(),
    message: isTuyaConfigured()
      ? "Tuya Cloud credentials are available on this server."
      : "Set TUYA_ACCESS_ID and TUYA_ACCESS_SECRET as server-side environment variables in your hosting provider, then redeploy, to connect real devices.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body.action === "test") {
      const connection = await testTuyaConnection();
      return NextResponse.json({
        success: true,
        configured: true,
        message: "Tuya Cloud API connected successfully.",
        data: connection,
      });
    }

    if (body.action === "sync" || body.action === "diagnose") {
      const summary = await syncTuyaDevices();

      if (summary.total === 0) {
        return NextResponse.json({
          success: false,
          configured: true,
          error:
            "Tuya Cloud authenticated, but returned 0 devices. This almost always means the Tuya app account is not linked to this Cloud project, or the project's data center does not match the region of your Tuya Smart / Smart Life account.",
          checklist: [
            "In iot.tuya.com open your Cloud project -> Devices -> Link App Account -> Add App Account, then scan the QR code from the Tuya Smart or Smart Life app (Me -> scan icon) and tap Confirm.",
            "Confirm the project Data Center matches your app account region (US / EU / China / India). A mismatch authenticates fine but returns no devices.",
            "Verify TUYA_ENDPOINT matches that same data center.",
            "In the project's Service API tab, ensure the IoT Core / device management APIs are subscribed and authorized.",
            "Check the devices appear under Devices -> All Devices in the Tuya IoT Platform. If they are missing there, they are not linked yet.",
          ],
          data: summary,
        });
      }

      return NextResponse.json({
        success: true,
        configured: true,
        message: `Tuya sync complete: ${summary.added} added, ${summary.updated} refreshed (via ${summary.strategy}).`,
        data: summary,
      });
    }

    return NextResponse.json({ success: false, error: "Unsupported Tuya action." }, { status: 400 });
  } catch (error) {
    console.error("Tuya API route error:", error);
    return apiError(error);
  }
}
