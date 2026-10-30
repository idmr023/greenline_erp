import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { clearCache } from '../../lib/productos';
import { versionarImagen } from '../../lib/images';
import { imagenesAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, ArrowUp, ArrowDown, Save, Upload, X, GripVertical, Search, FolderOpen, Loader2, Eye, EyeOff, FileText, Calendar } from '../../lib/icons';
import ConfirmModal from './ConfirmModal';
import {
  isoADatetimeLocal,
  datetimeLocalAIso,
  esFuturo,
  estadoPublicacion,
  fechaAgendadaLegible,
} from '../../utils/publicacionAgendada';

const EMPTY_PRODUCT = {
  nombre: '',
  slug: '',
  descripcion: '',
  precio_original: '',
  precio_actual: '',
  destacado: false,
  disponible: true,
  video_id: '',
  categoria_id: '',
  // Estado de publicación: false = borrador (no aparece en la tienda).
  activo: true,
  // Programación opcional de la publicación ("YYYY-MM-DDTHH:MM" local).
  publicar_en: '',
};

const EMPTY_FICHA = {
  potencia_motor: '',
  tipo_bateria: '',
  autonomia_km: '',
  velocidad_max_kmh: '',
  tiempo_carga_min: '',
  capacidad_bateria: '',
  vida_util_bateria: '',
  bateria_extraible: false,
  requiere_placa_soat: null,
  tipo_toma_corriente: '',
  torque_maximo: '',
  potencia_bateria: '',
  carga_maxima_kg: '',
  largo_cm: '',
  ancho_cm: '',
  alto_cm: '',
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function guardarProductoPrincipal(form, isEdit, productoId) {
  // `publicarEnIso` llega ya convertido (ISO UTC) o null por `confirmarGuardado`.
  const data = {
    nombre: form.nombre,
    slug: form.slug || slugify(form.nombre),
    descripcion: form.descripcion || null,
    precio_original: form.precio_original ? Number(form.precio_original) : null,
    precio_actual: Number(form.precio_actual),
    destacado: form.destacado,
    video_id: form.video_id || null,
    categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
    disponible: form.disponible !== false,
    // false = borrador/programado: el producto se guarda pero no se publica
    // en la web hasta que lo publiques o venza la fecha de agendado.
    activo: form.activo !== false,
    // ISO UTC o null: fecha en la que el producto debe publicarse solo.
    publicar_en: form.publicar_en ?? null,
  };
  if (isEdit) {
    const { error } = await supabase.from('productos').update(data).eq('id', productoId);
    return { prodId: productoId, error };
  }
  const { data: insertado, error } = await supabase.from('productos').insert(data).select('id').single();
  return { prodId: insertado?.id, error };
}

async function guardarFichaTecnica(ficha, isEdit, prodId) {
  const fichaData = {
    producto_id: prodId,
    potencia_motor: ficha.potencia_motor || null,
    tipo_bateria: ficha.tipo_bateria || null,
    autonomia_km: ficha.autonomia_km?.toString().trim() || null,
    velocidad_max_kmh: ficha.velocidad_max_kmh ? Number(ficha.velocidad_max_kmh) : null,
    tiempo_carga_min: ficha.tiempo_carga_min ? Number(ficha.tiempo_carga_min) : null,
    capacidad_bateria: ficha.capacidad_bateria || null,
    vida_util_bateria: ficha.vida_util_bateria || null,
    bateria_extraible: ficha.bateria_extraible,
    requiere_placa_soat: ficha.requiere_placa_soat ?? null,
    tipo_toma_corriente: ficha.tipo_toma_corriente || null,
    torque_maximo: ficha.torque_maximo || null,
    potencia_bateria: ficha.potencia_bateria || null,
    carga_maxima_kg: ficha.carga_maxima_kg ? Number(ficha.carga_maxima_kg) : null,
    largo_cm: ficha.largo_cm ? Number(ficha.largo_cm) : null,
    ancho_cm: ficha.ancho_cm ? Number(ficha.ancho_cm) : null,
    alto_cm: ficha.alto_cm ? Number(ficha.alto_cm) : null,
  };
  const { error } = isEdit
    ? await supabase.from('ficha_tecnica').upsert(fichaData, { onConflict: 'producto_id' })
    : await supabase.from('ficha_tecnica').insert(fichaData);
  return error;
}

async function guardarInfoAdicional(isEdit, prodId, idealPara, infoAdicionalData) {
  const idealList = idealPara.split(',').map((s) => s.trim()).filter(Boolean);
  if (!isEdit && !idealList.length) return null;
  const data = { ...infoAdicionalData };
  if (idealList.length) data.ideal_para = idealList;
  else delete data.ideal_para;
  const { error } = await supabase
    .from('info_adicional')
    .upsert({ producto_id: prodId, data }, { onConflict: 'producto_id' });
  return error;
}

/**
 * Unidades de un color como entero >= 0. El input entrega strings; vacío o
 * basura cuenta 0 (la validación estricta la hace `stockEsInvalido` antes).
 */
function stockEntero(valor) {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** true si el valor no es un entero >= 0 (se rechaza antes de guardar). */
function stockEsInvalido(valor) {
  if (valor === '' || valor === null || valor === undefined) return false;
  const texto = String(valor).trim();
  if (texto === '') return false;
  return !/^\d+$/.test(texto);
}

/**
 * Colores del producto: upsert por (producto_id, color_id).
 *
 * Antes se borraba todo y se reinsertaba con `stock: 0`, así que CADA guardado
 * del formulario pisaba las unidades cargadas. El upsert sólo toca las columnas
 * que viajan (stock/visible) y conserva el resto de la fila; las relaciones que
 * ya no están en el formulario se borran aparte.
 */
async function guardarColores(isEdit, prodId, productoColores) {
  const filas = productoColores
    .filter((cr) => cr.color_id)
    // Un mismo color no puede repetirse en el producto: gana la última fila.
    .reduce((acc, cr) => {
      acc.set(Number(cr.color_id), {
        producto_id: prodId,
        color_id: Number(cr.color_id),
        stock: stockEntero(cr.stock),
        visible: cr.visible !== false,
      });
      return acc;
    }, new Map());

  if (filas.size === 0) {
    if (!isEdit) return null;
    const { error } = await supabase.from('prod_color_rel').delete().eq('producto_id', prodId);
    return error;
  }

  if (!isEdit) {
    const { error } = await supabase.from('prod_color_rel').insert([...filas.values()]);
    return error;
  }

  const { data: actuales, error: errLectura } = await supabase
    .from('prod_color_rel')
    .select('color_id')
    .eq('producto_id', prodId);
  if (errLectura) return errLectura;

  const idsAhora = new Set(filas.keys());
  const eliminados = (actuales || [])
    .map((r) => r.color_id)
    .filter((id) => !idsAhora.has(id));
  if (eliminados.length) {
    const { error } = await supabase
      .from('prod_color_rel')
      .delete()
      .eq('producto_id', prodId)
      .in('color_id', eliminados);
    if (error) return error;
  }

  const { error } = await supabase
    .from('prod_color_rel')
    .upsert([...filas.values()], { onConflict: 'producto_id,color_id' });
  return error;
}

async function guardarImagenes(isEdit, prodId, imagenes) {
  if (isEdit) {
    const { error } = await supabase.from('imagenes').delete().eq('producto_id', prodId);
    if (error) return error;
  }
  for (let i = 0; i < imagenes.length; i++) {
    const img = imagenes[i];
    if (!img.url) continue;
    const { error } = await supabase.from('imagenes').insert({
      producto_id: prodId,
      url: img.url,
      color: img.color,
      es_principal: i === 0,
      orden: i,
    });
    if (error) return error;
  }
  return null;
}

async function guardarProductoCompleto(context) {
  const { form, isEdit, productoId, ficha, idealPara, infoAdicionalData, productoColores, imagenes } = context;
  const { prodId, error: prodError } = await guardarProductoPrincipal(form, isEdit, productoId);
  if (prodError) return { paso: 'producto', error: prodError };
  const fichaError = await guardarFichaTecnica(ficha, isEdit, prodId);
  if (fichaError) return { paso: 'ficha técnica', error: fichaError };
  const infoError = await guardarInfoAdicional(isEdit, prodId, idealPara, infoAdicionalData);
  if (infoError) return { paso: 'info adicional', error: infoError };
  const coloresError = await guardarColores(isEdit, prodId, productoColores);
  if (coloresError) return { paso: 'colores', error: coloresError };
  const imagenesError = await guardarImagenes(isEdit, prodId, imagenes);
  if (imagenesError) return { paso: 'imágenes', error: imagenesError };
  return null;
}

export default function AdminProductoForm({ productoId, onBack, onSaved }) {
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [ficha, setFicha] = useState(EMPTY_FICHA);
  const [categorias, setCategorias] = useState([]);
  const [colores, setColores] = useState([]);
  // COMENTADO (temporal — solo se usaba para el stock por sucursal):
  // const [sucursales, setSucursales] = useState([]);
  const [productoColores, setProductoColores] = useState([]);
  const [imagenes, setImagenes] = useState([]);
  const [idealPara, setIdealPara] = useState('');
  const [infoAdicionalData, setInfoAdicionalData] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!productoId);
  const [uploading, setUploading] = useState(false);
  const [exploradorAbierto, setExploradorAbierto] = useState(false);
  const [exploradorIndice, setExploradorIndice] = useState(null);
  // 'publicar' | 'programar' | 'borrador' | null — qué acción se está por confirmar.
  const [confirmGuardado, setConfirmGuardado] = useState(null);

  const { accessToken } = useAuth();
  const isEdit = !!productoId;

  useEffect(() => {
    async function init() {
      const [catRes, colRes] = await Promise.all([
        supabase.from('categorias').select('*').order('id'),
        supabase.from('colores').select('*').order('nombre'),
      ]);
      setCategorias(catRes.data || []);
      setColores(colRes.data || []);
      // COMENTADO (temporal — sucursales solo para el stock por números):
      // const [catRes, colRes, sucRes] = await Promise.all([
      //   supabase.from('categorias').select('*').order('id'),
      //   supabase.from('colores').select('*').order('nombre'),
      //   supabase.from('tiendas').select('*').order('tipo').order('nombre'),
      // ]);
      // setSucursales(sucRes.data || []);

      if (productoId) {
        const id = productoId;

        const { data: prod } = await supabase
          .from('productos')
          .select('*')
          .eq('id', id)
          .single();

        if (prod) {
          setForm({
            nombre: prod.nombre || '',
            slug: prod.slug || '',
            descripcion: prod.descripcion || '',
            precio_original: prod.precio_original || '',
            precio_actual: prod.precio_actual || '',
            destacado: prod.destacado || false,
            disponible: prod.disponible !== false,
            video_id: prod.video_id || '',
            categoria_id: prod.categoria_id || '',
            activo: prod.activo !== false,
            publicar_en: isoADatetimeLocal(prod.publicar_en),
          });
        }

        const { data: ft } = await supabase
          .from('ficha_tecnica')
          .select('*')
          .eq('producto_id', id)
          .single();

        if (ft) {
          setFicha({
            potencia_motor: ft.potencia_motor || '',
            tipo_bateria: ft.tipo_bateria || '',
            autonomia_km: ft.autonomia_km || '',
            velocidad_max_kmh: ft.velocidad_max_kmh || '',
            tiempo_carga_min: ft.tiempo_carga_min || '',
            capacidad_bateria: ft.capacidad_bateria || '',
            vida_util_bateria: ft.vida_util_bateria || '',
            bateria_extraible: ft.bateria_extraible || false,
            requiere_placa_soat: ft.requiere_placa_soat ?? null,
            tipo_toma_corriente: ft.tipo_toma_corriente || '',
            torque_maximo: ft.torque_maximo || '',
potencia_bateria: ft.potencia_bateria || '',
            carga_maxima_kg: ft.carga_maxima_kg || '',
            largo_cm: ft.largo_cm || '',
            ancho_cm: ft.ancho_cm || '',
            alto_cm: ft.alto_cm || '',
          });
        }

        const { data: pcr } = await supabase
          .from('prod_color_rel')
          .select('*, color:colores(*)')
          .eq('producto_id', id);

        setProductoColores((pcr || []).map((r) => ({
          color_id: r.color_id,
          nombre: r.color?.nombre || '',
          visible: r.visible !== false,
          stock: r.stock ?? 0,
          porUbicacion: {},
        })));

        const { data: ia } = await supabase
          .from('info_adicional')
          .select('data')
          .eq('producto_id', id)
          .single();

        if (ia?.data) {
          setInfoAdicionalData(ia.data);
          const ideal = ia.data.ideal_para;
          if (Array.isArray(ideal)) setIdealPara(ideal.join(', '));
          else if (typeof ideal === 'string') setIdealPara(ideal);
        }

        // COMENTADO (temporal — carga de stock por sucursal):
        // const { data: pcs } = await supabase
        //   .from('prod_color_stock')
        //   .select('*')
        //   .eq('producto_id', id);
        //
        // if (pcs?.length) {
        //   setProductoColores((prev) => prev.map((cr) => {
        //     const ubicaciones = {};
        //     for (const s of pcs.filter((r) => r.color_id === cr.color_id)) {
        //       ubicaciones[s.tienda_id] = s.stock;
        //     }
        //     return { ...cr, porUbicacion: ubicaciones };
        //   }));
        // }

        const { data: imgs } = await supabase
          .from('imagenes')
          .select('*')
          .eq('producto_id', id)
          .order('orden');

        setImagenes((imgs || []).map((img) => ({
          id: img.id,
          url: img.url,
          color: img.color || '',
          es_principal: img.es_principal,
          orden: img.orden,
        })));
      }
      setLoading(false);
    }
    init();
  }, [productoId]);

  /**
   * Valida el formulario antes de guardar. Devuelve true si todo está bien
   * (los avisos al usuario se hacen aquí).
   */
  const validarFormulario = () => {
    if (!form.nombre || !form.precio_actual) {
      alert('Nombre y precio son obligatorios');
      return false;
    }

    const opcionesColor = productoColores.filter((cr) => cr.nombre).map((cr) => cr.nombre);
    const imgSinColor = imagenes.some((img) => img.url && !img.color);
    const imgColorNoRegistrado = imagenes.some(
      (img) => img.url && img.color && !opcionesColor.includes(img.color),
    );
    if (imgSinColor) {
      alert('Todas las imágenes deben tener un color asignado (no existe "General / Sin color").');
      return false;
    }
    if (imgColorNoRegistrado) {
      alert('Hay imágenes con un color que no está registrado en la sección Colores. Regístralo o reasigna la imagen.');
      return false;
    }
    if (imagenes.some((img) => img.url) && !opcionesColor.length) {
      alert('El producto tiene imágenes pero ningún color registrado. Agrega los colores en la sección Colores.');
      return false;
    }

    const conStockInvalido = productoColores.find((cr) => cr.color_id && stockEsInvalido(cr.stock));
    if (conStockInvalido) {
      alert(
        `Unidades inválidas en el color "${conStockInvalido.nombre || '(sin nombre)'}": ` +
          'escribe un número entero igual o mayor a 0.',
      );
      return false;
    }
    return true;
  };

  /**
   * Botones de guardado: valida y abre el modal de confirmación.
   * @param {'publicar'|'programar'|'borrador'} accion
   */
  const handleSave = (accion) => {
    if (!validarFormulario()) return;
    if (accion === 'programar' && !esFuturo(form.publicar_en)) {
      alert('Elige una fecha y hora futuras para programar la publicación.');
      return;
    }
    setConfirmGuardado(accion);
  };

  /** Confirmación del modal: aquí sí se escribe en la base de datos. */
  const confirmarGuardado = async () => {
    const accion = confirmGuardado;
    setConfirmGuardado(null);
    setSaving(true);

    // publicar → activo y sin agenda; programar → borrador con fecha futura;
    // borrador → sin activo y sin agenda (la agenda se limpia).
    const activo = accion === 'publicar';
    const publicarEnIso = accion === 'programar'
      ? datetimeLocalAIso(form.publicar_en)
      : null;

    const fallo = await guardarProductoCompleto({
      form: { ...form, activo, publicar_en: publicarEnIso },
      isEdit,
      productoId,
      ficha,
      idealPara,
      infoAdicionalData,
      productoColores,
      imagenes,
    });

    if (fallo) {
      alert(`No se pudo guardar (${fallo.paso}): ${fallo.error.message}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    clearCache();
    onSaved();
  };

  const handleNameChange = (val) => {
    setForm((f) => ({
      ...f,
      nombre: val,
      slug: isEdit ? f.slug : slugify(val),
    }));
  };

  const addColor = () => {
    setProductoColores((prev) => [...prev, { color_id: '', nombre: '', visible: true, stock: 0, porUbicacion: {} }]);
  };

  const updateColorRel = (index, field, value) => {
    if (field === 'color_id') {
      const viejo = productoColores[index]?.nombre;
      const found = colores.find((c) => c.id === Number(value));
      const nuevo = found?.nombre || '';
      setProductoColores((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], color_id: value, nombre: nuevo };
        return next;
      });
      // Reasignar las imágenes que usaban el color anterior
      if (viejo && viejo !== nuevo) {
        setImagenes((prev) => prev.map((img) => (img.color === viejo ? { ...img, color: nuevo } : img)));
      }
      return;
    }
    setProductoColores((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const toggleColorVisible = (index) => {
    setProductoColores((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], visible: !(next[index].visible !== false) };
      return next;
    });
  };

  const removeColor = (index) => {
    const nombre = productoColores[index]?.nombre;
    if (nombre && imagenes.some((img) => img.url && img.color === nombre)) {
      alert(`Hay imágenes asignadas al color "${nombre}". Reasígnalas u oculta el color con el icono de ojo en vez de eliminarlo.`);
      return;
    }
    setProductoColores((prev) => prev.filter((_, i) => i !== index));
  };

  // COMENTADO (temporal — helpers del stock por sucursal):
  // const updateUbicacion = (index, tiendaId, value) => {
  //   setProductoColores((prev) => {
  //     const next = [...prev];
  //     next[index] = {
  //       ...next[index],
  //       porUbicacion: { ...next[index].porUbicacion, [tiendaId]: value },
  //     };
  //     return next;
  //   });
  // };
  //
  // const colorTotal = (cr) =>
  //   Object.values(cr.porUbicacion || {}).reduce(
  //     (acc, v) => acc + (Math.max(0, Number(v)) || 0),
  //     0,
  //   );
  //
  // const shortName = (nombre) =>
  //   (nombre || '')
  //     .replace(/^GreenLine\s*/i, '')
  //     .replace(/^Tienda\s*/i, '')
  //     .trim();

  /** Unidades (stock numérico) de un color: un solo número por producto×color. */
  const updateStock = (index, value) => {
    setProductoColores((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], stock: value };
      return next;
    });
  };

  const stockDe = (cr) => stockEntero(cr.stock);

  const stockTotal = productoColores.reduce((acc, cr) => acc + stockDe(cr), 0);

  const addImage = () => {
    setImagenes((prev) => [...prev, { id: null, url: '', color: '', es_principal: prev.length === 0, orden: prev.length }]);
  };

  const updateImage = (index, field, value) => {
    setImagenes((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeImage = (index) => {
    setImagenes((prev) => prev.filter((_, i) => i !== index));
  };

  const moveImage = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= imagenes.length) return;
    setImagenes((prev) => {
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const handleFileUpload = async (index, file) => {
    if (!file) return;
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `productos/${form.slug || 'temp'}/${Date.now()}-${index}.${ext}`;

    const { error } = await supabase.storage
      .from('Greenline_database')
      .upload(path, file, { contentType: file.type });

    if (error) {
      alert('Error subiendo imagen: ' + error.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('Greenline_database')
      .getPublicUrl(path);

    updateImage(index, 'url', urlData.publicUrl);
    setUploading(false);
  };

  const getColorOptions = () =>
    productoColores.filter((cr) => cr.nombre).map((cr) => cr.nombre);

  const abrirExplorador = (index) => {
    setExploradorIndice(index);
    setExploradorAbierto(true);
  };

  const extraerRutaLocal = (url) => {
    if (!url || typeof url !== 'string') return null;
    const m = url.match(/\/assets\/imagenes\/(.+)$/);
    if (!m) return null;
    const parts = m[1].split('/');
    parts.pop();
    return parts.join('/');
  };

  const rutaProducto = (() => {
    const conteo = {};
    for (const img of imagenes) {
      const dir = extraerRutaLocal(img.url);
      if (dir) conteo[dir] = (conteo[dir] || 0) + 1;
    }
    const top = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
    if (top) return top[0];
    return form.slug ? `productos/${form.slug}` : 'productos';
  })();

  if (loading) return <div className="p-8 text-gray-400 text-sm">Cargando...</div>;

  const estado = estadoPublicacion({
    activo: form.activo !== false,
    publicarEn: form.publicar_en,
  });
  const publicado = estado === 'publicado';
  const programando = confirmGuardado === 'programar'
    || (estado === 'programado' && esFuturo(form.publicar_en));

  // Textos del modal de confirmación según la acción y el estado actual.
  const tituloConfirmacion =
    confirmGuardado === 'publicar'
      ? (isEdit ? 'Publicar producto' : 'Publicar y guardar')
      : confirmGuardado === 'programar'
        ? 'Programar publicación'
        : 'Guardar como borrador';

  const mensajeConfirmacion =
    confirmGuardado === 'publicar'
      ? (publicado
        ? 'Se guardarán los cambios y el producto seguirá visible en la tienda.'
        : 'Se guardará el producto y aparecerá en la tienda y en la web de inmediato.')
      : confirmGuardado === 'programar'
        ? `Se guardará el producto como borrador y se publicará solo el ${fechaAgendadaLegible(form.publicar_en)}.`
        : (publicado || programando
          ? 'El producto dejará de aparecer en la tienda hasta que lo publiques de nuevo.'
          : 'Se guardará el producto como borrador: no aparecerá en la tienda hasta que lo publiques.');

  const etiquetaConfirmacion =
    confirmGuardado === 'publicar' ? 'Publicar'
      : confirmGuardado === 'programar' ? 'Programar'
        : 'Guardar borrador';

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {isEdit ? 'Editar Producto' : 'Nuevo Producto'}
              </h1>
              {isEdit && (
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    estado === 'publicado'
                      ? 'bg-green-100 text-green-700'
                      : estado === 'programado'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {estado === 'publicado' ? 'Publicado' : estado === 'programado' ? 'Programado' : 'Borrador'}
                </span>
              )}
              {estado === 'programado' && esFuturo(form.publicar_en) && (
                <span className="text-xs text-blue-600">
                  Se publica el {fechaAgendadaLegible(form.publicar_en)}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEdit ? `ID: ${productoId}` : 'Completa los datos del producto'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSave('borrador')}
            disabled={saving}
            title="Guarda el producto sin publicarlo en la tienda"
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            Guardar como borrador
          </button>
          {esFuturo(form.publicar_en) && (
            <button
              onClick={() => handleSave('programar')}
              disabled={saving}
              title="Guarda el borrador y lo publica en la fecha elegida"
              className="flex items-center gap-2 px-4 py-2.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              <Calendar className="w-4 h-4" />
              Programar
            </button>
          )}
          <button
            onClick={() => handleSave('publicar')}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar y publicar'}
          </button>
        </div>
      </div>

      {/* Sección: Datos generales */}
      <Section title="Datos Generales">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nombre *" full>
            <input value={form.nombre} onChange={(e) => handleNameChange(e.target.value)} className="input" />
          </Field>
          <Field label="Slug (URL)">
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="input" />
          </Field>
          <Field label="Categoría">
            <select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} className="input">
              <option value="">Seleccionar...</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
          <Field label="Precio Original (S/)">
            <input type="number" step="0.01" value={form.precio_original} onChange={(e) => setForm({ ...form, precio_original: e.target.value })} className="input" />
          </Field>
          <Field label="Precio Actual (S/) *">
            <input type="number" step="0.01" value={form.precio_actual} onChange={(e) => setForm({ ...form, precio_actual: e.target.value })} className="input" />
          </Field>
          <Field label="Video (YouTube)">
            <input value={form.video_id} onChange={(e) => setForm({ ...form, video_id: e.target.value })} className="input" placeholder="Pega el enlace: https://youtu.be/Zxkomo2Ccs0" />
            <p className="text-xs text-gray-400 mt-1">Acepta enlace completo o solo el ID. La miniatura aparece automáticamente.</p>
          </Field>
          <Field label="Programar publicación (opcional)" full>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="datetime-local"
                value={form.publicar_en || ''}
                onChange={(e) => setForm({ ...form, publicar_en: e.target.value })}
                className="input max-w-xs"
              />
              {form.publicar_en && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, publicar_en: '' })}
                  className="text-xs text-gray-500 hover:text-red-600 underline"
                >
                  Quitar agenda
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Si eliges una fecha futura, usa el botón «Programar»: el producto permanecerá oculto
              hasta ese momento y se publicará solo. Con «Guardar y publicar» se publica de inmediato
              y se limpia la agenda.
            </p>
          </Field>
          <Field label="Descripción" full>
            <textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="input" placeholder="Descripción del producto..." />
          </Field>
          <Field label="Ideal para (tipo de persona, separado por comas)" full>
            <input value={idealPara} onChange={(e) => setIdealPara(e.target.value)} className="input" placeholder="Estudiantes, Comerciantes, Delivery..." />
          </Field>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="destacado"
              checked={form.destacado}
              onChange={(e) => setForm({ ...form, destacado: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <label htmlFor="destacado" className="text-sm text-gray-700">Producto destacado</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="disponible"
              checked={form.disponible}
              onChange={(e) => setForm({ ...form, disponible: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <label htmlFor="disponible" className="text-sm text-gray-700">Disponible (En stock)</label>
          </div>
        </div>
      </Section>

      {/* Sección: Ficha Técnica */}
      <Section title="Ficha Técnica">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Potencia Motor">
            <input value={ficha.potencia_motor} onChange={(e) => setFicha({ ...ficha, potencia_motor: e.target.value })} className="input" placeholder="1500W" />
          </Field>
          <Field label="Tipo Batería">
            <input value={ficha.tipo_bateria} onChange={(e) => setFicha({ ...ficha, tipo_bateria: e.target.value })} className="input" placeholder="Litio" />
          </Field>
          <Field label="Capacidad Batería">
            <input value={ficha.capacidad_bateria} onChange={(e) => setFicha({ ...ficha, capacidad_bateria: e.target.value })} className="input" placeholder="60V 20Ah" />
          </Field>
          <Field label="Autonomía (km)">
            <input
              type="text"
              inputMode="text"
              value={ficha.autonomia_km}
              onChange={(e) => setFicha({ ...ficha, autonomia_km: e.target.value })}
              className="input"
              placeholder="40-50"
            />
          </Field>
          <Field label="Velocidad Máx. (km/h)">
            <input type="number" value={ficha.velocidad_max_kmh} onChange={(e) => setFicha({ ...ficha, velocidad_max_kmh: e.target.value })} className="input" />
          </Field>
          <Field label="Tiempo Carga (min)">
            <input type="number" value={ficha.tiempo_carga_min} onChange={(e) => setFicha({ ...ficha, tiempo_carga_min: e.target.value })} className="input" />
          </Field>
          <Field label="Torque Máximo">
            <input value={ficha.torque_maximo} onChange={(e) => setFicha({ ...ficha, torque_maximo: e.target.value })} className="input" />
          </Field>
          <Field label="Potencia Batería">
            <input value={ficha.potencia_bateria} onChange={(e) => setFicha({ ...ficha, potencia_bateria: e.target.value })} className="input" />
          </Field>
          <Field label="Vida Útil Batería">
            <input value={ficha.vida_util_bateria} onChange={(e) => setFicha({ ...ficha, vida_util_bateria: e.target.value })} className="input" />
          </Field>
          <Field label="Tipo Toma Corriente">
            <input value={ficha.tipo_toma_corriente} onChange={(e) => setFicha({ ...ficha, tipo_toma_corriente: e.target.value })} className="input" />
          </Field>
          <Field label="Carga Máx. (kg)">
            <input type="number" value={ficha.carga_maxima_kg} onChange={(e) => setFicha({ ...ficha, carga_maxima_kg: e.target.value })} className="input" />
          </Field>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bateria_extraible"
              checked={ficha.bateria_extraible}
              onChange={(e) => setFicha({ ...ficha, bateria_extraible: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <label htmlFor="bateria_extraible" className="text-sm text-gray-700">Batería extraíble</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requiere_placa_soat"
              checked={ficha.requiere_placa_soat === true}
              onChange={(e) => setFicha({ ...ficha, requiere_placa_soat: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <label htmlFor="requiere_placa_soat" className="text-sm text-gray-700">Requiere placa / SOAT</label>
          </div>
        </div>
      </Section>

      {/* Sección: Dimensiones */}
      <Section title="Dimensiones">
        <p className="text-xs text-gray-400 mb-3">Vehículo (largo × ancho × alto en cm)</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Field label="Largo (cm)"><input type="number" value={ficha.largo_cm} onChange={(e) => setFicha({ ...ficha, largo_cm: e.target.value })} className="input" /></Field>
          <Field label="Ancho (cm)"><input type="number" value={ficha.ancho_cm} onChange={(e) => setFicha({ ...ficha, ancho_cm: e.target.value })} className="input" /></Field>
          <Field label="Alto (cm)"><input type="number" value={ficha.alto_cm} onChange={(e) => setFicha({ ...ficha, alto_cm: e.target.value })} className="input" /></Field>
        </div>
        </Section>

      {/* Sección: Colores y stock */}
      {/* Stock NUMÉRICO por producto×color activo (`prod_color_rel.stock`).
          El stock por sucursal (`prod_color_stock`) sigue comentado. */}
      <Section title="Colores y stock">
        <div className="space-y-3">
          {productoColores.map((cr, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                <select
                  value={cr.color_id}
                  onChange={(e) => updateColorRel(i, 'color_id', e.target.value)}
                  className="input flex-1"
                >
                  <option value="">Seleccionar color...</option>
                  {colores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {/* COMENTADO (temporal): <span>Total: {colorTotal(cr)}</span> */}
                <button
                  type="button"
                  onClick={() => toggleColorVisible(i)}
                  disabled={!cr.nombre}
                  title={cr.visible !== false ? 'Ocultar color (sus imágenes se ocultan en la web)' : 'Mostrar color'}
                  className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    cr.visible !== false
                      ? 'text-brand hover:bg-brand/10'
                      : 'text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  {cr.visible !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => removeColor(i)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {cr.visible === false && (
                <p className="text-xs text-amber-600 mt-1.5 pl-7">
                  Color oculto: sus imágenes no se muestran en la web (siguen guardadas).
                </p>
              )}
              <div className="flex items-center gap-2 pl-7 mt-2 flex-wrap">
                <label htmlFor={`stock-color-${i}`} className="text-xs text-gray-500">
                  Unidades
                </label>
                <input
                  id={`stock-color-${i}`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  disabled={!cr.color_id}
                  value={cr.stock ?? ''}
                  onChange={(e) => updateStock(i, e.target.value)}
                  className="input text-xs w-28 disabled:opacity-40"
                  placeholder="0"
                />
                <span className="text-[11px] text-gray-400">
                  Unidades de este color en almacén (modelo × color).
                </span>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addColor} className="mt-3 text-sm text-brand font-semibold hover:underline">
          + Agregar color
        </button>
        {productoColores.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Stock total:{' '}
            <span className="font-semibold text-gray-900">{stockTotal}</span> unidad(es)
          </p>
        )}
      </Section>

      {/* Sección: Imágenes */}
      <Section title="Imágenes">
        <div className="space-y-3">
          {imagenes.map((img, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex flex-col items-center gap-0.5 mt-2">
                <button
                  type="button"
                  onClick={() => moveImage(i, -1)}
                  disabled={i === 0}
                  className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Subir imagen"
                >
                  <ArrowUp className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(i, 1)}
                  disabled={i === imagenes.length - 1}
                  className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Bajar imagen"
                >
                  <ArrowDown className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              <GripVertical className="w-4 h-4 text-gray-300 mt-2" />
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">URL</label>
                  <input
                    value={img.url}
                    onChange={(e) => updateImage(i, 'url', e.target.value)}
                    className="input text-xs"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Color *</label>
                  <select
                    value={img.color}
                    onChange={(e) => updateImage(i, 'color', e.target.value)}
                    className={`input text-xs ${img.url && !img.color ? 'border-red-400' : ''}`}
                  >
                    <option value="">Seleccionar color...</option>
                    {getColorOptions().map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {img.url && !getColorOptions().includes(img.color) && (
                    <p className="text-[11px] text-red-500 mt-1">
                      Registra primero el color en la sección Colores.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => abrirExplorador(i)}
                  className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <FolderOpen className="w-3 h-3 inline mr-1" />
                  Explorar
                </button>
                <label className="cursor-pointer px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                  <Upload className="w-3 h-3 inline mr-1" />
                  Subir
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(i, e.target.files?.[0])}
                  />
                </label>
              </div>
              {img.url && (
                <img src={versionarImagen(img.url)} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
              )}
              <button onClick={() => removeImage(i)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors mt-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addImage} className="mt-3 text-sm text-brand font-semibold hover:underline">
          + Agregar imagen
        </button>
        {uploading && <p className="text-xs text-brand mt-2">Subiendo imagen...</p>}
      </Section>

      {/* Save buttons bottom */}
      <div className="flex justify-end gap-3 mt-8 pb-8">
        <button
          onClick={() => handleSave('borrador')}
          disabled={saving}
          title="Guarda el producto sin publicarlo en la tienda"
          className="flex items-center gap-2 px-5 py-3 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          Guardar como borrador
        </button>
        {esFuturo(form.publicar_en) && (
          <button
            onClick={() => handleSave('programar')}
            disabled={saving}
            title="Guarda el borrador y lo publica en la fecha elegida"
            className="flex items-center gap-2 px-5 py-3 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <Calendar className="w-4 h-4" />
            Programar publicación
          </button>
        )}
        <button
          onClick={() => handleSave('publicar')}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar y publicar'}
        </button>
      </div>
      <ConfirmModal
        open={confirmGuardado !== null}
        title={tituloConfirmacion}
        message={mensajeConfirmacion}
        confirmLabel={etiquetaConfirmacion}
        onConfirm={confirmarGuardado}
        onCancel={() => setConfirmGuardado(null)}
      />
      {exploradorAbierto && (
        <ExploradorImagenes
          rutaInicial={rutaProducto}
          accessToken={accessToken}
          onSelect={(url) => updateImage(exploradorIndice, 'url', url)}
          onClose={() => setExploradorAbierto(false)}
        />
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? 'md:col-span-2 lg:col-span-3' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ExploradorImagenes({ rutaInicial = '', accessToken, onSelect, onClose }) {
  const [ruta, setRuta] = useState(rutaInicial);
  const [carpetas, setCarpetas] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    let activo = true;
    setLoading(true);
    setError('');
    imagenesAPI.listar(ruta, accessToken)
      .then((res) => {
        if (!activo) return;
        setCarpetas(res.carpetas || []);
        setArchivos(res.archivos || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!activo) return;
        setCarpetas([]);
        setArchivos([]);
        setError(err.error || err.message || 'No se pudo listar esta carpeta');
        setLoading(false);
      });
    return () => { activo = false; };
  }, [ruta, accessToken]);

  const partesRuta = ruta ? ruta.split('/').filter(Boolean) : [];
  const archivosFiltrados = archivos.filter((a) =>
    !filtro || a.nombre.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <FolderOpen className="w-5 h-5 text-brand shrink-0" />
            <h3 className="font-bold text-gray-900 text-sm">Explorador de imágenes</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs">
          <button
            onClick={() => setRuta('')}
            className="text-brand font-semibold hover:underline shrink-0"
          >
            Inicio
          </button>
          {partesRuta.map((p, idx) => (
            <span key={idx} className="flex items-center gap-2 shrink-0">
              <span className="text-gray-300">/</span>
              <button
                onClick={() => setRuta(partesRuta.slice(0, idx + 1).join('/'))}
                className="text-brand font-semibold hover:underline"
              >
                {p}
              </button>
            </span>
          ))}
          <div className="flex-1" />
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white w-48 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-600 mb-2">{error}</p>
              <button onClick={onClose} className="text-sm text-brand font-semibold hover:underline">
                Cerrar
              </button>
            </div>
          ) : carpetas.length === 0 && archivos.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-12">Carpeta vacía</p>
          ) : (
            <>
              {carpetas.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Carpetas</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {carpetas.map((carp) => (
                      <button
                        key={carp}
                        onClick={() => setRuta((prev) => `${prev ? `${prev}/` : ''}${carp}`)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-brand/30 hover:bg-brand/5 text-left text-sm transition-colors"
                      >
                        <FolderOpen className="w-4 h-4 text-brand shrink-0" />
                        <span className="truncate text-gray-700">{carp}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {archivosFiltrados.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Imágenes ({archivosFiltrados.length})
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {archivosFiltrados.map((archivo) => (
                      <button
                        key={archivo.nombre}
                        onClick={() => { onSelect(archivo.url); onClose(); }}
                        className="group relative rounded-lg border border-gray-100 overflow-hidden hover:ring-2 hover:ring-brand/50 transition-all"
                      >
                        <img
                          src={versionarImagen(archivo.url)}
                          alt={archivo.nombre}
                          className="w-full aspect-square object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-[10px] truncate">{archivo.nombre}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(carpetas.length === 0 && archivosFiltrados.length === 0 && archivos.length > 0) && (
                <p className="text-center text-gray-400 text-sm py-12">No se encontraron imágenes</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
