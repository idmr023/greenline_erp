import { useCallback, useEffect, useMemo, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import { supabase } from '../../lib/supabase';
import { clearCache } from '../../lib/productos';
import { Check, Download, Loader2, Upload, X } from '../../lib/icons';

/**
 * Importación masiva de stock: unidades por modelo × color.
 *
 * Lee un `.xlsx` o `.csv` con las columnas `Modelo`, `Color` y `Unidades`, lo
 * contrasta con los productos/colores reales y muestra una vista PREVIA con el
 * estado de cada fila ANTES de escribir nada en la base.
 *
 * Escritura: `upsert` en `prod_color_rel` por (producto_id, color_id). En las
 * relaciones existentes viaja sólo `stock` (se conserva `visible` y el resto de
 * la fila); los pares producto+color válidos todavía sin relación se crean con
 * `visible: true` y se marcan como «nueva relación» en la vista previa.
 *
 * El `.xlsx` se parsea con `read-excel-file` (sólo lectura, MIT, sin escribir
 * el archivo); el `.csv` con un parser propio. Todo ocurre en el navegador: el
 * archivo no viaja a ningún servidor.
 */

const LOTE = 100;

const ALIAS_MODELO = ['modelo', 'producto', 'vehiculo', 'nombre', 'producto modelo', 'modelo producto'];
const ALIAS_COLOR = ['color', 'colores', 'tonalidad'];
const ALIAS_UNIDADES = ['unidades', 'stock', 'cantidad', 'uds', 'numero', 'nro'];

const PLANTILLA_CSV = [
  'Modelo,Color,Unidades',
  'Ejemplo Moto EL1,ROJO,3',
  'Ejemplo Moto EL1,AZUL,0',
  'Ejemplo Scooter XT2,BLANCO,5',
].join('\r\n');

/** Minúsculas sin acentos y con espacios colapsados (para emparejar nombres). */
const normalizar = (texto) =>
  (texto ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Celda a texto plano (los números de Excel llegan como number). */
const celdaTexto = (celda) => (celda === null || celda === undefined ? '' : String(celda).trim());

/**
 * CSV propio: detecta separador (`,` `;` o tab), respeta comillas y la BOM
 * que Excel pone al guardar «CSV UTF-8».
 */
function parseCsv(texto) {
  const limpio = texto.replace(/^\uFEFF/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] || '';
  const candidatos = [',', ';', '\t'];
  const separador = candidatos.reduce(
    (mejor, sep) => ((primera.split(sep).length > primera.split(mejor).length ? sep : mejor)),
    ',',
  );

  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (entreComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; } else { entreComillas = false; }
      } else campo += ch;
      continue;
    }
    if (ch === '"') { entreComillas = true; continue; }
    if (ch === separador) { fila.push(campo); campo = ''; continue; }
    if (ch === '\n') { fila.push(campo); camposFin(fila, filas); fila = []; campo = ''; continue; }
    if (ch === '\r') continue;
    campo += ch;
  }
  fila.push(campo);
  camposFin(fila, filas);
  return filas;

  function camposFin(f, out) {
    const celda = (v) => v.trim();
    const valores = f.map(celda);
    if (valores.length === 1 && valores[0] === '') return; // línea en blanco
    out.push(valores);
  }
}

/** Índice de columna por alias (cabeceras sin acentos/mayúsculas). */
function indiceColumna(cabecera, alias) {
  const normalizada = cabecera.map(normalizar);
  return normalizada.findIndex((c) => alias.includes(c));
}

/**
 * Filas crudas → filas de vista previa con estado. Los duplicados
 * (mismo modelo+color repetido) se SUMAN en la primera aparición.
 */
