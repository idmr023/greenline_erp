import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from '../../lib/icons';

export default function BlogCarrusel({ images, altByDefault = 'Imagen del artículo' }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);

  const total = images?.length || 0;
  if (total === 0) return null;

  const go = (target) => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(total - 1, target));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setIndex(next);
  };

  return (
    <div className="my-10">
      <div className="group relative overflow-hidden rounded-2xl bg-neutral-100 shadow-sm">
        <div
          ref={trackRef}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
          style={{ scrollbarWidth: 'none' }}
          onScrollCapture={(e) => {
            const el = e.currentTarget;
            if (el.clientWidth === 0) return;
            const current = Math.round(el.scrollLeft / el.clientWidth);
            setIndex(Math.max(0, Math.min(total - 1, current)));
          }}
        >
          {images.map((img, i) => (
            <div key={i} className="w-full shrink-0 snap-center">
              <img
                src={img.src}
                alt={img.alt || altByDefault}
                className="h-72 w-full object-cover sm:h-96"
                style={{ margin: 0 }}
                loading="lazy"
              />
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Imagen anterior"
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 opacity-0 shadow-lg transition group-hover:opacity-100 hover:bg-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Imagen siguiente"
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 opacity-0 shadow-lg transition group-hover:opacity-100 hover:bg-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Ir a la imagen ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-6 bg-brand' : 'w-2 bg-neutral-300 hover:bg-neutral-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}