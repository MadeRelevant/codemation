import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { getBaseLayoutOptions } from "@/lib/layout-options";
import { source } from "@/lib/source";

export default function Layout(args: Readonly<{ children: ReactNode }>) {
  return (
    <DocsLayout tree={source.getPageTree()} {...getBaseLayoutOptions()}>
      {args.children}
    </DocsLayout>
  );
}
