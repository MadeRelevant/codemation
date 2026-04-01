export type DocsScreenshotSlide = Readonly<{
  src: string;
  alt: string;
  caption: string;
}>;

export const DOCS_SCREENSHOT_SLIDES: ReadonlyArray<DocsScreenshotSlide> = [
  {
    src: "/screenshots/mail-ocr-agent-flow.png",
    alt: "Workflow canvas showing an OCR mail triage agent flow",
    caption: "Code-first workflows with an operator canvas — agent and integration steps side by side.",
  },
  {
    src: "/screenshots/binaries-support.png",
    alt: "Run detail with binary attachments and previews",
    caption: "First-class binaries: fetch, preview, and pass attachments through the graph.",
  },
  {
    src: "/screenshots/credentials-overview.png",
    alt: "Credentials overview in the operator UI",
    caption: "Centralized credentials for APIs, OAuth, and AI providers.",
  },
  {
    src: "/screenshots/users-overview.png",
    alt: "Users and invites management",
    caption: "Team access with invites and account status from the host UI.",
  },
  {
    src: "/screenshots/pin-node-json.png",
    alt: "Debugger pinning JSON output on a node",
    caption: "Pin JSON from any node to inspect runs without leaving the workflow.",
  },
  {
    src: "/screenshots/pin-node-binary.png",
    alt: "Debugger pinning binary output on a node",
    caption: "Pin binaries for quick comparison across runs.",
  },
  {
    src: "/screenshots/add-ai-foundry-credential.png",
    alt: "Adding an Azure AI Foundry credential",
    caption: "Wire up AI endpoints with typed credential forms.",
  },
  {
    src: "/screenshots/edit-gmail-oauth-credential.png",
    alt: "Editing a Gmail OAuth credential",
    caption: "OAuth flows for mail and integrations, managed in one place.",
  },
];
