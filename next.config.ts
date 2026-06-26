import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development", // Disable caching in dev mode
});

const nextConfig: NextConfig = {
  turbopack: {}
};

export default withSerwist(nextConfig);
