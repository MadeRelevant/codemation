import { AppConfigLoader } from "../src/presentation/server/AppConfigLoader.ts";

const loader = new AppConfigLoader();
const result = await loader.load({
  consumerRoot: "/home/cblokland/projects/made/codemation/apps/test-dev",
  repoRoot: "/home/cblokland/projects/made/codemation",
  env: process.env,
});
console.log("collections.length:", result.appConfig.collections.length);
console.log(
  "collection names:",
  result.appConfig.collections.map((c) => c.name),
);
const first = result.appConfig.collections[0];
console.log(
  "first collection:",
  first ? { name: first.name, fields: Object.keys(first.fields ?? {}), indexes: first.indexes } : "no collections",
);
