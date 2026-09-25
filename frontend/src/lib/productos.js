/**
 * Capa de acceso a datos - Productos
 *
 * Fuente única: Supabase.
 */

import { supabase } from './supabase';
import { versionarImagen, versionarImagenAltaResolucion } from './images';
import { normalizeColorName } from './colores';

const supabaseConfigured = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ============================================================
// Fetch principal: Supabase
// ============================================================

let _productosCache = null;
let _productosCacheTs = 0;
const CACHE_TTL_MS = 60_000;

export async function fetchProductos({ force = false } = {}) {
  if (!force && _productosCache && Date.now() - _productosCacheTs < CACHE_TTL_MS) {
    return _productosCache;
  }

  if (!supabaseConfigured) {
    console.warn('Supabase no configurado: sin datos de productos.');
    _productosCache = [];
    _productosCacheTs = Date.now();
    return _productosCache;
  }

  try {
    _productosCache = await fetchFromSupabase();
  } catch (err) {
    console.warn('Supabase fetch failed:', err.message);
    _productosCache = [];
  }
  _productosCacheTs = Date.now();
  return _productosCache;
}

export function clearCache() {
  _productosCache = null;
  _productosCacheTs = 0;
}

// ============================================================
// Fuente: Supabase
// ============================================================

async function fetchFromSupabase() {
  const [{ data, error }, coloresRes] = await Promise.all([
    supabase
      .from('vista_productos_web')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('colores').select('id, nombre, hex_code'),
  ]);

  if (error) throw error;
  const catalogo = coloresRes?.data || [];
  return data.map((vista) => adaptarVista(vista, catalogo));
}

function adaptarVista(vista, catalogo = []) {
  // Los colores/imágenes/ficha ya vienen resueltos y ordenados desde
  // la vista DB (vista_productos_web). Aquí solo se moldea a la forma
  // que consume la UI y se aplica el versionado de imágenes.
  const ficha = vista.ficha_tecnica || {};

  const imagenes = (vista.imagenes || []).map((img) => ({
    id: img.id,
    src: versionarImagen(img.src),
    src_alta_resolucion: versionarImagenAltaResolucion(img.src),
    color: img.color,
    es_principal: img.es_principal,
  }));

  const coloresDetalle = (vista.colores_detalle || []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    hex_code: c.hex_code,
    stock: c.stock,
    visible: c.visible !== false,
  }));

  // Colores ocultos por el admin (p. ej. agotados): sus imágenes no se muestran.
  const ocultos = new Set(
    coloresDetalle.filter((c) => !c.visible).map((c) => normalizeColorName(c.nombre)),
  );
  const imagenesVisibles = ocultos.size
    ? imagenes.filter((img) => !img.color || !ocultos.has(normalizeColorName(img.color)))
    : imagenes;

  // `colores_detalle` sólo incluye lo vinculado en `prod_color_rel`. Para que
  // los puntitos de color muestren siempre el hex correcto, completamos con el
  // catálogo global `colores` cualquier color usado en las imágenes que falte.
  const catalogoPorNombre = new Map(
    catalogo.map((c) => [normalizeColorName(c.nombre), c]),
  );
  const presentes = new Set(coloresDetalle.map((c) => normalizeColorName(c.nombre)));
  for (const img of imagenesVisibles) {
    if (!img.color) continue;
    const key = normalizeColorName(img.color);
    if (presentes.has(key)) continue;
    const cat = catalogoPorNombre.get(key);
    coloresDetalle.push({
      id: cat?.id ?? null,
      nombre: img.color,
      hex_code: cat?.hex_code ?? null,
      stock: null,
      visible: true,
    });
    presentes.add(key);
  }

  return {
    id: vista.id,
    nombre: vista.nombre,
    slug: vista.slug || slugify(vista.nombre),
    descripcion: vista.descripcion,
    precio_original: vista.precio_original,
    precio_actual: vista.precio_actual,
    destacado: vista.destacado,
    videoId: vista.video_id,
    created_at: vista.created_at,
    updated_at: vista.updated_at,

    categoria: vista.categoria || null,
    categoria_id: vista.categoria_id || null,
    colores: coloresDetalle.filter((c) => c.visible).map((c) => c.nombre),
    colores_detalle: coloresDetalle,
    // COMENTADO (temporal — stock por números):
    // unidades: stockTotal,
    unidades: null,
    disponibilidad: vista.disponibilidad || 'En stock',
    etiquetas: vista.etiquetas || [],
    bateria: ficha.tipo_bateria || null,
    motor: ficha.potencia_motor || null,
    imagenes: imagenesVisibles,

    ficha_tecnica: {
      tipo_motor: ficha.tipo_motor || null,
      potencia_motor: ficha.potencia_motor || null,
      torque_maximo: ficha.torque_maximo || null,
      potencia_bateria: ficha.potencia_bateria || null,
      tipo_bateria: ficha.tipo_bateria || null,
      bateria_extraible: ficha.bateria_extraible ?? null,
      requiere_placa_soat: ficha.requiere_placa_soat ?? null,
      capacidad_bateria: ficha.capacidad_bateria || null,
      vida_util_bateria: ficha.vida_util_bateria || null,
      tipo_toma_corriente: ficha.tipo_toma_corriente || null,
      tiempo_carga_min: ficha.tiempo_carga_min || null,
      velocidad_max_kmh: ficha.velocidad_max_kmh || null,
      autonomia_km: ficha.autonomia_km || null,
      carga_minima_kg: ficha.carga_minima_kg ?? null,
      carga_maxima_kg: ficha.carga_maxima_kg || null,
      largo_cm: ficha.largo_cm || null,
      ancho_cm: ficha.ancho_cm || null,
      alto_cm: ficha.alto_cm || null,
    },

    info_adicional: vista.info_adicional || {},
  };
}

// ============================================================
// Helpers
// ============================================================

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const CATEGORIAS = [
  'VMP',
  'Motos Eléctricas',
  'Trimotos Eléctricas',
  'Cargueros',
  'Cuatrimotos',
];

export const BATERIAS = ['Litio', 'Plomo Ácido', 'Plomo Grafeno'];

export function sortProducts(products, sortBy = 'price_asc') {
  const sorted = [...products];
  switch (sortBy) {
    case 'price_desc':
      return sorted.sort((a, b) => (b.precio_actual ?? 0) - (a.precio_actual ?? 0));
    case 'name_asc':
      return sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
    default:
      return sorted.sort((a, b) => (a.precio_actual ?? Infinity) - (b.precio_actual ?? Infinity));
  }
}
