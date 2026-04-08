import { workflow } from "@codemation/host";
import { Callback, MapData, Wait } from "@codemation/core-nodes";

export default workflow("wf.multi-item-race")
  .name("Multi-item race demo")
  .manualTrigger("Manual trigger", [
    {
      name: "Blaze",
      speed: 84 + Math.floor(Math.random() * 12),
      lane: "red",
    },
    {
      name: "Comet",
      speed: 72 + Math.floor(Math.random() * 14),
      lane: "blue",
    },
    {
      name: "Drift",
      speed: 58 + Math.floor(Math.random() * 14),
      lane: "green",
    },
    {
      name: "Turtle",
      speed: 28 + Math.floor(Math.random() * 12),
      lane: "yellow",
    },
  ])
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
  .if("Take shortcut?", (item) => Boolean((item as { takesShortcut?: boolean })?.takesShortcut), {
    true: (b) =>
      b
        .then(
          new MapData("Enter shortcut lane", (item) => {
            const base =
              typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
            return {
              ...base,
              route: "shortcut",
              stage: "shortcut-lane",
              delayMs: 450,
            };
          }),
        )
        .then(new Wait("Shortcut delay", 800 + Math.floor(Math.random() * 400))),
    false: (b) =>
      b
        .then(
          new MapData("Enter scenic detour", (item) => {
            const base =
              typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
            return {
              ...base,
              route: "scenic",
              stage: "detour-lane",
              delayMs: 1800,
            };
          }),
        )
        .then(new Wait("Scenic delay", 1800)),
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
