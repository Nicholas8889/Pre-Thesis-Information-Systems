/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".next-local",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
