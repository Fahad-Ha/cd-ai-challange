"use client";

import { useCallback, useEffect, useState } from "react";

interface GalleryPhoto {
  url: string;
  alt: string;
}

/**
 * Reference photos: one large image, thumbnails to switch, click to open a
 * full-screen viewer with previous/next, arrow keys and Escape.
 */
export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const count = photos.length;

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, go]);

  if (count === 0) return null;
  const current = photos[index];

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="piece group relative block w-full overflow-hidden bg-pencil-soft/40 text-left"
        aria-label={`Open photo ${index + 1} of ${count} full screen`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.alt} className="mx-auto max-h-96 w-auto max-w-full object-contain" />
        <span className="absolute bottom-2 right-2 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-medium text-white opacity-90 transition-opacity group-hover:opacity-100">
          {count > 1 ? `${index + 1} / ${count} · ` : ""}View full screen
        </span>
      </button>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="All reference photos">
          {photos.map((p, i) => (
            <li key={p.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={`block h-16 w-16 overflow-hidden rounded-field border-2 transition-colors ${i === index ? "border-pencil" : "border-line hover:border-muted"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${index + 1} of ${count}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/95 p-4"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.alt}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
            aria-label="Close"
          >
            Close
          </button>
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-xl text-white hover:bg-white/20"
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-xl text-white hover:bg-white/20"
                aria-label="Next photo"
              >
                ›
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                {index + 1} / {count}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
