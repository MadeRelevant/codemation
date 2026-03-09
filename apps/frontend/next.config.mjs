/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@codemation/core",
    "@codemation/core-nodes",
    "@codemation/node-example",
    "@codemation/queue-bullmq",
    "@codemation/run-store-sqlite",
    "@codemation/eventbus-redis",
    "@codemation/test-dev",
  ],
};

export default nextConfig;

