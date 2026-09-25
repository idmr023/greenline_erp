import { useEffect } from 'react';
import { X, Eye } from '../../../lib/icons';
import { versionarImagen } from '../../../lib/images';
import BlogContent from '../../blog/BlogContent';

const CONTENT_CLASS = `
  prose prose-neutral max-w-none
  [&_h2]:mb-4 [&_h2]:mt-14 [&_h2]:scroll-mt-24 [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:tracking-tight [&_h2]:text-neutral-950
  [&_h3]:mb-3 [&_h3]:mt-10 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-neutral-900
  [&_p]:mb-6 [&_p]:text-[17px] [&_p]:leading-[1.9] [&_p]:text-neutral-700
  [&_img]:my-10 [&_img]:w-full [&_img]:rounded-2xl [&_img]:shadow-sm
  [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-6
  [&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6
  [&_li]:mb-2 [&_li]:leading-7 [&_li]:text-neutral-700
  [&_a]:text-brand-dark [&_a]:underline [&_a]:decoration-2 [&_a]:underline-offset-4
  [&_blockquote]:my-10 [&_blockquote]:border-l-4 [&_blockquote]:border-brand [&_blockquote]:bg-neutral-50 [&_blockquote]:px-6 [&_blockquote]:py-5 [&_blockquote]:text-lg [&_blockquote]:leading-8 [&_blockquote]:text-neutral-600
  [&_strong]:font-semibold [&_strong]:text-neutral-900
  [&_hr]:my-12 [&_hr]:border-neutral-200
`;

export default function VistaPreviaModal({ open, onClose, dato }) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const hasContent = !!(dato?.content_html && dato.content_html.trim());

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-neutral-950/80 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Eye className="h-4 w-4 text-brand" />
            Vista previa — así se verá publicado
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100"
            aria-label="Cerrar vista previa"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-8">
            {dato?.image_url && (
              <img
                src={versionarImagen(dato.image_url)}
                alt={dato.image_alt || ''}
                className="mb-8 aspect-[16/8] w-full rounded-2xl object-cover"
              />
            )}

            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-brand-dark">
                {dato?.category || 'Categoría'}
              </span>
            </div>

            <h1 className="mb-4 text-4xl font-bold leading-[1.05] tracking-[-0.035em] text-neutral-950 sm:text-5xl">
              {dato?.title || 'Sin título'}
            </h1>

            {dato?.excerpt && (
              <p className="mb-8 max-w-3xl border-l-4 border-brand pl-5 text-lg leading-8 text-neutral-500">
                {dato.excerpt}
              </p>
            )}

            {hasContent ? (
              <BlogContent html={dato.content_html} className={CONTENT_CLASS} />
            ) : (
              <div className="my-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-10 text-center text-sm text-neutral-500">
                Este artículo aún no tiene contenido.
              </div>
            )}

            <div className="mt-10 border-t border-neutral-100 pt-6 text-center text-xs text-neutral-400">
              Vista previa aproximada de la página de Novedades
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}