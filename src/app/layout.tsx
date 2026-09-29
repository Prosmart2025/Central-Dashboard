import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prosmart | Smart Living, Simplified",
  description:
    "Provider-neutral smart home wall dashboard for lighting, climate, shutters, security, Shelly, Sonoff, Tuya and Home Assistant integrations.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prosmart",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#06090f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#06090f] text-slate-100 antialiased selection:bg-cyan-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
