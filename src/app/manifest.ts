import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roots – madplan og indkøbsliste",
    short_name: "Roots",
    lang: "da",
    start_url: "/liste",
    scope: "/",
    display: "standalone",
    background_color: "#f5f2ea",
    theme_color: "#2f5d3a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
