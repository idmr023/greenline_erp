function buildVersion() {
  const env = import.meta.env?.VITE_IMAGE_VERSION;
  if (env) return String(env);
  return "20260915";
}

const VERSION = buildVersion();

const VERSION_RE = /[?&]v=([\w.-]+)/;

function agregarVersion(src) {
  return src + (src.includes("?") ? "&" : "?") + `v=${VERSION}`;
}

export function versionarImagen(src) {
  if (!src) return src;
  if (VERSION_RE.test(src)) return src;
  return agregarVersion(src);
}

export function versionarImagenAltaResolucion(src) {
  if (!src) return src;
  return versionarImagen(src.split('?')[0]);
}

/**
 * Aplica versionado (cache-busting) a las imágenes dentro de un HTML
 * (p. ej. el `content_html` de los artículos del blog): reescribe el
 * atributo `src` de cada <img> cuando todavía no tiene `?v=`.
 */
export function versionarHtml(html) {
  if (!html) return html;
  return html.replace(
    /(<img[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (match, antes, src, despues) => {
      const versionada = versionarImagen(src);
      return versionada === src ? match : `${antes}${versionada}${despues}`;
    }
  );
}

const v = versionarImagen;

// ----------------------------------------------------------------------------
// Logos
// ----------------------------------------------------------------------------
export const LOGO = v('/assets/imagenes/logos/logo_final.webp');

// ----------------------------------------------------------------------------
// Carrusel del home
// ----------------------------------------------------------------------------
export const CARRUSEL = [
  v('/assets/imagenes/caroussel/1.png'),
  v('/assets/imagenes/caroussel/2.jpeg'),
  v('/assets/imagenes/caroussel/3.png'),
  v('/assets/imagenes/caroussel/4.jpeg'),
  v('/assets/imagenes/caroussel/5.jpeg'),
  v('/assets/imagenes/caroussel/6.jpeg'),
];

// ----------------------------------------------------------------------------
// Banners de categoría (Shop)
// ----------------------------------------------------------------------------
export const BANNERS = {
  default: {
    title: 'Tienda GreenLine',
    subtitle: 'Encuentra tu vehículo eléctrico ideal.',
    image: '',
  },
  VMP: {
    title: 'Vehículos de Movilidad Personal',
    subtitle: 'Bicimotos, monopatines y más para tu día a día.',
    image: v('/assets/imagenes/banner_categoria_producto/vmp.webp'),
  },
  'Motos Eléctricas': {
    title: 'Motos Eléctricas',
    subtitle: 'Potencia, autonomía y cero emisiones.',
    image: v('/assets/imagenes/banner_categoria_producto/motos.webp'),
  },
  'Trimotos Eléctricas': {
    title: 'Trimotos Eléctricas',
    subtitle: 'Estabilidad y carga para tu trabajo diario.',
    image: v('/assets/imagenes/banner_categoria_producto/trimotos.webp'),
  },
  Cargueros: {
    title: 'Cargueros Eléctricos',
    subtitle: 'La solución de carga para tu negocio.',
    image: v('/assets/imagenes/banner_categoria_producto/encabezaado-web-fijo.webp'),
  },
  Cuatrimotos: {
    title: 'Cuatrimotos',
    subtitle: 'Estabilidad, seguridad y movilidad universal.',
    image: v('/assets/imagenes/banner_categoria_producto/encabezaado-web-fijo.webp'),
  },
};

// ----------------------------------------------------------------------------
// Banner genérico (PageBanner por defecto)
// ----------------------------------------------------------------------------
export const BANNER_DEFAULT = v('/assets/imagenes/banner_categoria_producto/encabezaado-web-fijo.webp');

// ----------------------------------------------------------------------------
// Tiendas (StoreLocator)
// ----------------------------------------------------------------------------
export const TIENDAS = {
  Lince: v('/assets/imagenes/tiendas/tienda_lince.webp'),
  Surco: v('/assets/imagenes/tiendas/tienda_surco.jpeg'),
  'San Miguel': v('/assets/imagenes/tiendas/tienda_san_miguel.webp'),
  Miraflores: v('/assets/imagenes/tiendas/tienda_miraflores.webp'),
  'La Molina': v('/assets/imagenes/tiendas/tienda_molina.webp'),
  Comas: v('/assets/imagenes/tiendas/tienda_comas.webp'),
  Salamanca: v('/assets/imagenes/tiendas/tienda_salamanca.webp'),
  Huancayo: v('/assets/imagenes/tiendas/tienda_huancayo.webp'),
  Santiago: v('/assets/imagenes/tiendas/tienda_santiago.webp'),
};

// ----------------------------------------------------------------------------
// Nosotros
// ----------------------------------------------------------------------------
export const NOSOTROS_HEADER = v('/assets/imagenes/paginas/nosotros/nosotros_header.webp');
export const NOSOTROS_CARRUSEL = (n) => v(`/assets/imagenes/paginas/nosotros/nosotros_carrousel_${n}.jpeg`);

// ----------------------------------------------------------------------------
// Social media grid / Videos
// ----------------------------------------------------------------------------
export const SOCIAL_MEDIA_GRID = {
  f4_pro_video: v('/assets/imagenes/social_media_grid/f4_pro_video.webp'),
  gl3_post: v('/assets/imagenes/social_media_grid/gl3_post.webp'),
  gl3_post_aura: v('/assets/imagenes/social_media_grid/gl3_post_aura.webp'),
  gl3_video: v('/assets/imagenes/social_media_grid/gl3_video.webp'),
  h3_pro_titktok: v('/assets/imagenes/social_media_grid/h3_pro_titktok.webp'),
  h3_pro_video: v('/assets/imagenes/social_media_grid/h3_pro_video.webp'),
  l3pro_video: v('/assets/imagenes/social_media_grid/l3pro_video.webp'),
  m_car_video: v('/assets/imagenes/social_media_grid/m_car_video.webp'),
  mx6_video: v('/assets/imagenes/social_media_grid/mx6_video.webp'),
  placa_gratis_tiktok: v('/assets/imagenes/social_media_grid/placa_gratis_tiktok.webp'),
  s6pro_video: v('/assets/imagenes/social_media_grid/s6pro_video.webp'),
  t6_post: v('/assets/imagenes/social_media_grid/t6_post.webp'),
  tc_bus_post: v('/assets/imagenes/social_media_grid/tc_bus_post.webp'),
  tc2_160a_post: v('/assets/imagenes/social_media_grid/tc2_160a_post.webp'),
  x3_post: v('/assets/imagenes/social_media_grid/x3_post.webp'),
  y5_video_tiktok: v('/assets/imagenes/social_media_grid/y5_video_tiktok.webp'),
};

// ----------------------------------------------------------------------------
// Social media grid / Imagenes
// ----------------------------------------------------------------------------
export const SOCIAL_MEDIA_GRID_IMAGENES = [
  v('/assets/imagenes/social_media_grid/fl2_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/fl2_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/t6_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/sr_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/mx6_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tm9_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tm7_v2026_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/h3_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/v9_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/m3_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tm6_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/vmp_s9_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tc2_160a_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/vmp_l3_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tc_bus_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tc2_110a_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/f4_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/gl3_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/vmp_p01_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/vmp_s6_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/vmp_s4_pro_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/vmp_t4_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/y5_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tc2_160a_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tc2_160_con_techo_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/m_car_1_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/m_car_2_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/m_car_3_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/m_car_4_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/m_car_5_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/gl4_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/h5_tiktok.webp'),
  v('/assets/imagenes/social_media_grid/tc2_160a_tiktok.webp'),
];

// ----------------------------------------------------------------------------
// Aniversario
// ----------------------------------------------------------------------------
export const ANIVERSARIO_VIDEO = v('/assets/imagenes/aniversario/greenline_aniversario_video.webp');

// ----------------------------------------------------------------------------
// Productos — URL base para rutas que vienen de la DB
// ----------------------------------------------------------------------------
export const URL_BASE = '/assets/imagenes/productos/';
