import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Type, Image, Table,
  ArrowUp, ArrowDown, Trash2, Plus, ChevronDown,
  ChevronRight, Columns2, ImageIcon,
  Heading, List, ListOrdered, Quote, Link as LinkIcon,
  Bold, Italic, Underline as UnderlineIcon, Minus,
} from '../../../lib/icons';

const BLOCK_TYPES = [
  { key: 'heading', label: 'Título', icon: Heading, level: 2 },
  { key: 'text', label: 'Párrafo', icon: Type },
  { key: 'image', label: 'Imagen', icon: Image },
  { key: 'columns', label: 'Columnas', icon: Columns2 },
  { key: 'table', label: 'Tabla', icon: Table },
  { key: 'quote', label: 'Cita', icon: Quote },
  { key: 'separator', label: 'Separador', icon: Minus },
  { key: 'carrusel', label: 'Carrusel', icon: ImageIcon },
];

function MiniToolButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function MiniRichInput({ value, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command, arg) => {
    ref.current?.focus();
    document.execCommand(command, false, arg || null);
    onChange(ref.current?.innerHTML || '');
  };

  const addLink = () => {
    const url = window.prompt('URL del enlace');
    if (url === null) return;
    if (url.trim() === '') return exec('unlink');
    exec('createLink', url.trim());
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
        <MiniToolButton onClick={() => exec('bold')} title="Negrita"><Bold className="h-3.5 w-3.5" /></MiniToolButton>
        <MiniToolButton onClick={() => exec('italic')} title="Cursiva"><Italic className="h-3.5 w-3.5" /></MiniToolButton>
        <MiniToolButton onClick={() => exec('underline')} title="Subrayado"><UnderlineIcon className="h-3.5 w-3.5" /></MiniToolButton>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <MiniToolButton onClick={() => exec('formatBlock', '<h2>')} title="Subtítulo (H2)"><Heading className="h-3.5 w-3.5" /></MiniToolButton>
        <MiniToolButton onClick={() => exec('formatBlock', '<h3>')} title="Título menor (H3)"><Heading className="h-3.5 w-3.5 scale-90" /></MiniToolButton>
        <MiniToolButton onClick={() => exec('formatBlock', '<p>')} title="Párrafo"><Type className="h-3.5 w-3.5" /></MiniToolButton>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <MiniToolButton onClick={() => exec('insertUnorderedList')} title="Lista con viñetas"><List className="h-3.5 w-3.5" /></MiniToolButton>
        <MiniToolButton onClick={() => exec('insertOrderedList')} title="Lista numerada"><ListOrdered className="h-3.5 w-3.5" /></MiniToolButton>
        <MiniToolButton onClick={() => exec('formatBlock', '<blockquote>')} title="Cita"><Quote className="h-3.5 w-3.5" /></MiniToolButton>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <MiniToolButton onClick={addLink} title="Insertar enlace"><LinkIcon className="h-3.5 w-3.5" /></MiniToolButton>
        <MiniToolButton onClick={() => exec('insertHorizontalRule')} title="Separador"><Minus className="h-3.5 w-3.5" /></MiniToolButton>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onBlur={(e) => onChange(e.currentTarget.innerHTML)}
        className="rich-text-editor min-h-[120px] rounded-lg border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </div>
  );
}

let blockIdCounter = 0;
function newId() { return `block_${Date.now()}_${++blockIdCounter}`; }

