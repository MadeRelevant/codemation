"use client";

import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { DOCS_SCREENSHOT_SLIDES } from "./docs-screenshot-carousel.slides";

export function DocsScreenshotCarousel() {
  const carouselId = useId();
  const labelId = `${carouselId}-label`;
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    duration: 22,
    dragFree: false,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const slides = DOCS_SCREENSHOT_SLIDES;
  const n = slides.length;
  const slide = slides[selectedIndex]!;

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("reInit", onSelect);
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("reInit", onSelect);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback(
    (i: number) => {
      emblaApi?.scrollTo(i);
    },
    [emblaApi],
  );

  const openLightbox = useCallback(() => {
    dialogRef.current?.showModal();
  }, []);

  const closeLightbox = useCallback(() => {
    dialogRef.current?.close();
  }, []);

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
          scrollPrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          scrollNext();
        }
      }}
    >
      <figcaption id={labelId} className="sr-only">
        Carousel of Codemation screenshots. Use previous and next buttons, thumbnails, or swipe to change slides. Open
        full size to view a screenshot in a zoom dialog.
      </figcaption>

      <div className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-gradient-to-b from-neutral-50 to-neutral-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/5 dark:border-neutral-800 dark:from-neutral-950 dark:to-neutral-900/80 dark:ring-white/10">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex touch-pan-x">
            {slides.map((s, i) => (
              <div
                key={s.src}
                className="min-w-0 shrink-0 grow-0 basis-full"
                data-testid={`docs-screenshot-carousel-slide-${i}`}
              >
                <div className="relative aspect-[16/10] w-full">
                  <Image
                    src={s.src}
                    alt={s.alt}
                    fill
                    className="object-contain object-center"
                    sizes="(max-width: 768px) 100vw, min(896px, 100vw)"
                    priority={i === 0}
                    draggable={false}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent dark:from-black/40" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3">
          <button
            type="button"
            className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-white/20 bg-white/90 px-3.5 text-sm font-medium text-neutral-900 shadow-md backdrop-blur-sm transition hover:bg-white dark:border-white/10 dark:bg-neutral-900/90 dark:text-neutral-100 dark:hover:bg-neutral-800"
            onClick={openLightbox}
            aria-label="View screenshot full size"
            data-testid="docs-screenshot-carousel-expand"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            Full size
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-background text-foreground shadow-sm transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            onClick={scrollPrev}
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
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-background text-foreground shadow-sm transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
            onClick={scrollNext}
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
          <span className="text-sm tabular-nums text-neutral-600 dark:text-neutral-400" aria-live="polite">
            {selectedIndex + 1} / {n}
          </span>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-2 sm:justify-end"
          role="group"
          aria-label="Screenshot slides"
        >
          {slides.map((s, i) => (
            <button
              key={s.src}
              type="button"
              aria-label={`Slide ${i + 1}: ${s.alt}`}
              aria-current={i === selectedIndex ? "true" : undefined}
              data-testid={`docs-screenshot-carousel-dot-${i}`}
              onClick={() => scrollTo(i)}
              className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                i === selectedIndex
                  ? "border-neutral-900 ring-2 ring-neutral-900/20 dark:border-white dark:ring-white/20"
                  : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              <Image src={s.src} alt="" fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-center text-sm leading-relaxed text-neutral-600 dark:text-neutral-400" aria-live="polite">
        {slide.caption}
      </p>

      <dialog
        ref={dialogRef}
        className="fixed inset-0 z-[100] m-0 max-h-none max-w-none h-full w-full border-0 bg-transparent p-0 text-foreground open:flex open:items-center open:justify-center open:backdrop:bg-black/80"
        aria-label="Full size screenshot"
        data-testid="docs-screenshot-lightbox"
        onClick={(e) => {
          if (e.target === dialogRef.current) closeLightbox();
        }}
      >
        <div
          className="relative box-border w-full max-w-[100vw] px-3 pb-6 pt-14 sm:px-8 sm:pb-10 sm:pt-16"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-neutral-900/80 text-white shadow-lg backdrop-blur-sm transition hover:bg-neutral-800 sm:right-4 sm:top-4"
            onClick={closeLightbox}
            aria-label="Close full size view"
            data-testid="docs-screenshot-lightbox-close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="flex w-full justify-center" data-testid="docs-screenshot-lightbox-image">
            <img
              src={slide.src}
              alt={slide.alt}
              className="h-auto w-auto max-h-[min(92dvh,calc(100dvh-10rem))] max-w-[calc(100vw-1.5rem)] object-contain shadow-2xl ring-1 ring-white/10"
              decoding="async"
            />
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-neutral-200">{slide.caption}</p>
        </div>
      </dialog>
    </figure>
  );
}
