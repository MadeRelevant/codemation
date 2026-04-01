import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { DocsGithubStarsBadge } from "@/components/docs-github-stars-badge";
import { getMDXComponents } from "@/components/mdx";
import { source } from "@/lib/source";

type PageParams = Readonly<{
  slug?: string[];
}>;

export default async function DocsContentPage(args: Readonly<{ params: Promise<PageParams> }>) {
  const params = await args.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const MdxContent = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <div className="flex w-full flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-full flex-1 space-y-2">
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
        </div>
        <DocsGithubStarsBadge />
      </div>
      <DocsBody>
        <MdxContent
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams(): Promise<Array<PageParams>> {
  return source.generateParams();
}

export async function generateMetadata(args: Readonly<{ params: Promise<PageParams> }>): Promise<Metadata> {
  const params = await args.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
