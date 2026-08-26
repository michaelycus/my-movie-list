import type { NextConfig } from "next";

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

export default nextConfig;
