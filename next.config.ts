import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Postgres driver + Prisma adapter as runtime externals so the
  // bundler doesn't try to transform `pg` (which breaks under Turbopack).
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "@prisma/client"],
};

export default nextConfig;
