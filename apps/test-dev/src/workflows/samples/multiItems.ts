import { Callback,createWorkflowBuilder,If,ManualTrigger,MapData,Wait } from "@codemation/core-nodes";

export default createWorkflowBuilder({ id: "wf.multi-item-race", name: "Multi-item race demo" })
  .trigger(
    new ManualTrigger("Manual trigger", [
      {
        json: {
          name: "Blaze",
          speed: 84 + Math.floor(Math.random() * 12),
          lane: "red",
        },
      },
      {
        json: {
          name: "Comet",
          speed: 72 + Math.floor(Math.random() * 14),
          lane: "blue",
        },
      },
      {
        json: {
          name: "Drift",
          speed: 58 + Math.floor(Math.random() * 14),
          lane: "green",
        },
      },
      {
        json: {
          name: "Turtle",
          speed: 28 + Math.floor(Math.random() * 12),
          lane: "yellow",
        },
      },
    ]),
  )
  .then(
    new MapData("Seed race state", (item) => {
      const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
      const speed = typeof base.speed === "number" ? base.speed : 0;
      return {
        ...base,
        stage: "starting-grid",
        takesShortcut: speed >= 70,
      };
    }),
  )
  .then(new If("Take shortcut?", (item) => Boolean((item.json as { takesShortcut?: boolean })?.takesShortcut)))
  .when({
    true: [
      new MapData("Enter shortcut lane", (item) => {
        const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
        return {
          ...base,
          route: "shortcut",
          stage: "shortcut-lane",
          delayMs: 450,
        };
      }),
      // wait between 800 - 1200ms minus the speed of the racer 
      new Wait("Shortcut delay", 800 + Math.floor(Math.random() * 400)),
    ],
    false: [
      new MapData("Enter scenic detour", (item) => {
        const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
        return {
          ...base,
          route: "scenic",
          stage: "detour-lane",
          delayMs: 1800,
        };
      }),
      new Wait("Scenic delay", 1800),
    ],
  })
  .then(
    new Callback("Photo finish", (items) =>
      items.map((item, index) => ({
        ...item,
        json: {
          ...(typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {}),
          place: index + 1,
          finished: true,
          stage: "finish-line",
        },
      })),
    ),
  )
  .build();
