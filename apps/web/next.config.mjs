/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo: transpile workspace packages (they ship as TS source).
  transpilePackages: ['@trt/db', '@trt/ai', '@trt/engine', '@trt/kb'],
  // Native addon must NOT be bundled — load the .node binary from real
  // node_modules at runtime. (@trt/kb itself is transpiled above.)
  serverExternalPackages: ['better-sqlite3'],
  // Allow up to 32KB inline uploads metadata. Files themselves go to disk/storage.
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default nextConfig;
