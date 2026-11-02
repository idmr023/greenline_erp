import { useState } from 'react';
import { Plus, X, Loader2 } from '../../lib/icons';
import { supabase } from '../../lib/supabase';

/**
 * Alta de categorías de producto.
 *
 * `public.categorias` ya tiene INSERT para el panel (política "Panel gestiona
 * categorías" → es_admin_panel()), así que el alta se hace directo por
 * Supabase, como el resto del catálogo.
 *
 * El interruptor "Precio por cuotas" marca la categoría como las de scooters:
 * en la web no se muestra el precio tachado ni el % de descuento, sino el
 * precio, el precio en cuotas y el precio de cada cuota.
 */
export default function NuevaCategoria({ onClose, onCreada }) {
  const [nombre, setNombre] = useState('');
  const [precioPorCuotas, setPrecioPorCuotas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    const limpio = nombre.trim();
    if (limpio.length < 2) {
      setError('Escribe el nombre de la categoría.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('categorias')
        .insert({ nombre: limpio, precio_por_cuotas: precioPorCuotas })
        .select('id, nombre, precio_por_cuotas')
        .single();
      if (err) {
        setError(
          err.code === '23505'
            ? 'Ya existe una categoría con ese nombre.'
            : err.message || 'No se pudo crear la categoría.',
        );
        return;
      }
      onCreada?.(data);
      onClose?.();
    } catch (e) {
      setError(e.message || 'No se pudo crear la categoría.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-brand" />
            Nueva categoría
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nombre *
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }}
            placeholder="Scooters"
            className="input mt-1"
            autoFocus
          />
        </label>

        <label className="flex items-start gap-2 mt-4 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={precioPorCuotas}
            onChange={(e) => setPrecioPorCuotas(e.target.checked)}
            className="mt-1"
          />
          <span>
            Se muestra por cuotas
            <span className="block text-xs text-gray-500">
              En la web se verá el precio, el precio en cuotas y el precio de cada
              cuota (en vez del precio tachado y el descuento).
            </span>
          </span>
        </label>

        {error && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !nombre.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear categoría
          </button>
        </div>
      </div>
    </div>
  );
}
