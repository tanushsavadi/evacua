import type { NextConfig } from "next";

const resolvedDemoMode =
  process.env.NEXT_PUBLIC_EVACUA_DEMO_MODE ??
  process.env.EVACUA_DEMO_MODE ??
  (!process.env.NEXT_PUBLIC_SUPABASE_URL ? "true" : undefined);

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_VAPI_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY,
    NEXT_PUBLIC_EVACUA_DEMO_MODE: resolvedDemoMode,
  },
};

export default nextConfig;
