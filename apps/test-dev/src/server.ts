import "reflect-metadata";
import { CodemationFastifyHost } from "@codemation/frontend/server";

await new CodemationFastifyHost({
  entryModuleUrl: import.meta.url,
}).start();
