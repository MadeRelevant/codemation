import assert from "node:assert/strict";
import { test } from "vitest";

import { CallbackNodeConfig, IfNodeConfig, createEngineTestKit, dag, items } from "../harness/index.ts";

test("engine continues past an auto-merge after an If (only taken branch executes)", async () => {
  const executed: string[] = [];

  const If = new IfNodeConfig("Gate", (item) => Boolean((item.json as any).takeTrue), {
    id: "if",
    omitUnusedOutputKey: true,
  });
  const B = new CallbackNodeConfig("B", () => executed.push("B"), { id: "B" });
  const C = new CallbackNodeConfig("C", () => executed.push("C"), { id: "C" });
  const D = new CallbackNodeConfig("D", () => executed.push("D"), { id: "D" });
  const E = new CallbackNodeConfig("E", () => executed.push("E"), { id: "E" });
  const F = new CallbackNodeConfig("F", () => executed.push("F"), { id: "F" });
  const X = new CallbackNodeConfig("X", () => executed.push("X"), { id: "X" });

  const builder = dag({ id: "wf.engine.branch-merge-continuation", name: "branch merge continuation" });
  builder.add(If);
  builder.add(B);
  builder.add(C);
  builder.add(D);
  builder.add(E);
  builder.add(F);
  builder.add(X);

  builder.connect("if", "B", "true", "in");
  builder.connect("B", "C", "main", "in");
  builder.connect("if", "D", "false", "in");
  builder.connect("D", "E", "main", "in");
  builder.connect("E", "F", "main", "in");

  // Branch reconverge without an explicit Merge node.
  builder.connect("C", "X", "main", "in");
  builder.connect("F", "X", "main", "in");

  const wf = builder.build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const result = await kit.runToCompletion({
    wf,
    startAt: "if",
    items: items([{ takeTrue: true }]),
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(executed, ["B", "C", "X"]);
});
