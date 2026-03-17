import { Callback, createWorkflowBuilder, HttpRequest, ManualTrigger } from "@codemation/core-nodes";

type MediaSeedJson = Readonly<{
  label: string;
  url: string;
}>;

export default createWorkflowBuilder({ id: "wf.media.preview", name: "Media preview demo" })
  .trigger(new ManualTrigger("Manual trigger"))
  .then(
    new Callback<unknown, MediaSeedJson>("Seed media URLs", () => [
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
  .build();
