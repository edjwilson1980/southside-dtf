/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@imgly/background-removal', 'onnxruntime-web', 'sharp'],
  // The server-built gang sheet label font (lib/server/compose-sheet-node.ts).
  outputFileTracingIncludes: {
    '/api/project/ingest': ['./lib/server/fonts/**'],
  },
}

export default nextConfig
