/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Large file uploads: raise asset size limits (only affects build-time assets)
    config.performance = config.performance || {};
    config.performance.maxAssetSize = 512000;
    config.performance.maxEntrypointSize = 512000;
    return config;
  }
};
export default nextConfig;
