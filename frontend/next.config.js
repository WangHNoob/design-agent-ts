/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  basePath: "/design",
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
