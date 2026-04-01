import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function getBaseLayoutOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Codemation Docs",
    },
    links: [
      {
        text: "Repository",
        url: "https://github.com/maderelevant/codemation",
      },
    ],
  };
}
