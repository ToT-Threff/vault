import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export for Firebase Hosting
  output: 'export',
  trailingSlash: true,
  // Disable image optimization for static export compatibility
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
