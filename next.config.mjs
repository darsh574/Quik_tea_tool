/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // jspdf / jszip / xlsx are heavy browser libs — keep them out of the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["xlsx"],
  },
};

export default nextConfig;
