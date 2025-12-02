/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow importing source from ../shared.
    externalDir: true,
  },
};

export default nextConfig;
