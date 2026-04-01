"use client";

import Image from "next/image";
import { useCallback, useId, useState } from "react";

type CarouselSlide = Readonly<{
  src: string;
  alt: string;
  caption: string;
}>;

const SLIDES: ReadonlyArray<CarouselSlide> = [
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

export function DocsScreenshotCarousel() {
  const carouselId = useId();
  const labelId = `${carouselId}-label`;
  const [index, setIndex] = useState(0);
  const n = SLIDES.length;
  const slide = SLIDES[index]!;

  const go = useCallback(
    (next: number) => {
      setIndex(((next % n) + n) % n);
    },
    [n],
  );

  const prev = useCallback(() => {
    go(index - 1);
  }, [go, index]);

  const next = useCallback(() => {
    go(index + 1);
  }, [go, index]);

  return (
    <figure
      id={carouselId}
      className="not-prose my-8 w-full outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-neutral-600"
      role="region"
      aria-roledescription="carousel"
      aria-labelledby={labelId}
      aria-label="Codemation product screenshots"
      data-testid="docs-screenshot-carousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          prev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          next();
        }
      }}
    >
      <figcaption id={labelId} className="sr-only">
        Carousel of Codemation screenshots. Use previous and next buttons, or dot buttons, to change slides.
      </figcaption>

      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/90">
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          fill
          className="object-contain object-center"
          sizes="(max-width: 768px) 100vw, min(896px, 100vw)"
          priority={index === 0}
        />
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-background text-foreground shadow-sm transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            onClick={prev}
            aria-label="Previous screenshot"
            data-testid="docs-screenshot-carousel-prev"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-background text-foreground shadow-sm transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            onClick={next}
            aria-label="Next screenshot"
            data-testid="docs-screenshot-carousel-next"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            {index + 1} / {n}
          </span>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end"
          role="group"
          aria-label="Screenshot slides"
        >
          {SLIDES.map((s, i) => (
            <button
              key={s.src}
              type="button"
              aria-label={`Slide ${i + 1}: ${s.alt}`}
              aria-current={i === index ? "true" : undefined}
              data-testid={`docs-screenshot-carousel-dot-${i}`}
              className={`h-2 rounded-full transition ${
                i === index
                  ? "w-6 bg-foreground"
                  : "w-2 bg-neutral-300 hover:bg-neutral-400 dark:bg-neutral-600 dark:hover:bg-neutral-500"
              }`}
              onClick={() => go(i)}
            />
          ))}
        </div>
      </div>

      <p className="text-muted-foreground mt-3 text-center text-sm leading-relaxed" aria-live="polite">
        {slide.caption}
      </p>
    </figure>
  );
}
