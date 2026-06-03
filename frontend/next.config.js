/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'export',
  transpilePackages: ['jsxgraph', 'react-plotly.js', 'plotly.js-dist-min'],
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      path: false,
      canvas: false,
    };
    return config;
  },
};

module.exports = nextConfig;
