import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { versionarImagen } from '../../lib/images';
import stripHtml from '../../utils/stripHtml';
import { subirImagenBlog } from '../../lib/blogUpload';
import BlogBlocksEditor from './blog/BlogBlocksEditor';
import VistaPreviaModal from './blog/VistaPreviaModal';
import {
  Plus, Pencil, Trash2, ArrowLeft, Save, Upload, FileText,
  Eye, EyeOff, GripVertical, X, AlertTriangle, Image as ImageIcon,
} from '../../lib/icons';

const EMPTY = {
  title: '',
  slug: '',
  category_id: '',
  excerpt: '',
  content_html: '',
  image_url: '',
  image_alt: '',
  published_at: '',
  featured: false,
  active: true,
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function htmlToBlocks(html) {
  if (!html) return [];
  try {
    const parsed = JSON.parse(html);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  const blocks = [];
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  let currentText = '';
  const flushText = () => {
    if (currentText.trim()) {
      blocks.push({ id: newId(), type: 'text', content: currentText });
      currentText = '';
    }
  };
  function newId() { return `block_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
  const parseDataImages = (el) => {
    try {
      const raw = JSON.parse(el.getAttribute('data-images') || '[]');
      if (Array.isArray(raw)) {
        return raw.map((img) => (typeof img === 'string' ? img : img?.src)).filter(Boolean);
      }
    } catch {}
    return Array.from(el.querySelectorAll('img')).map((img) => img.getAttribute('src')).filter(Boolean);
  };

  const convertirColumnas = (el) => {
    const cols = Array.from(el.querySelectorAll(':scope > div')).map((col) => ({ content: col.innerHTML }));
    if (cols.length) return { flush: true, block: { id: newId(), type: 'columns', cols: cols.length, blocks: cols } };
    return null;
  };

  const convertirCarrusel = (el) => {
    const imgs = parseDataImages(el);
    if (imgs.length) return { flush: true, block: { id: newId(), type: 'carrusel', images: imgs } };
    return null;
  };

  const convertir = (el) => {
    const tag = el.tagName.toLowerCase();
    if (['h2', 'h3', 'h4'].includes(tag)) {
      return { flush: true, block: { id: newId(), type: 'heading', content: el.innerHTML, level: Number(tag[1]) } };
    }
    if (tag === 'p') return { text: `<p>${el.innerHTML}</p>` };
    if (tag === 'img') {
      return { flush: true, block: { id: newId(), type: 'image', src: el.getAttribute('src'), alt: el.alt || '', caption: '' } };
    }
    if (tag === 'table') {
      const headers = Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent);
      const rows = Array.from(el.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent));
      return { flush: true, block: { id: newId(), type: 'table', headers: headers.length ? headers : ['Col 1', 'Col 2'], rows: rows.length ? rows : [['', '']] } };
    }
    if (tag === 'blockquote') {
      const author = el.querySelector('footer')?.textContent || '—';
      return { flush: true, block: { id: newId(), type: 'quote', content: el.textContent.replace(author, '').trim(), author } };
    }
    if (tag === 'hr') return { flush: true, block: { id: newId(), type: 'separator' } };
    if (el.dataset.columnLayout || el.classList.contains('columns-container')) {
      return convertirColumnas(el);
    }
    if (el.dataset.carrusel || el.classList.contains('carrusel')) {
      return convertirCarrusel(el);
    }
    return { text: el.outerHTML };
  };

  wrapper.querySelectorAll('h2,h3,h4,p,img,table,blockquote,hr,div[data-column-layout],div[data-carrusel],div.columns-container,div.carrusel').forEach((el) => {
    const r = convertir(el);
    if (!r) return;
    if (r.flush) flushText();
    if (r.block) blocks.push(r.block);
    else currentText += r.text;
  });
  flushText();
  return blocks;
}

function blocksToHtml(blocks) {
  if (typeof blocks === 'string') {
    try {
      const parsed = JSON.parse(blocks);
      blocks = Array.isArray(parsed) ? parsed : [];
    } catch {
      return blocks;
    }
  }
  if (!Array.isArray(blocks)) return '';
  return blocks.map((b) => {
    switch (b.type) {
      case 'heading':
        return `<h${b.level || 2}>${b.content || ''}</h${b.level || 2}>`;
      case 'text':
        return b.content || '<p></p>';
      case 'image':
        return `<figure><img src="${b.src || ''}" alt="${b.alt || ''}" />${b.caption ? `<figcaption>${b.caption}</figcaption>` : ''}</figure>`;
      case 'columns': {
        const n = b.cols === 3 ? 3 : 2;
        return `<div data-column-layout data-columns="${n}" style="display:grid;grid-template-columns:repeat(${n},1fr);gap:1.5rem">${(b.blocks || []).map((c) => `<div data-column>${c.content || '<p></p>'}</div>`).join('')}</div>`;
      }
      case 'table':
        return `<table class="w-full text-sm border-collapse border border-gray-200 rounded-lg overflow-hidden"><thead><tr class="bg-gray-50">${(b.headers || []).map((h) => `<th class="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">${h}</th>`).join('')}</tr></thead><tbody>${(b.rows || []).map((row) => `<tr class="hover:bg-gray-50">${row.map((cell) => `<td class="px-3 py-2 border-b border-gray-100">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      case 'quote':
        return `<blockquote class="border-l-4 border-brand bg-brand/5 px-4 py-3 text-gray-700 italic">${b.content || ''} ${b.author ? `<footer class="text-xs text-gray-500 mt-1">${b.author}</footer>` : ''}</blockquote>`;
      case 'separator':
        return '<hr class="border-gray-200 my-4" />';
      case 'carrusel':
        return `<div data-carrusel data-images='${JSON.stringify(b.images || []).replace(/'/g, '&#39;')}'></div>`;
      default:
        return '';
    }
  }).join('\n');
}

function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel, danger }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
              <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-600' : 'text-amber-600'}`} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          </div>
          <p className="text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-dark'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function GalleryManager({ slug, _postId, images, onImagesChange, uploadingGallery, setUploadingGallery }) {
  const handleUploadGallery = async (files) => {
    if (!files || !files.length) return;
    setUploadingGallery(true);
    const newImages = [];

    for (const file of files) {
      try {
        const url = await subirImagenBlog(file, slug);
        newImages.push({ image_url: url, image_alt: '', sort_order: images.length + newImages.length });
      } catch (err) {
        alert('Error subiendo imagen: ' + err.message);
      }
    }
    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
    setUploadingGallery(false);
  };

  const removeImage = (idx) => {
    onImagesChange(images.filter((_, i) => i !== idx));
  };

  const updateAlt = (idx, alt) => {
    const updated = [...images];
    updated[idx] = { ...updated[idx], image_alt: alt };
    onImagesChange(updated);
  };

  const moveImage = (from, to) => {
    if (to < 0 || to >= images.length) return;
    const updated = [...images];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    onImagesChange(updated.map((img, i) => ({ ...img, sort_order: i })));
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <ImageIcon className="w-4 h-4" />
          Agregar imágenes
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleUploadGallery(e.target.files)}
          />
        </label>
        {uploadingGallery && <p className="text-xs text-brand">Subiendo...</p>}
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, idx) => (
            <div key={idx} className="relative group border border-gray-200 rounded-lg overflow-hidden">
              <img src={versionarImagen(img.image_url)} alt={img.image_alt || ''} className="w-full h-28 object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx - 1)}
                  className="p-1 bg-white/90 rounded text-gray-700 hover:bg-white text-xs"
                  title="Mover izquierda"
                >
                  <GripVertical className="w-3 h-3 rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx + 1)}
                  className="p-1 bg-white/90 rounded text-gray-700 hover:bg-white text-xs"
                  title="Mover derecha"
                >
                  <GripVertical className="w-3 h-3 -rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="p-1 bg-red-500/90 rounded text-white hover:bg-red-600 text-xs"
                  title="Eliminar"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <input
                value={img.image_alt || ''}
                onChange={(e) => updateAlt(idx, e.target.value)}
                className="w-full text-xs px-2 py-1 border-t border-gray-100 focus:outline-none"
                placeholder="Texto alternativo"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBlog() {
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [vistaPreviaOpen, setVistaPreviaOpen] = useState(false);

  const categoryById = useMemo(() => {
    const map = {};
    for (const cat of categories) map[cat.id] = cat;
    return map;
  }, [categories]);

  useEffect(() => {
    loadMeta();
    loadPosts();
  }, []);

  async function loadMeta() {
    const { data } = await supabase
      .from('greenline_categories')
      .select('*')
      .order('sort_order')
      .order('name');
    setCategories(data || []);
  }

  async function loadPosts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('greenline_posts')
      .select('*')
      .order('published_at', { ascending: false });
    if (error) {
      alert('Error cargando artículos: ' + error.message);
      setPosts([]);
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  }

  async function loadGallery(postId) {
    if (!postId) { setGalleryImages([]); return; }
    const { data } = await supabase
      .from('greenline_post_images')
      .select('*')
      .eq('post_id', postId)
      .order('sort_order');
    setGalleryImages(data || []);
  }

  const startNew = () => {
    setEditingId(null);
    setGalleryImages([]);
    setForm({
      ...EMPTY,
      category_id: categories[0]?.id || '',
      published_at: new Date().toISOString().slice(0, 10),
      title: '',
      slug: '',
      content_html: JSON.stringify([]),
    });
  };

  const startEdit = (post) => {
    setEditingId(post.id);
    setForm({
      title: post.title || '',
      slug: post.slug || '',
      category_id: post.category_id || '',
      excerpt: post.excerpt || '',
      content_html: JSON.stringify(htmlToBlocks(post.content_html || '')),
      image_url: post.image_url || '',
      image_alt: post.image_alt || '',
      published_at: (post.published_at || '').slice(0, 10),
      featured: post.featured,
      active: post.active,
    });
    loadGallery(post.id);
  };

  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY);
    setGalleryImages([]);
  };

  const onTitleChange = (val) => {
    setForm((f) => ({
      ...f,
      title: val,
      slug: editingId ? f.slug : slugify(val),
    }));
  };

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const crearCategoria = async () => {
    const name = prompt('Nombre de la nueva categoría:');
    if (!name?.trim()) return;
    const sort = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order || 0)) + 1 : 0;
    const { data, error } = await supabase
      .from('greenline_categories')
      .insert({ name: name.trim(), slug: slugify(name.trim()), sort_order: sort })
      .select()
      .single();
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    setCategories((prev) => [...prev, data].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    setForm((f) => ({ ...f, category_id: data.id }));
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadBlogImage(file);
      if (url) setField('image_url', url);
    } finally {
      setUploading(false);
    }
  };

  const uploadBlogImage = async (file) => {
    if (!file) return null;
    try {
      return await subirImagenBlog(file, form.slug || slugify(form.title));
    } catch (err) {
      alert('Error subiendo imagen: ' + err.message);
      return null;
    }
  };

  const handleDelete = async (post) => {
    setConfirmAction({ type: 'delete', post });
    setConfirmOpen(true);
  };

  const executeDelete = async () => {
    const post = confirmAction.post;
    setConfirmOpen(false);
    const { error } = await supabase
      .from('greenline_post_images')
      .delete()
      .eq('post_id', post.id);
    if (error) {
      alert('Error limpiando imágenes del artículo: ' + error.message);
      return;
    }
    const { error: delErr } = await supabase
      .from('greenline_posts')
      .delete()
      .eq('id', post.id);
    if (delErr) {
      alert('Error eliminando artículo: ' + delErr.message);
      return;
    }
    loadPosts();
  };

  const requestSave = () => {
    const bloques = htmlToBlocks(form.content_html);
    if (!form.title.trim()) {
      alert('Título es obligatorio');
      return;
    }
    if (!form.category_id) {
      alert('Selecciona una categoría');
      return;
    }
    if (!bloques.length || !stripHtml(blocksToHtml(bloques)).trim()) {
      alert('Agrega al menos un bloque con contenido');
      return;
    }
    setConfirmAction({ type: 'save' });
    setConfirmOpen(true);
  };

  const executeSave = async () => {
    setConfirmOpen(false);
    setSaving(true);

    const contentHtml = blocksToHtml(form.content_html);
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      category_id: form.category_id,
      excerpt: form.excerpt || null,
      content_html: contentHtml,
      content_text: form.excerpt || stripHtml(contentHtml),
      image_url: form.image_url || null,
      image_alt: form.image_alt || null,
      published_at: form.published_at || new Date().toISOString().slice(0, 10),
      featured: form.featured,
      active: form.active !== false,
    };

    const { data: savedPost, error } = editingId
      ? await supabase.from('greenline_posts').update(payload).eq('id', editingId).select('id')
      : await supabase.from('greenline_posts').insert({
          ...payload,
          author: 'A. Yeren',
          sort_order: 0,
        }).select('id');

    if (error) {
      setSaving(false);
      alert('Error guardando artículo: ' + (error.message.includes('duplicate') ? 'Ya existe un artículo con ese slug' : error.message));
      return;
    }

    const postId = editingId || savedPost?.[0]?.id;
    if (postId) {
      const { error: galleryDelErr } = await supabase
        .from('greenline_post_images')
        .delete()
        .eq('post_id', postId);
      if (galleryDelErr) {
        setSaving(false);
        alert('Error limpiando imágenes del artículo: ' + galleryDelErr.message);
        return;
      }
      if (galleryImages.length > 0) {
        const inserts = galleryImages.map((img, i) => ({
          post_id: postId,
          image_url: img.image_url,
          image_alt: img.image_alt || null,
          sort_order: i,
        }));
        const { error: galleryInsErr } = await supabase
          .from('greenline_post_images')
          .insert(inserts);
        if (galleryInsErr) {
          setSaving(false);
          alert('Error guardando imágenes del artículo: ' + galleryInsErr.message);
          return;
        }
      }
    }

    setSaving(false);
    cancel();
    loadPosts();
  };

  const getConfirmTitle = () => {
    if (confirmAction?.type === 'delete') return 'Eliminar artículo';
    if (confirmAction?.type === 'save') {
      return form.active
        ? (editingId ? 'Actualizar y publicar' : 'Publicar artículo')
        : (editingId ? 'Actualizar borrador' : 'Guardar borrador');
    }
    return 'Confirmar';
  };

  const getConfirmMessage = () => {
    if (confirmAction?.type === 'delete') {
      return `¿Eliminar el artículo "${confirmAction.post.title}"? Se borrará definitivamente.`;
    }
    if (confirmAction?.type === 'save') {
      return form.active
        ? (editingId ? '¿Actualizar y publicar este artículo?' : '¿Publicar este artículo?')
        : (editingId ? '¿Actualizar este borrador?' : '¿Guardar este artículo como borrador?');
    }
    return '';
  };

  const getConfirmLabel = () => {
    if (confirmAction?.type === 'delete') return 'Eliminar';
    if (confirmAction?.type === 'save') {
      return form.active
        ? (editingId ? 'Actualizar y publicar' : 'Publicar')
        : (editingId ? 'Actualizar' : 'Guardar borrador');
    }
    return '';
  };

  const handleConfirm = () => {
    if (confirmAction?.type === 'delete') return executeDelete();
    if (confirmAction?.type === 'save') return executeSave();
  };

  if (!editingId && form === EMPTY) {
    return (
      <div className="p-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Blog</h1>
            <p className="text-sm text-gray-500 mt-1">Gestiona los artículos de Novedades</p>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo artículo
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay artículos.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Título</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-300 shrink-0" />
                        {post.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{categoryById[post.category_id]?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{post.published_at || '—'}</td>
                    <td className="px-4 py-3">
                      {post.active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-1">
                          <Eye className="w-3 h-3" /> Publicado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                          <EyeOff className="w-3 h-3" /> Borrador
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(post)}
                          className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(post)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmModal
          open={confirmOpen}
          title={getConfirmTitle()}
          message={getConfirmMessage()}
          confirmLabel={getConfirmLabel()}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
          danger={confirmAction?.type === 'delete'}
        />
      </div>
    );
  }

  if (!categories.length && loading) {
    return <div className="p-8 text-sm text-gray-400">Cargando...</div>;
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={cancel}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {editingId ? 'Editar artículo' : 'Nuevo artículo'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Publicado en la página de Novedades</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVistaPreviaOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-brand text-brand rounded-lg text-sm font-semibold hover:bg-brand/5 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Vista Previa
          </button>
          <button
            onClick={requestSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar Artículo'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Datos generales</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Título *">
            <input value={form.title} onChange={(e) => onTitleChange(e.target.value)} className="input" />
          </Field>
          <Field label="Slug (URL)">
            <input value={form.slug} readOnly className="input bg-gray-50 cursor-not-allowed" />
          </Field>
          <Field label="Categoría *">
            <div className="flex gap-2">
              <select value={form.category_id} onChange={(e) => setField('category_id', e.target.value)} className="input flex-1">
                <option value="">Seleccionar...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={crearCategoria}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
                title="Nueva categoría"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </Field>
          <Field label="Fecha de publicación">
            <input
              type="date"
              value={form.published_at}
              readOnly
              className="input bg-gray-50 cursor-not-allowed"
            />
          </Field>
          <Field label="Descripción / Extracto" full>
            <textarea rows={2} value={form.excerpt} onChange={(e) => setField('excerpt', e.target.value)} className="input" />
          </Field>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setField('featured', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
              />
              Destacado
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setField('active', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
              />
              Publicado
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Contenido (bloques)</h2>
        <BlogBlocksEditor
          value={form.content_html}
          onChange={(json) => setField('content_html', json)}
          onUpload={uploadBlogImage}
        />
        <p className="mt-3 text-xs text-gray-400">
          Usa los bloques para construir tu artículo: encabezados, párrafos, imágenes, columnas, tablas, citas, separadores y carruseles. Reordenar bloques con los botones de flecha.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Imagen de portada</h2>
        <div className="flex items-start gap-4">
          {form.image_url && (
            <img src={versionarImagen(form.image_url)} alt="" className="w-40 h-28 object-cover rounded-lg border border-gray-200" />
          )}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                <Upload className="w-4 h-4" />
                Subir imagen
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                />
              </label>
              {uploading && <p className="text-xs text-brand">Subiendo...</p>}
            </div>
            <input
              value={form.image_url}
              onChange={(e) => setField('image_url', e.target.value)}
              className="input text-xs"
              placeholder="https://... (URL de la imagen)"
            />
            <input
              value={form.image_alt}
              onChange={(e) => setField('image_alt', e.target.value)}
              className="input text-xs"
              placeholder="Texto alternativo (alt)"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Galería de imágenes</h2>
        <GalleryManager
          slug={form.slug}
          postId={editingId}
          images={galleryImages}
          onImagesChange={setGalleryImages}
          uploadingGallery={uploadingGallery}
          setUploadingGallery={setUploadingGallery}
        />
      </div>

      <div className="flex justify-end gap-2 mt-8 pb-8">
        <button
          onClick={() => setVistaPreviaOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-white border border-brand text-brand rounded-lg text-sm font-semibold hover:bg-brand/5 transition-colors"
        >
          <Eye className="w-4 h-4" />
          Vista Previa
        </button>
        <button
          onClick={requestSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Artículo'}
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={getConfirmTitle()}
        message={getConfirmMessage()}
        confirmLabel={getConfirmLabel()}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        danger={confirmAction?.type === 'delete'}
      />

      <VistaPreviaModal
        open={vistaPreviaOpen}
        onClose={() => setVistaPreviaOpen(false)}
        dato={{
          title: form.title,
          excerpt: form.excerpt,
          category:
            categories.find((c) => String(c.id) === String(form.category_id))
              ?.name || null,
          image_url: form.image_url,
          image_alt: form.image_alt,
          content_html: blocksToHtml(form.content_html),
        }}
      />
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
