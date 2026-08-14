/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Frontend snakker alltid med "/api" på samme domene.
  // Next.js sender det videre til FastAPI. Da slipper vi CORS og
  // hardkodede URL-er i bygget.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
