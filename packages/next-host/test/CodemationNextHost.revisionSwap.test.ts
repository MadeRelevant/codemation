import assert from "node:assert/strict";
import test from "node:test";
import type { CodemationNextHostContext } from "../src/server/CodemationNextHost";
import { CodemationNextHost } from "../src/server/CodemationNextHost";

type TestBuildManifest = Readonly<{
  buildVersion: string;
  consumerRoot: string;
  entryPath: string;
  pluginEntryPath: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

class CodemationNextHostRevisionSwapFixture {
  static createManifest(buildVersion: string): TestBuildManifest {
    return {
      buildVersion,
      consumerRoot: "/tmp/codemation-consumer",
      entryPath: `/tmp/codemation-consumer/revisions/${buildVersion}/index.js`,
      pluginEntryPath: `/tmp/codemation-consumer/revisions/${buildVersion}/plugins.js`,
      workflowSourcePaths: [],
    };
  }

  static createContext(buildVersion: string, stopCalls: string[]): CodemationNextHostContext {
    return {
      application: {
        stopFrontendServerContainer: async () => {
          stopCalls.push(buildVersion);
        },
        getContainer: () => ({ resolve: () => undefined }) as never,
        getWorkflows: () => [],
      } as never,
      buildVersion,
      consumerRoot: "/tmp/codemation-consumer",
      repoRoot: "/tmp/codemation-repo",
      workflowSources: [],
    };
  }
}

test("prepare swaps to the latest build revision and retires the previous runtime", async () => {
  const host = new CodemationNextHost() as any;
  const manifests = [
    CodemationNextHostRevisionSwapFixture.createManifest("100"),
    CodemationNextHostRevisionSwapFixture.createManifest("200"),
  ];
  let manifestIndex = 0;
  const createCalls: string[] = [];
  const stopCalls: string[] = [];
  const emittedTransitions: Array<readonly [string, string]> = [];

  host.resolveBuildManifest = async () => manifests[manifestIndex];
  host.createContext = async (manifest: TestBuildManifest) => {
    createCalls.push(manifest.buildVersion);
    return CodemationNextHostRevisionSwapFixture.createContext(manifest.buildVersion, stopCalls);
  };
  host.emitWorkflowChangedEvents = async (args: Readonly<{ previousContext: CodemationNextHostContext; nextContext: CodemationNextHostContext }>) => {
    emittedTransitions.push([args.previousContext.buildVersion, args.nextContext.buildVersion]);
  };

  const initialContext = await host.prepare();
  manifestIndex = 1;
  const refreshedContext = await host.prepare();

  assert.equal(initialContext.buildVersion, "100");
  assert.equal(refreshedContext.buildVersion, "200");
  assert.deepEqual(createCalls, ["100", "200"]);
  assert.deepEqual(stopCalls, ["100"]);
  assert.deepEqual(emittedTransitions, [["100", "200"]]);
});

test("prepare serializes concurrent swaps so the same revision is only created once", async () => {
  const host = new CodemationNextHost() as any;
  const manifests = [
    CodemationNextHostRevisionSwapFixture.createManifest("100"),
    CodemationNextHostRevisionSwapFixture.createManifest("200"),
  ];
  let manifestIndex = 0;
  const createCalls: string[] = [];
  const stopCalls: string[] = [];
  let releaseBuild: (() => void) | null = null;
  const buildGate = new Promise<void>((resolve) => {
    releaseBuild = resolve;
  });

  host.resolveBuildManifest = async () => manifests[manifestIndex];
  host.createContext = async (manifest: TestBuildManifest) => {
    createCalls.push(manifest.buildVersion);
    if (manifest.buildVersion === "200") {
      await buildGate;
    }
    return CodemationNextHostRevisionSwapFixture.createContext(manifest.buildVersion, stopCalls);
  };
  host.emitWorkflowChangedEvents = async () => {};

  await host.prepare();
  manifestIndex = 1;

  const pendingContextA = host.prepare();
  const pendingContextB = host.prepare();
  releaseBuild?.();
  const [contextA, contextB] = await Promise.all([pendingContextA, pendingContextB]);

  assert.equal(contextA.buildVersion, "200");
  assert.equal(contextB.buildVersion, "200");
  assert.deepEqual(createCalls, ["100", "200"]);
  assert.deepEqual(stopCalls, ["100"]);
});

test("notifyBuildStarted publishes a rebuild signal to active workflow rooms", async () => {
  const host = new CodemationNextHost() as any;
  const publishedMessages: Array<Readonly<{ roomId: string; message: { kind: string; workflowId: string; buildVersion?: string } }>> = [];

  host.sharedWorkflowWebsocketServer = {
    publishToRoom: async (roomId: string, message: { kind: string; workflowId: string; buildVersion?: string }) => {
      publishedMessages.push({ roomId, message });
    },
  };
  host.activeRuntime = {
    buildVersion: "100",
    contextPromise: Promise.resolve({
      ...CodemationNextHostRevisionSwapFixture.createContext("100", []),
      application: {
        stopFrontendServerContainer: async () => {},
        getContainer: () => ({ resolve: () => undefined }) as never,
        getWorkflows: () => [{ id: "wf.alpha" }, { id: "wf.beta" }],
      } as never,
    }),
  };

  await host.notifyBuildStarted({ buildVersion: "200" });

  assert.deepEqual(publishedMessages, [
    {
      roomId: "wf.alpha",
      message: { kind: "devBuildStarted", workflowId: "wf.alpha", buildVersion: "200" },
    },
    {
      roomId: "wf.beta",
      message: { kind: "devBuildStarted", workflowId: "wf.beta", buildVersion: "200" },
    },
  ]);
});
