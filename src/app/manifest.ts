import type { MetadataRoute } from "next";

// Lets people add the app to their phone's home screen (platform strategy).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iris Music Project",
    short_name: "Iris",
    description: "The staff and musician app for Iris Music Project.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#411F50",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
