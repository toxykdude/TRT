/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo: transpile workspace packages (they ship as TS source).
  transpilePackages: ['@trt/db', '@trt/ai', '@trt/engine', '@trt/kb'],
  // Native-addon / runtime packages must NOT be bundled — load from real
  // node_modules so the .node binary and process.env resolve correctly.
  serverExternalPackages: ['better-sqlite3', '@trt/kb'],
  // Allow up to 32KB inline uploads metadata. Files themselves go to disk/storage.
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default nextConfig;