function interpretarFilas(filasCrudas, catalogo) {
  const { productos, colores, pares } = catalogo;
  if (!filasCrudas.length) return { error: 'El archivo está vacío.' };

  const cabecera = filasCrudas[0];
  const iModelo = indiceColumna(cabecera, ALIAS_MODELO);
  const iColor = indiceColumna(cabecera, ALIAS_COLOR);
  const iUnidades = indiceColumna(cabecera, ALIAS_UNIDADES);
  if (iModelo < 0 || iColor < 0 || iUnidades < 0) {
    return {
      error:
        'No encuentro las columnas esperadas. Usa la plantilla: "Modelo", "Color" y "Unidades" ' +
        '(también se aceptan "Producto" y "Stock"/"Cantidad").',
    };
  }

  const porProducto = new Map();
  for (const p of productos) {
    porProducto.set(normalizar(p.nombre), p);
    if (p.slug) porProducto.set(normalizar(p.slug), p);
  }
  const porColor = new Map(colores.map((c) => [normalizar(c.nombre), c]));

  const filas = [];
  const acumuladas = new Map(); // `${productoId}:${colorId}` -> índice de la fila que acumula
  let ignoradas = 0;

  filasCrudas.slice(1).forEach((celdas, idx) => {
    const numeroFila = idx + 2; // 1-based incluyendo la cabecera
    const modelo = celdaTexto(celdas[iModelo]);
    const color = celdaTexto(celdas[iColor]);
    const unidades = celdaTexto(celdas[iUnidades]);

    if (!modelo && !color && !unidades) { ignoradas++; return; }

    const base = { fila: numeroFila, modelo, color, unidadesTexto: unidades };

    const prod = porProducto.get(normalizar(modelo));
    if (!prod) {
      filas.push({ ...base, estado: 'producto_no_encontrado', detalle: 'Modelo inexistente.' });
      return;
    }
    const col = porColor.get(normalizar(color));
    if (!col) {
      filas.push({ ...base, estado: 'color_no_encontrado', detalle: 'Color inexistente en el catálogo.' });
      return;
    }
    if (!/^\d+$/.test(unidades)) {
      filas.push({
        ...base,
        estado: 'numero_invalido',
        detalle: 'Unidades debe ser un número entero igual o mayor a 0.',
      });
      return;
    }

    const unidadesN = Number(unidades);
    const clave = `${prod.id}:${col.id}`;
    const previa = acumuladas.get(clave);
    if (previa !== undefined) {
      const acumulada = filas[previa];
      const nueva = acumulada.unidades + unidadesN;
      filas.push({
        ...base,
        estado: 'duplicado',
        detalle: `Repite el modelo+color de la fila ${acumulada.fila}: se suma (${acumulada.unidades} + ${unidadesN} = ${nueva}).`,
      });
      acumulada.unidades = nueva;
      acumulada.duplicadas = (acumulada.duplicadas || 0) + 1;
      return;
    }

    const vinculado = pares.has(`${prod.id}:${col.id}`);
    const fila = {
      ...base,
      productoId: prod.id,
      colorId: col.id,
      unidades: unidadesN,
      estado: vinculado ? 'ok' : 'nueva_relacion',
      detalle: vinculado
        ? 'Listo: se actualizará el stock de ese color.'
        : 'Ese color todavía no está vinculado al modelo: se creará la relación.',
    };
    acumuladas.set(clave, filas.length);
    filas.push(fila);
  });

  return { filas, ignoradas };
}

const ETIQUETAS_ESTADO = {
  ok: ['Listo', 'bg-emerald-50 text-emerald-700'],
  nueva_relacion: ['Nueva relación', 'bg-blue-50 text-blue-700'],
  duplicado: ['Duplicado', 'bg-gray-100 text-gray-500'],
  producto_no_encontrado: ['Modelo no encontrado', 'bg-red-50 text-red-700'],
  color_no_encontrado: ['Color no encontrado', 'bg-red-50 text-red-700'],
  numero_invalido: ['Unidades inválidas', 'bg-red-50 text-red-700'],
};