function parseBlocks(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function BlogBlocksEditor({ value, onChange, onUpload }) {
  const [blocks, setBlocks] = useState(() => parseBlocks(value));
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [uploadingBlock, setUploadingBlock] = useState(null);

  useEffect(() => {
    const parsed = parseBlocks(value);
    const parsedIds = parsed.map((b) => b.id);
    const currentIds = blocks.map((b) => b.id);
    if (JSON.stringify(parsedIds) !== JSON.stringify(currentIds) || parsed.length !== blocks.length) {
      setBlocks(parsed);
    }
  }, [value]);

  const uploadFiles = async (files, apply) => {
    if (!onUpload || !files || !files.length) return;
    setUploadingBlock(true);
    try {
      const urls = [];
      for (const file of files) {
        const url = await onUpload(file);
        if (url) urls.push(url);
      }
      if (urls.length) apply(urls);
    } finally {
      setUploadingBlock(false);
    }
  };

  const syncChange = useCallback(
    (next) => {
      setBlocks(next);
      onChange(JSON.stringify(next));
    },
    [onChange],
  );

  const addBlock = useCallback(
    (type) => {
      const defaults = {
        heading: { content: 'Título aquí', level: 2 },
        text: { content: '<p>Contenido aquí…</p>' },
        image: { src: '', alt: '', caption: '' },
        columns: { cols: 2, blocks: [{ content: '<p>Columna 1</p>' }, { content: '<p>Columna 2</p>' }] },
        table: { headers: ['Celda 1', 'Celda 2'], rows: [['Dato A', 'Dato B'], ['Dato C', 'Dato D']] },
        quote: { content: 'Cita aquí', author: '—' },
        separator: {},
        carrusel: { images: [] },
      };
      const block = { id: newId(), type, ...defaults[type] };
      syncChange([...blocks, block]);
      setExpandedId(block.id);
    },
    [blocks, syncChange],
  );

  const removeBlock = useCallback(
    (idx) => {
      const next = blocks.filter((_, i) => i !== idx);
      syncChange(next);
      if (expandedId === blocks[idx]?.id) setExpandedId(null);
    },
    [blocks, expandedId, syncChange],
  );

  const moveBlock = useCallback(
    (idx, dir) => {
      const target = idx + dir;
      if (target < 0 || target >= blocks.length) return;
      const next = [...blocks];
      [next[idx], next[target]] = [next[target], next[idx]];
      syncChange(next);
    },
    [blocks, syncChange],
  );

  const updateBlock = useCallback(
    (idx, updates) => {
      const next = blocks.map((b, i) => (i === idx ? { ...b, ...updates } : b));
      syncChange(next);
    },
    [blocks, syncChange],
  );

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...blocks];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    syncChange(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const renderBlockContent = (block) => {
    switch (block.type) {
      case 'heading':
        return <h2 className="text-xl font-bold text-gray-900">{block.content || 'Título'}</h2>;
      case 'text':
        return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: block.content || '<p>Texto…</p>' }} />;
      case 'image':
        return (
          <div className="space-y-1">
            {block.src ? <img src={block.src} alt={block.alt || ''} className="w-full h-48 object-cover rounded-lg border" /> : <div className="w-full h-48 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400"><Image className="w-8 h-8" /></div>}
            {block.caption && <p className="text-xs text-gray-500">{block.caption}</p>}
          </div>
        );
      case 'columns':
        return (
          <div className="grid grid-cols-2 gap-4">
            {(block.blocks || []).map((col, ci) => (
              <div key={ci} className="bg-gray-50 rounded-lg p-4 border border-gray-100" dangerouslySetInnerHTML={{ __html: col.content || `<p>Columna ${ci + 1}</p>` }} />
            ))}
          </div>
        );
      case 'table':
        return (
          <table className="w-full text-sm border-collapse border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-50">
                {(block.headers || []).map((h, i) => <th key={i} className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(block.rows || []).map((row, ri) => (
                <tr key={ri} className="hover:bg-gray-50">
                  {(row || []).map((cell, ci) => <td key={ci} className="px-3 py-2 border-b border-gray-100">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'quote':
        return <blockquote className="border-l-4 border-brand bg-brand/5 px-4 py-3 text-gray-700 italic">{block.content || 'Cita…'} {block.author && <footer className="text-xs text-gray-500 mt-1">{block.author}</footer>}</blockquote>;
      case 'separator':
        return <hr className="border-gray-200 my-4" />;
      case 'carrusel':
        return (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {(block.images || []).map((img, i) => (
              <div key={i} className="flex-shrink-0 w-48 h-32 bg-gray-100 rounded-lg border flex items-center justify-center text-gray-400 text-xs">Imagen {i + 1}</div>
            ))}
            {(block.images || []).length === 0 && <div className="w-48 h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">Sin imágenes</div>}
          </div>
        );
      default:
        return <p>Bloque desconocido</p>;
    }
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => (
        <div
          key={block.id}
          draggable
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={(e) => handleDrop(e, idx)}
          onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
          className={`group relative border rounded-xl transition-all ${dragIdx === idx ? 'opacity-50' : ''} ${dragOverIdx === idx && dragIdx !== idx ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200 hover:border-gray-300'} ${expandedId === block.id ? '' : ''}`}
        >
          <div className="flex items-center gap-1 p-1.5 bg-gray-50 rounded-t-xl border-b border-gray-100">
            <button type="button" onClick={() => setExpandedId(expandedId === block.id ? null : block.id)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="Expandir">
              {expandedId === block.id ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
            </button>
            <span className="text-xs font-medium text-gray-500 capitalize flex items-center gap-1">
              {(() => {
                const Icon = BLOCK_TYPES.find((bt) => bt.key === block.type)?.icon;
                return Icon ? <Icon className="w-3 h-3" /> : null;
              })()}
              {block.type}
            </span>
            <div className="flex-1" />
            <button type="button" onClick={() => moveBlock(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30" title="Mover arriba"><ArrowUp className="w-4 h-4 text-gray-600" /></button>
            <button type="button" onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30" title="Mover abajo"><ArrowDown className="w-4 h-4 text-gray-600" /></button>
            <button type="button" onClick={() => removeBlock(idx)} className="p-1 hover:bg-red-50 rounded-lg disabled:opacity-30" title="Eliminar bloque"><Trash2 className="w-4 h-4 text-red-500" /></button>
          </div>
          {expandedId === block.id && (
            <div className="p-4 space-y-3">
              {renderBlockEditor(block, idx, updateBlock, { onUpload, uploading: uploadingBlock, uploadFiles })}
              <div className="flex justify-end">
                <button type="button" onClick={() => removeBlock(idx)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar bloque</button>
              </div>
            </div>
          )}
          {expandedId !== block.id && (
            <div className="p-4">
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 min-h-[60px]">{renderBlockContent(block)}</div>
            </div>
          )}
        </div>
      ))}

      <div className="mt-4">
        <details className="border border-gray-200 rounded-xl overflow-hidden">
          <summary className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer text-sm font-medium text-gray-700 transition-colors list-none">
            <Plus className="w-4 h-4" />
            Añadir bloque
          </summary>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BLOCK_TYPES.map((bt) => {
              const Icon = bt.icon;
              return (
                <button key={bt.key} type="button" onClick={() => addBlock(bt.key)} className="flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-200 hover:border-brand hover:bg-brand/5 transition-colors">
                  <Icon className="w-5 h-5 text-gray-600" />
                  <span className="text-xs text-gray-600">{bt.label}</span>
                </button>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}

function renderBlockEditor(block, idx, onChange, { onUpload, uploading, uploadFiles }) {
  switch (block.type) {
    case 'heading':
      return (
        <>
          <label className="block text-xs font-medium text-gray-500 mb-1">Contenido</label>
          <input value={block.content || ''} onChange={(e) => onChange(idx, { content: e.target.value })} className="input" placeholder="Título del bloque" />
          <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Nivel</label>
          <select value={block.level || 2} onChange={(e) => onChange(idx, { level: Number(e.target.value) })} className="input">
            <option value={2}>H2</option><option value={3}>H3</option><option value={4}>H4</option>
          </select>
        </>
      );
    case 'text':
      return (
        <>
          <MiniRichInput
            value={block.content || ''}
            onChange={(html) => onChange(idx, { content: html })}
          />
        </>
      );
    case 'image':
      return (
        <>
          {onUpload && (
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors w-fit">
              <Image className="w-3.5 h-3.5" />
              {uploading ? 'Subiendo…' : 'Subir imagen'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files, (urls) => onChange(idx, { src: urls[0] }))}
              />
            </label>
          )}
          <label className="block text-xs font-medium text-gray-500 mb-1">URL de imagen</label>
          <input value={block.src || ''} onChange={(e) => onChange(idx, { src: e.target.value })} className="input" placeholder="https://..." />
          <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Texto alternativo</label>
          <input value={block.alt || ''} onChange={(e) => onChange(idx, { alt: e.target.value })} className="input" placeholder="Descripción de la imagen" />
          <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Pie de imagen</label>
          <input value={block.caption || ''} onChange={(e) => onChange(idx, { caption: e.target.value })} className="input" placeholder="Opcional" />
        </>
      );
    case 'columns':
      return (
        <>
          <label className="block text-xs font-medium text-gray-500 mb-1">Número de columnas</label>
          <select value={block.cols || 2} onChange={(e) => onChange(idx, { cols: Number(e.target.value), blocks: Array(Number(e.target.value)).fill(null).map((_, i) => ({ content: block.blocks?.[i]?.content || `<p>Columna ${i + 1}</p>` })) })} className="input">
            <option value={2}>2 columnas</option><option value={3}>3 columnas</option>
          </select>
          {(block.blocks || []).map((col, ci) => (
            <div key={ci} className="mt-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Columna {ci + 1}</label>
              <MiniRichInput
                value={col.content || ''}
                onChange={(html) => {
                  const newBlocks = [...(block.blocks || [])];
                  newBlocks[ci] = { ...newBlocks[ci], content: html };
                  onChange(idx, { blocks: newBlocks });
                }}
              />
            </div>
          ))}
        </>
      );
    case 'table': {
      const headers = block.headers || [];
      const rows = block.rows || [];
      const nCols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
      return (
        <>
          <div className="flex gap-2 mb-1 items-center">
            {Array.from({ length: nCols }).map((_, ci) => (
              <input
                key={ci}
                value={headers[ci] || ''}
                onChange={(e) => {
                  const newHeaders = [...headers];
                  newHeaders[ci] = e.target.value;
                  onChange(idx, { headers: newHeaders });
                }}
                className="input flex-1 font-semibold"
                placeholder={`Encabezado ${ci + 1}`}
              />
            ))}
            <button type="button" onClick={() => onChange(idx, { headers: [...headers, `Encabezado ${nCols + 1}`] })} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Añadir columna"><Plus className="w-4 h-4" /></button>
            <button
              type="button"
              onClick={() => onChange(idx, {
                headers: headers.slice(0, -1),
                rows: rows.map((r) => r.slice(0, -1)),
              })}
              disabled={nCols <= 1}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
              title="Quitar columna"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-2 mb-2 items-center">
              {Array.from({ length: nCols }).map((_, ci) => (
                <input
                  key={ci}
                  value={row[ci] || ''}
                  onChange={(e) => {
                    const newRows = rows.map((r) => [...r]);
                    newRows[ri][ci] = e.target.value;
                    onChange(idx, { rows: newRows });
                  }}
                  className="input flex-1"
                  placeholder={`Celda ${ci + 1}`}
                />
              ))}
              <button
                type="button"
                onClick={() => onChange(idx, { rows: rows.filter((_, i) => i !== ri) })}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                title="Eliminar fila"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange(idx, { rows: [...rows, Array(nCols).fill('')] })}
            className="text-xs text-brand hover:underline mt-1"
          >
            + Añadir fila
          </button>
        </>
      );
    }
    case 'quote':
      return (
        <>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cita</label>
          <textarea value={block.content || ''} onChange={(e) => onChange(idx, { content: e.target.value })} className="input h-20" placeholder="Texto de la cita" />
          <label className="block text-xs font-medium text-gray-500 mb-1 mt-2">Autor</label>
          <input value={block.author || ''} onChange={(e) => onChange(idx, { author: e.target.value })} className="input" placeholder="—" />
        </>
      );
    case 'carrusel':
      return (
        <>
          {onUpload && (
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors w-fit">
              <ImageIcon className="w-3.5 h-3.5" />
              {uploading ? 'Subiendo…' : 'Subir imágenes'}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files, (urls) => onChange(idx, { images: [...(block.images || []), ...urls] }))}
              />
            </label>
          )}
          <label className="block text-xs font-medium text-gray-500 mb-1">Imágenes (URLs separadas por coma)</label>
          <textarea value={(block.images || []).join(', ')} onChange={(e) => onChange(idx, { images: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className="input h-20" placeholder="https://img1.jpg, https://img2.jpg" />
          {(block.images || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {block.images.map((src, i) => (
                <div key={i} className="relative group w-20 h-14 rounded-lg overflow-hidden border border-gray-200">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onChange(idx, { images: block.images.filter((_, j) => j !== i) })}
                    className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 text-white"
                    title="Quitar imagen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      );
    default:
      return null;
  }
}
