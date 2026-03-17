import type { Item, NodeExecutionContext } from "@codemation/core";
import { Callback, createWorkflowBuilder, HttpRequest, ManualTrigger } from "@codemation/core-nodes";

type MediaSeedJson = Readonly<{
  label: string;
  url: string;
}>;

type MediaPreviewGeneratedJson = MediaSeedJson &
  Readonly<{
    http: Readonly<Record<string, unknown>>;
    generated?: Readonly<{
      noteBinaryName: string;
      hasGeneratedBinary: boolean;
    }>;
  }>;

class MediaPreviewGeneratedNoteFactory {
  static async attach(
    items: ReadonlyArray<Item<MediaPreviewGeneratedJson>>,
    ctx: NodeExecutionContext<Callback<MediaPreviewGeneratedJson, MediaPreviewGeneratedJson>>,
  ): Promise<ReadonlyArray<Item<MediaPreviewGeneratedJson>>> {
    return await Promise.all(
      items.map(async (item) => {
        const noteFilename = `${item.json.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "attachment"}-note.txt`;
        const noteAttachment = await ctx.binary.attach({
          name: "note",
          body: new TextEncoder().encode(`Generated note for ${item.json.label}. This item demonstrates a node returning JSON and binary together.`),
          mimeType: "text/plain",
          filename: noteFilename,
        });
        return ctx.binary.withAttachment(
          {
            ...item,
            json: {
              ...item.json,
              generated: {
                noteBinaryName: "note",
                hasGeneratedBinary: true,
              },
            },
          },
          "note",
          noteAttachment,
        );
      }),
    );
  }
}

export default createWorkflowBuilder({ id: "wf.media.preview", name: "Media preview demo" })
  .trigger(
    new ManualTrigger<MediaSeedJson>("Manual trigger", [
      {
        json: {
          label: "Image sample",
          url: "https://samplelib.com/lib/preview/png/sample-boat-400x300.png",
        },
      },
      {
        json: {
          label: "Audio sample",
          url: "https://samplelib.com/lib/preview/mp3/sample-3s.mp3",
        },
      },
      {
        json: {
          label: "Video sample",
          url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
        },
      },
      {
        json: {
          label: "PDF sample",
          url: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDw+PgplbmRvYmoKdHJhaWxlcgo8PD4+CiUlRU9G",
        },
      },
      {
        json: {
          label: "Text sample",
          url: "data:text/plain;charset=utf-8,Codemation%20binary%20attachment%20demo",
        },
      },
    ]),
  )
  .then(
    new HttpRequest<MediaSeedJson>(
      "Download media body",
      {
        downloadMode: "always",
        binaryName: "body",
      },
    ),
  )
  .then(
    new Callback<MediaPreviewGeneratedJson, MediaPreviewGeneratedJson>("Attach generated note", async (items, ctx) => {
      return await MediaPreviewGeneratedNoteFactory.attach(items, ctx);
    }),
  )
  .build();
