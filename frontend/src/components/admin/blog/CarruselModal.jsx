import { useRef, useState } from 'react';
import { X, Upload, Plus, Trash2, Images } from '../../../lib/icons';

export default function CarruselModal({ open, onClose, onConfirm, onUpload }) {
  const [images, setImages] = useState([]);
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  if (!open) return null;

  const handleFiles = async (files) => {
    if (!files || !files.length) return;
    setUploading(true);
    const added = [];
    for (const file of Array.from(files)) {
      try {
        const src = await onUpload(file);
        if (src) added.push({ src, alt: '' });
      } catch (err) {
        alert('Error subiendo imagen: ' + err.message);
      }
    }
    if (added.length > 0) {
      setImages((prev) => [...prev, ...added]);
    }
    setUploading(false);
  };

  const addUrl = () => {
    const clean = url.trim();
    if (!clean) return;
    setImages((prev) => [...prev, { src: clean, alt: '' }]);
    setUrl('');
  };

  const setAlt = (idx, val) =>
    setImages((prev) => prev.map((im, i) => (i === idx ? { ...im, alt: val } : im)));

  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const confirm = () => {
    if (images.length === 0) {
      alert('Agrega al menos una imagen al carrusel');
      return;
    }
    onConfirm(images);
    setImages([]);
    setUrl('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Images className="h-4 w-4 text-brand" />
            Carrusel de imágenes
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-4 text-sm text-neutral-500">
            Sube varias imágenes o pega URLs. Aparecerán como un carrusel deslizable dentro del
            artículo. Puedes reordenarlas luego con el orden de la lista.
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
              <Upload className="h-4 w-4" />
              {uploading ? 'Subiendo...' : 'Subir imágenes'}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={fileRef}
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                className="input text-xs"
                placeholder="https://... (URL de una imagen)"
              />
              <button
                type="button"
                onClick={addUrl}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition hover:bg-brand-dark"
                title="Agregar URL"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-400">
              Aún no hay imágenes en este carrusel.
            </div>
          ) : (
            <div className="space-y-2">
              {images.map((img, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2">
                  <img
                    src={img.src}
                    alt={img.alt || ''}
                    className="h-14 w-20 shrink-0 rounded-lg object-cover border border-gray-100"
                  />
                  <input
                    value={img.alt}
                    onChange={(e) => setAlt(idx, e.target.value)}
                    className="input min-w-0 flex-1 text-xs"
                    placeholder={`Texto alternativo (imagen ${idx + 1})`}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-4">
          <span className="text-xs text-neutral-400">{images.length} imagen(es)</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Insertar carrusel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}