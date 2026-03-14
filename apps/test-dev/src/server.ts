import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import codemationConfig from "../codemation.config";
import { CodemationFastifyServer } from "./server/CodemationFastifyServer";

const consumerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configSource = path.resolve(consumerRoot, "codemation.config.ts");

await new CodemationFastifyServer(codemationConfig, consumerRoot, configSource).start();
