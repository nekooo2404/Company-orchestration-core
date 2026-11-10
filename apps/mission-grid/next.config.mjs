import process from 'node:process';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  assetPrefix: './',
  trailingSlash: true,
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'
};

export default nextConfig;