export default function AdminStockImportar({ onClose, onAplicado }) {
  const [estadoCatalogo, setEstadoCatalogo] = useState('cargando');
  const [productos, setProductos] = useState([]);
  const [colores, setColores] = useState([]);
  const [pares, setPares] = useState(() => new Set());
  const [catalogoError, setCatalogoError] = useState(null);

  const [procesando, setProcesando] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState(null);
  const [errorArchivo, setErrorArchivo] = useState(null);
  const [filas, setFilas] = useState([]);
  const [ignoradas, setIgnoradas] = useState(0);
  const [filtro, setFiltro] = useState('todos');
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const cargarCatalogo = useCallback(async () => {
    setEstadoCatalogo('cargando');
    setCatalogoError(null);
    try {
      const [prodRes, colRes, relRes] = await Promise.all([
        supabase.from('productos').select('id, nombre, slug').order('nombre'),
        supabase.from('colores').select('id, nombre').order('nombre'),
        supabase.from('prod_color_rel').select('producto_id, color_id'),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (colRes.error) throw colRes.error;
      if (relRes.error) throw relRes.error;
      setProductos(prodRes.data || []);
      setColores(colRes.data || []);
      setPares(new Set((relRes.data || []).map((r) => `${r.producto_id}:${r.color_id}`)));
      setEstadoCatalogo('ok');
    } catch (err) {
      setCatalogoError(err?.message || 'No se pudo leer el catálogo de productos/colores.');
      setEstadoCatalogo('error');
    }
  }, []);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  const catalogo = useMemo(
    () => ({ productos, colores, pares }),
    [productos, colores, pares],
  );

  const aplicables = useMemo(
    () => filas.filter((f) => f.estado === 'ok' || f.estado === 'nueva_relacion'),
    [filas],
  );
  const conError = useMemo(
    () => filas.filter((f) => f.estado === 'producto_no_encontrado' || f.estado === 'color_no_encontrado' || f.estado === 'numero_invalido'),
    [filas],
  );

  const visibles = useMemo(() => {
    if (filtro === 'aplicables') return aplicables;
    if (filtro === 'error') return conError;
    return filas;
  }, [filtro, filas, aplicables, conError]);

  const manejarArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setProcesando(true);
    setErrorArchivo(null);
    setResultado(null);
    setFilas([]);
    setIgnoradas(0);
    try {
      let crudas;
      if (/\.xlsx$/i.test(archivo.name)) {
        crudas = await readXlsxFile(archivo);
      } else if (/\.(csv|txt)$/i.test(archivo.name)) {
        crudas = parseCsv(await archivo.text());
      } else {
        throw new Error('Formato no soportado: usa un archivo .xlsx o .csv.');
      }
      const salida = interpretarFilas(crudas, catalogo);
      if (salida.error) throw new Error(salida.error);
      setFilas(salida.filas);
      setIgnoradas(salida.ignoradas);
      setNombreArchivo(archivo.name);
    } catch (err) {
      setErrorArchivo(err?.message || 'No se pudo leer el archivo.');
    } finally {
      setProcesando(false);
      e.target.value = '';
    }
  };

  const descargarPlantilla = () => {
    const blob = new Blob([`\uFEFF${PLANTILLA_CSV}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-stock.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const aplicar = async () => {
    if (!aplicables.length) return;
    setAplicando(true);
    setResultado(null);

    const existentes = aplicables
      .filter((f) => f.estado === 'ok')
      .map((f) => ({ producto_id: f.productoId, color_id: f.colorId, stock: f.unidades }));
    const nuevas = aplicables
      .filter((f) => f.estado === 'nueva_relacion')
      .map((f) => ({ producto_id: f.productoId, color_id: f.colorId, stock: f.unidades, visible: true }));

    let actualizadas = 0;
    let creadas = 0;
    const fallos = [];

    try {
      for (let i = 0; i < existentes.length; i += LOTE) {
        const lote = existentes.slice(i, i + LOTE);
        const { error } = await supabase
          .from('prod_color_rel')
          .upsert(lote, { onConflict: 'producto_id,color_id' });
        if (error) throw error;
        actualizadas += lote.length;
      }
      for (let i = 0; i < nuevas.length; i += LOTE) {
        const lote = nuevas.slice(i, i + LOTE);
        const { error } = await supabase.from('prod_color_rel').insert(lote);
        if (error) throw error;
        creadas += lote.length;
      }
      clearCache();
      setResultado({ ok: true, actualizadas, creadas, fallos });
      onAplicado?.();
    } catch (err) {
      fallos.push({ fila: null, detalle: err?.message || 'Error al escribir en la base.' });
      setResultado({ ok: false, actualizadas, creadas, fallos });
    } finally {
      setAplicando(false);
    }
  };

  const chip = (etiqueta, valor, activo, onClick, tono) => (
    <button
      type="button"
      key={etiqueta}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
        activo ? tono : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {etiqueta}: {valor}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Importar stock (Excel / CSV)</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Columnas <b>Modelo</b>, <b>Color</b> y <b>Unidades</b>. Se revisa todo antes de escribir.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {estadoCatalogo === 'cargando' && (
          <p className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando productos y colores…
          </p>
        )}
        {estadoCatalogo === 'error' && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start justify-between gap-3">
            <span>{catalogoError}</span>
            <button
              type="button"
              onClick={() => void cargarCatalogo()}
              className="shrink-0 font-semibold underline"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
            <Upload className="w-4 h-4" />
            {nombreArchivo ? 'Cambiar archivo' : 'Elegir archivo .xlsx / .csv'}
            <input
              type="file"
              accept=".xlsx,.csv,.txt"
              onChange={manejarArchivo}
              disabled={estadoCatalogo !== 'ok' || procesando}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={descargarPlantilla}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Descargar plantilla
          </button>
          {procesando && (
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Leyendo {nombreArchivo || 'archivo'}…
            </span>
          )}
        </div>

        {errorArchivo && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorArchivo}
          </div>
        )}

        {filas.length > 0 && (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {chip('Listos', aplicables.filter((f) => f.estado === 'ok').length, filtro === 'aplicables', () => setFiltro(filtro === 'aplicables' ? 'todos' : 'aplicables'), 'bg-emerald-50 text-emerald-700 border-emerald-200')}
              {chip('Nuevas relaciones', aplicables.filter((f) => f.estado === 'nueva_relacion').length, false, () => setFiltro('aplicables'), 'bg-blue-50 text-blue-700 border-blue-200')}
              {chip('Con error', conError.length, filtro === 'error', () => setFiltro(filtro === 'error' ? 'todos' : 'error'), 'bg-red-50 text-red-700 border-red-200')}
              {chip('Total filas', filas.length, false, () => setFiltro('todos'), 'bg-gray-100 text-gray-700 border-gray-200')}
              {ignoradas > 0 && <span className="text-[11px] text-gray-400">{ignoradas} fila(s) en blanco ignoradas</span>}
            </div>

            <div className="flex-1 overflow-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold">Fila</th>
                    <th className="px-3 py-2 font-semibold">Modelo</th>
                    <th className="px-3 py-2 font-semibold">Color</th>
                    <th className="px-3 py-2 font-semibold text-right">Unidades</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f, i) => {
                    const [texto, tono] = ETIQUETAS_ESTADO[f.estado] || ['—', 'bg-gray-100 text-gray-500'];
                    return (
                      <tr key={`${f.fila}-${i}`} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 text-gray-400">{f.fila}</td>
                        <td className="px-3 py-1.5 text-gray-800">{f.modelo}</td>
                        <td className="px-3 py-1.5 text-gray-800">{f.color}</td>
                        <td className="px-3 py-1.5 text-right text-gray-800">
                          {f.estado === 'duplicado' ? '—' : f.unidades}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tono}`}>
                            {texto}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{f.detalle}</td>
                      </tr>
                    );
                  })}
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                        Ninguna fila con este filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {resultado && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              resultado.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {resultado.ok
              ? `Stock aplicado: ${resultado.actualizadas} color(es) actualizado(s), ${resultado.creadas} relación(es) creada(s).`
              : `Se aplicó una parte (${resultado.actualizadas} + ${resultado.creadas}) y falló: ${resultado.fallos[0]?.detalle}`}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            Escribe en <span className="font-mono">prod_color_rel</span> (stock por modelo × color).
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => void aplicar()}
              disabled={aplicando || estadoCatalogo !== 'ok' || aplicables.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {aplicando && <Loader2 className="w-4 h-4 animate-spin" />}
              <Check className="w-4 h-4" />
              Aplicar {aplicables.length} fila(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
