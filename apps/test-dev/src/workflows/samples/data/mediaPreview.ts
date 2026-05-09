import type { Item, NodeExecutionContext } from "@codemation/core";
import { workflow } from "@codemation/host";
import { Callback, HttpRequest, type HttpRequestOutputJson } from "@codemation/core-nodes";

type MediaSeedJson = Readonly<{
  label: string;
  url: string;
}>;

type MediaPreviewGeneratedJson = HttpRequestOutputJson &
  Readonly<{
    generated?: Readonly<{
      noteBinaryName: string;
      hasGeneratedBinary: boolean;
    }>;
  }>;

class MediaPreviewGeneratedNoteFactory {
  /** Human-readable slug for notes; seed `label` is not on the item after HttpRequest (output replaces JSON). */
  private static labelFromHttpItem(json: HttpRequestOutputJson): string {
    const { url } = json;
    if (url.startsWith("data:")) {
      const mime = url.slice("data:".length).split(";")[0]?.toLowerCase() ?? "";
      if (mime.includes("pdf")) return "PDF sample";
      if (mime.includes("plain")) return "Text sample";
      return "Data URL sample";
    }
    try {
      const pathname = new URL(url).pathname;
      const last = pathname.split("/").filter(Boolean).pop();
      if (!last) return "Media sample";
      return (
        last
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]+/g, " ")
          .trim() || "Media sample"
      );
    } catch {
      return "Media sample";
    }
  }

  static async attach(
    items: ReadonlyArray<Item<HttpRequestOutputJson>>,
    ctx: NodeExecutionContext<Callback<HttpRequestOutputJson, MediaPreviewGeneratedJson>>,
  ): Promise<ReadonlyArray<Item<MediaPreviewGeneratedJson>>> {
    return await Promise.all(
      items.map(async (item) => {
        const label = MediaPreviewGeneratedNoteFactory.labelFromHttpItem(item.json);
        const noteFilename = `${
          label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "attachment"
        }-note.txt`;
        const noteAttachment = await ctx.binary.attach({
          name: "note",
          body: new TextEncoder().encode(
            `Generated note for ${label}. This item demonstrates a node returning JSON and binary together.`,
          ),
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

export default workflow("wf.media.preview")
  .name("Media preview demo")
  .manualTrigger<MediaSeedJson>("Manual trigger", [
    {
      label: "Image sample",
      url: "https://samplelib.com/lib/preview/png/sample-boat-400x300.png",
    },
    {
      label: "Audio sample",
      url: "https://samplelib.com/lib/preview/mp3/sample-3s.mp3",
    },
    {
      label: "Video sample",
      url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
    },
    {
      label: "PDF sample",
      url: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDw+PgplbmRvYmoKdHJhaWxlcgo8PD4+CiUlRU9G",
    },
    {
      label: "Text sample",
      url: "data:text/plain;charset=utf-8,Codemation%20binary%20attachment%20demo",
    },
  ])
  .then(
    new HttpRequest<MediaSeedJson>("Download media body", {
      downloadMode: "always",
      binaryName: "body",
    }),
  )
  .then(
    new Callback<HttpRequestOutputJson, MediaPreviewGeneratedJson>("Attach generated note", async (items, ctx) => {
      return await MediaPreviewGeneratedNoteFactory.attach(items, ctx);
    }),
  )
  .build();
