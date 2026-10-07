/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.ORDER_EDIT_TEST_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
