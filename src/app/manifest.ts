import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prosmart Smart Home Dashboard",
    short_name: "Prosmart",
    description: "Smart Living, Simplified — a provider-neutral tablet smart home dashboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#06090f",
    theme_color: "#06090f",
    orientation: "landscape",
    categories: ["utilities", "smart-home", "productivity"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
