/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["tsx", "esbuild", "get-tsconfig", "@esbuild/linux-x64"],
};

export default nextConfig;

