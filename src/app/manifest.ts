import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CineMood",
    short_name: "CineMood",
    description: "Pick a film a whole group will actually enjoy, in under a minute.",
    start_url: "/",
    display: "standalone",
    background_color: "#08070f",
    theme_color: "#08070f",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      // Same full-bleed art works as-is for Android's maskable safe zone,
      // so the 512 asset is listed twice rather than shipping a third PNG.
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
