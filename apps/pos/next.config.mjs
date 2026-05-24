/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // TODO: Set back to false after fixing pre-existing lint errors (~187 errors)
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  transpilePackages: ["@raiz/shared"],
}
export default nextConfig
