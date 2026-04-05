import { spawnSync } from "node:child_process";

class PrismaClientGenerator {
  static providers = ["postgresql", "sqlite"];

  static run() {
    for (const provider of this.providers) {
      const result = spawnSync("pnpm", ["exec", "prisma", "generate"], {
        cwd: import.meta.dirname.replace(/\/scripts$/, ""),
        env: {
          ...process.env,
          CODEMATION_PRISMA_PROVIDER: provider,
        },
        stdio: "inherit",
        shell: false,
      });
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
    }
  }
}

PrismaClientGenerator.run();
