import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { versionarImagen } from '../../lib/images';
import { stockHojaAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  borradoresDeUbicacion, imagenesConStock, stockPorColor, stockPorColorAlmacen, totalBorradores, validarCantidadInicial,
} from '../../lib/stockPorTienda';

const ALMACEN = 'almacen';

export default function StockPorTienda({ productoId, colores, imagenes }) {
  const [tiendas, setTiendas] = useState([]);
  const [existencias, setExistencias] = useState([]);
  const [stockAlmacen, setStockAlmacen] = useState([]);
  const [errorAlmacen, setErrorAlmacen] = useState('');
  const [borradores, setBorradores] = useState([]);
  const [errorBorradores, setErrorBorradores] = useState('');
  const [tiendaId, setTiendaId] = useState('');
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');
  const [pestanas, setPestanas] = useState(null);
  const [errorHoja, setErrorHoja] = useState('');
  const [consultandoHoja, setConsultandoHoja] = useState(false);
  const { accessToken, ability } = useAuth();

  useEffect(() => {
    let vigente = true;
    async function cargar() {
      setEstado('cargando');
      setTiendaId('');
      try {
        const [tiendasRes, stockRes, almacenRes, borradoresRes] = await Promise.all([
          supabase.from('greenline_stores').select('id, name, active').order('name'),
          supabase.from('prod_color_stock').select('tienda_id, color_id, stock').eq('producto_id', productoId),
          supabase.from('prod_color_almacen').select('color_id, stock').eq('producto_id', productoId),
          supabase.from('stock_carga_inicial').select('id, color_id, tienda_id, stock, updated_at').eq('producto_id', productoId),
        ]);
        if (!vigente) return;
        const fallo = tiendasRes.error || stockRes.error;
        if (fallo) throw fallo;
        setTiendas(tiendasRes.data || []);
        setExistencias(stockRes.data || []);
        setStockAlmacen(almacenRes.data || []);
        setErrorAlmacen(almacenRes.error?.message || '');
        setBorradores(borradoresRes.data || []);
        setErrorBorradores(borradoresRes.error?.message || '');
        setEstado('listo');
      } catch (fallo) {
        if (!vigente) return;
        setError(fallo.message || 'Error de conexión.');
        setEstado('error');
      }
    }
    cargar();
    return () => { vigente = false; };
  }, [productoId]);

  const coloresTienda = tiendaId === ALMACEN
    ? stockPorColorAlmacen(colores, stockAlmacen)
    : stockPorColor(colores, existencias, tiendaId);
  const imagenesTienda = imagenesConStock(imagenes, coloresTienda);
  const borradoresUbicacion = borradoresDeUbicacion(borradores, tiendaId);

  const consultarHoja = async () => {
    setConsultandoHoja(true);
    setErrorHoja('');
    setPestanas(null);
    try {
      const resultado = await stockHojaAPI.estructura(accessToken);
      setPestanas(resultado.pestanas);
    } catch (fallo) {
      setErrorHoja(fallo.error || fallo.message || 'No se pudo consultar la hoja.');
    } finally {
      setConsultandoHoja(false);
    }
  };

  const guardarBorrador = async (colorId, valor, anterior) => {
    const stock = validarCantidadInicial(valor);
    if (stock === null) throw new Error('Ingresa una cantidad entera entre 0 y 2147483647.');

    const consulta = anterior
      ? supabase.from('stock_carga_inicial')
        .update({ stock }).eq('id', anterior.id).eq('updated_at', anterior.updated_at)
      : supabase.from('stock_carga_inicial').insert({
        producto_id: Number(productoId),
        color_id: Number(colorId),
        tienda_id: tiendaId === ALMACEN ? null : tiendaId,
        stock,
      });
    const { data, error: fallo } = await consulta.select('id, color_id, tienda_id, stock, updated_at').maybeSingle();
    if (fallo) throw new Error(fallo.message);
    if (!data) throw new Error('El borrador cambió en otra sesión. Recarga el producto antes de modificarlo.');
    setBorradores((actuales) => [...actuales.filter((fila) => fila.id !== data.id), data]);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-900 mb-2">Consulta de stock por ubicación</h2>
      <p className="text-xs text-gray-500 mb-4">
        Consulta de existencias actuales y preparación de la carga inicial.
        Los borradores no modifican el stock ni se sincronizan con movimientos.
      </p>
      {estado === 'cargando' && <p className="text-sm text-gray-500">Cargando stock por tienda...</p>}
      {estado === 'error' && <p role="alert" className="text-sm text-red-600">No se pudo consultar el stock por tienda: {error}</p>}
      {ability.can('read', 'config') && (
        <div className="mb-4">
          <button type="button" onClick={consultarHoja} disabled={consultandoHoja} className="text-sm text-brand font-semibold disabled:opacity-50">
            {consultandoHoja ? 'Consultando hoja...' : 'Inspeccionar hoja de inventario'}
          </button>
          <p className="text-xs text-gray-500 mt-1">Muestra hasta 10 filas por pestaña visible; no importa ni modifica stock.</p>
          {errorHoja && <p role="alert" className="text-sm text-red-600 mt-2">{errorHoja}</p>}
          {pestanas && (
            <div className="space-y-3 mt-3">
              <button type="button" onClick={() => setPestanas(null)} className="text-xs text-gray-600 underline">Cerrar muestra</button>
              {pestanas.length === 0 && <p className="text-xs text-gray-500">La hoja no tiene pestañas visibles.</p>}
              {pestanas.map((pestana) => (
                <div key={pestana.id}>
                  <h3 className="text-sm font-semibold text-gray-800">{pestana.nombre}</h3>
                  {pestana.filas.length === 0 ? <p className="text-xs text-gray-500">Sin datos en las primeras filas.</p> : (
                    <div className="overflow-x-auto mt-1">
                      <table className="text-xs text-left border-collapse">
                        <tbody>
                          {pestana.filas.map((fila, i) => (
                            <tr key={i}>
                              {fila.map((celda, j) => <td key={j} className="border border-gray-200 px-2 py-1 whitespace-nowrap">{String(celda ?? '')}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {estado === 'listo' && (
        <>
          <label htmlFor="consulta-tienda" className="block text-sm text-gray-700 mb-1">Ubicación</label>
          <select id="consulta-tienda" value={tiendaId} onChange={(e) => setTiendaId(e.target.value)} className="input">
            <option value="">Seleccionar ubicación...</option>
            <option value={ALMACEN}>Almacén</option>
            {tiendas.map((tienda) => (
              <option key={tienda.id} value={tienda.id}>{tienda.name}{tienda.active ? '' : ' (inactiva)'}</option>
            ))}
          </select>
          {tiendas.length === 0 && <p className="text-xs text-gray-500 mt-2">No hay tiendas disponibles para consultar.</p>}
          {tiendaId === ALMACEN && errorAlmacen && (
            <p role="alert" className="text-sm text-red-600 mt-2">No se pudo consultar el almacén: {errorAlmacen}</p>
          )}
          {tiendaId && !(tiendaId === ALMACEN && errorAlmacen) && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-800">Colores y unidades</h3>
              {coloresTienda.length === 0 && <p className="text-xs text-gray-500 mt-2">No hay colores registrados.</p>}
              <ul className="mt-2 space-y-1">
                {coloresTienda.map((color, index) => (
                  <li key={`${color.color_id}-${index}`} className="text-sm text-gray-600">
                    {color.nombre}: {color.stockTienda === null ? 'sin registro' : `${color.stockTienda} unidad(es)`}
                  </li>
                ))}
              </ul>
              <h3 className="text-sm font-semibold text-gray-800 mt-4">Imágenes de colores con stock</h3>
              {imagenesTienda.length === 0 ? (
                <p className="text-xs text-gray-500 mt-2">No hay imágenes de colores con stock registrado en esta ubicación.</p>
              ) : (
                <div className="flex flex-wrap gap-3 mt-2">
                  {imagenesTienda.map((imagen, index) => (
                    <figure key={imagen.id || `${imagen.url}-${index}`} className="text-xs text-gray-600">
                      <img src={versionarImagen(imagen.url)} alt={imagen.color} className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                      <figcaption className="mt-1">{imagen.color}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
          {tiendaId && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-800">Borrador de carga inicial</h3>
              <p className="text-xs text-amber-700 mt-1">
                Estas cantidades no están disponibles para pedidos. Su aplicación requiere definir el corte del inventario.
                Guarda primero cualquier color nuevo en el producto.
              </p>
              {!errorBorradores && (
                <p className="text-xs text-gray-600 mt-1">
                  Total cargado en borradores de todas las ubicaciones: {totalBorradores(borradores)} unidades.
                </p>
              )}
              {errorBorradores ? (
                <p role="alert" className="text-sm text-red-600 mt-2">No se pudo consultar la carga inicial: {errorBorradores}</p>
              ) : (
                <div className="space-y-2 mt-3">
                  {coloresTienda.map((color, index) => {
                    const borrador = borradoresUbicacion.find((fila) => String(fila.color_id) === String(color.color_id));
                    return (
                      <FilaCargaInicial
                        key={`${tiendaId}-${color.color_id}-${index}-${borrador?.updated_at || 'nuevo'}`}
                        color={color}
                        borrador={borrador}
                        onGuardar={guardarBorrador}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilaCargaInicial({ color, borrador, onGuardar }) {
  const [valor, setValor] = useState(borrador ? String(borrador.stock) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      await onGuardar(color.color_id, valor, borrador);
    } catch (fallo) {
      setError(fallo.message || 'No se pudo guardar la cantidad.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor={`carga-inicial-${color.color_id}`} className="text-sm text-gray-700 min-w-24">{color.nombre}</label>
        <input
          id={`carga-inicial-${color.color_id}`}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          type="number"
          min="0"
          max="2147483647"
          step="1"
          className="input w-28 text-sm"
          placeholder="Sin registro"
          disabled={guardando}
        />
        <button type="button" onClick={guardar} disabled={guardando} className="text-sm font-semibold text-brand disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar borrador'}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
