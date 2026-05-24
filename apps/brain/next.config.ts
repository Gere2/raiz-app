import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Point to monorepo root so Turbopack resolves hoisted node_modules
    root: path.resolve(__dirname, "../.."),
  },
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
