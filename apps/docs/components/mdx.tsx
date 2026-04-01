import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { DocsCodemationInTenLines } from "./docs-codemation-in-ten-lines";
import { DocsScreenshotCarousel } from "./docs-screenshot-carousel";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    DocsCodemationInTenLines,
    DocsScreenshotCarousel,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
