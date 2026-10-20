import { useRef, useState } from 'react';
import { Camera, Upload, X, Image as ImageIcon, AlertTriangle, Loader2 } from '../../lib/icons';
import { versionarImagen } from '../../lib/images';

/**
 * ImageUploader — carga de imágenes reutilizable del panel.
 *
 * La API de subida se INYECTA (`upload`), así que el mismo componente sirve
 * para las fotos de un préstamo de vehículo, para el blog o para un producto
 * sin tocarlo: cada consumidor pasa su propia función de subida.
 *
 *   <ImageUploader
 *     value={fotos}                                  // [{url, parte}]
 *     onChange={(fotos) => setFotos(fotos)}
 *     upload={(file, parte) => api.subirFoto(file, parte)}
 *     partes={['Carrocería', 'Tablero']}
 *   />
 *
 * La subida real (compresión, bucket, límites) es del backend; aquí sólo se
 * valida lo obvio para no gastar un request con un archivo inválido.
 */

// Mismo límite que el backend (multer, limits.fileSize).
const MAX_BYTES = 8 * 1024 * 1024;

const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageUploader({
  value = [],
  onChange = () => {},
  upload,
  partes = [],
  disabled = false,
  maxFiles = 20,
  label = 'Fotos',
  hint = 'Arrastra las imágenes o haz clic para elegirlas.',
  accept = 'image/*',
  className = '',
}) {
  const inputRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [parte, setParte] = useState(partes[0] || '');
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState(null);

  const quedan = Math.max(0, maxFiles - value.length);

  function abrirSelector() {
    if (disabled || subiendo || quedan === 0) return;
    inputRef.current?.click();
  }

  function validar(archivo) {
    if (TIPOS_OK.length && !TIPOS_OK.includes(archivo.type)) {
      return `«${archivo.name}» no es una imagen válida (jpg, png, webp o gif).`;
    }
    if (archivo.size > MAX_BYTES) {
      return `«${archivo.name}» pesa ${formatearTamano(archivo.size)} y el máximo es ${formatearTamano(MAX_BYTES)}.`;
    }
    return null;
  }

  async function procesar(archivos) {
    const lista = Array.from(archivos || []);
    if (!lista.length) return;

    setError(null);

    if (quedan === 0) {
      setError(`Ya hay ${maxFiles} imagen(es). Quita alguna para subir más.`);
      return;
    }

    const selected = lista.slice(0, quedan);
    const rechazados = lista.slice(quedan).map((f) => f.name);

    const invalidos = [];
    const validos = [];
    for (const archivo of selected) {
      const motivo = validar(archivo);
      if (motivo) invalidos.push(motivo);
      else validos.push(archivo);
    }

    if (!validos.length) {
      setError(invalidos[0] || 'No se pudo subir ninguna imagen.');
      return;
    }

    setSubiendo(true);
    setProgreso(0);

    const nuevas = [];
    let fallo = null;

    for (let i = 0; i < validos.length; i += 1) {
      const archivo = validos[i];
      try {
        const resultado = await upload(archivo, parte);
        nuevas.push({
          url: resultado?.url || resultado,
          parte: resultado?.parte || parte || '',
        });
      } catch (err) {
        fallo = err?.error || err?.message || `No se pudo subir «${archivo.name}».`;
      }
      setProgreso(i + 1);
    }

    setSubiendo(false);
    setProgreso(0);

    if (nuevas.length) onChange([...value, ...nuevas]);

    const avisos = [];
    if (fallo) avisos.push(fallo);
    if (invalidos.length) avisos.push(invalidos[0]);
    if (rechazados.length) avisos.push(`Se omitieron ${rechazados.length} archivo(s) por el límite de ${maxFiles}.`);
    if (avisos.length) setError(avisos.join(' '));
  }

  function quitar(idx) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function cambiarParte(idx, nuevaParte) {
    onChange(value.map((f, i) => (i === idx ? { ...f, parte: nuevaParte } : f)));
  }

  function alSoltar(e) {
    e.preventDefault();
    setArrastrando(false);
    if (disabled) return;
    procesar(e.dataTransfer?.files);
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {partes.length > 0 && (
          <label className="flex items-center gap-1 text-xs text-gray-500">
            Parte
            <select
              value={parte}
              onChange={(e) => setParte(e.target.value)}
              disabled={disabled}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 bg-white disabled:opacity-50"
            >
              {partes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}

      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={alSoltar}
        onClick={abrirSelector}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSelector(); } }}
        role="button"
        tabIndex={0}
        aria-disabled={disabled || quedan === 0}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          arrastrando
            ? 'border-brand bg-brand/5'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {subiendo ? (
          <>
            <Loader2 className="w-8 h-8 text-brand mx-auto mb-2 animate-spin" />
            <p className="text-xs text-gray-600 mb-1">
              Subiendo {progreso} de {value.length + progreso} imagen(es)…
            </p>
          </>
        ) : (
          <>
            <Camera className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500 mb-2">
              {quedan === 0
                ? `Máximo ${maxFiles} imágenes. Quita alguna para subir más.`
                : 'Arrastra las imágenes o haz clic para elegirlas.'}
            </p>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 bg-white">
              <Upload className="w-3.5 h-3.5" /> Añadir imágenes
            </span>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          disabled={disabled || quedan === 0}
          onChange={(e) => { procesar(e.target.files); e.target.value = ''; }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 mt-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3">
          {value.map((foto, i) => (
            <div key={foto.url || i} className="w-24">
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                {foto.url ? (
                  <img
                    src={versionarImagen(foto.url)}
                    alt={foto.parte || `Imagen ${i + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => quitar(i)}
                    aria-label={`Quitar imagen ${i + 1}`}
                    className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5 hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {partes.length > 0 ? (
                <select
                  value={foto.parte || ''}
                  onChange={(e) => cambiarParte(i, e.target.value)}
                  disabled={disabled}
                  aria-label={`Parte de la imagen ${i + 1}`}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-1.5 py-1 text-[10px] text-gray-700 bg-white disabled:opacity-50"
                >
                  {partes.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                foto.parte && (
                  <p className="mt-1 text-[10px] text-gray-500 truncate" title={foto.parte}>{foto.parte}</p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
