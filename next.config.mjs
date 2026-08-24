/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@imgly/background-removal', 'onnxruntime-web', 'sharp'],
}

export default nextConfig
