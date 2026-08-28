import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Posters are proxied from TMDB, never stored - only poster_path persists.
    // unoptimized because Next/Image's Hobby transform quota would otherwise
    // be spent re-optimising JPEGs TMDB already sized correctly.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

// This project runs on Turbopack (Next 16 default), which the webpack-based
// `@serwist/next` package doesn't support - `@serwist/turbopack` compiles
// the service worker via the route handler at src/app/serwist/[path]/route.ts
// instead of a webpack plugin.
export default withSerwist(nextConfig);
