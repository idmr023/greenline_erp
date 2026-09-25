import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Image as ImageIcon,
  Minus,
  Table as TableIcon,
  LayoutGrid,
  Link as LinkIcon,
  Upload,
  Trash2,
  Images as ImagesIcon,
} from '../../../lib/icons';
import { ColumnLayout, Column } from './ColumnExtensions';
import Carrusel from './CarruselExtension';
import CarruselModal from './CarruselModal';

function ToolButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        active ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden="true" />;
}

function ColumnsButton({ columns, onClick, title }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-gray-600 transition-colors hover:bg-gray-100"
    >
      <LayoutGrid className="h-4 w-4" />
      <span className="text-xs font-bold">{columns}</span>
    </button>
  );
}

export default function RichTextEditor({ value, onChange, onUpload, placeholder }) {
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState(null);
  const [carruselOpen, setCarruselOpen] = useState(false);
  const fileInputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false },
      }),
      Image.configure({ inline: false }),
      Placeholder.configure({
        placeholder: placeholder || 'Escribe el contenido del artículo aquí…',
      }),
      TableKit.configure({ table: { resizable: true } }),
      Column,
      ColumnLayout,
      Carrusel,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'rich-text-editor min-h-[320px] focus:outline-none',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if (current === (value || '')) return;
    editor.commands.setContent(value || '', { emitUpdate: false });
  }, [value, editor]);

  // Menú flotante de formato. TipTap v3 no incluye <BubbleMenu/> de React,
  // así que se posiciona siguiendo la selección del usuario.
  useEffect(() => {
    if (!editor) return;
    const MENU_WIDTH = 176;
    const updateMenu = () => {
      const sel = window.getSelection();
      const anchor = sel && sel.anchorNode;
      const view = editor.view;
      if (!anchor || sel.isCollapsed || !view.dom.contains(anchor)) {
        setMenu(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        setMenu(null);
        return;
      }
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setMenu(null);
        return;
      }
      setMenu({
        x: Math.min(
          Math.max(rect.left + rect.width / 2, MENU_WIDTH / 2 + 8),
          window.innerWidth - MENU_WIDTH / 2 - 8,
        ),
        y: rect.top - 8,
      });
    };
    document.addEventListener('selectionchange', updateMenu);
    window.addEventListener('scroll', updateMenu, true);
    window.addEventListener('resize', updateMenu);
    return () => {
      document.removeEventListener('selectionchange', updateMenu);
      window.removeEventListener('scroll', updateMenu, true);
      window.removeEventListener('resize', updateMenu);
    };
  }, [editor]);

  const uploadImage = async (file) => {
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      const url = await onUpload(file);
      if (url && editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } catch (err) {
      console.error('Error subiendo imagen:', err);
    } finally {
      setUploading(false);
    }
  };

  const addLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL del enlace', prev);
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  if (!editor) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-400">
        Cargando editor…
      </div>
    );
  }

  const chain = () => editor.chain().focus();

  return (
    <div>
      {/* Barra de herramientas */}
      <div className="mb-3 flex flex-wrap items-center gap-0.5 rounded-xl border border-gray-200 bg-gray-50 p-1.5">
        <ToolButton
          active={editor.isActive('bold')}
          onClick={() => chain().toggleBold().run()}
          title="Negrita (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('italic')}
          onClick={() => chain().toggleItalic().run()}
          title="Cursiva (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('underline')}
          onClick={() => chain().toggleUnderline().run()}
          title="Subrayado (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
          title="Subtítulo (H2)"
        >
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
          title="Título menor (H3)"
        >
          <Heading3 className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          active={editor.isActive('bulletList')}
          onClick={() => chain().toggleBulletList().run()}
          title="Lista con viñetas"
        >
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('orderedList')}
          onClick={() => chain().toggleOrderedList().run()}
          title="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          active={editor.isActive('blockquote')}
          onClick={() => chain().toggleBlockquote().run()}
          title="Cita"
        >
          <Quote className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton onClick={addLink} active={editor.isActive('link')} title="Insertar enlace">
          <LinkIcon className="h-4 w-4" />
        </ToolButton>

        <ToolButton
          onClick={() => fileInputRef.current?.click()}
          active={false}
          title="Subir imagen"
        >
          {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : <ImageIcon className="h-4 w-4" />}
        </ToolButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            uploadImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <Divider />

        <ToolButton
          onClick={() => chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}
          active={editor.isActive('table')}
          title="Insertar tabla"
        >
          <TableIcon className="h-4 w-4" />
        </ToolButton>

        <ColumnsButton
          columns={2}
          onClick={() => chain().setColumns(2).run()}
          title="Insertar 2 columnas"
        />
        <ColumnsButton
          columns={3}
          onClick={() => chain().setColumns(3).run()}
          title="Insertar 3 columnas"
        />

        <ToolButton
          onClick={() => setCarruselOpen(true)}
          active={editor.isActive('blogCarrusel')}
          title="Insertar carrusel de imágenes"
        >
          <ImagesIcon className="h-4 w-4" />
        </ToolButton>

        <Divider />

        <ToolButton
          onClick={() => chain().setHorizontalRule().run()}
          title="Separador horizontal"
        >
          <Minus className="h-4 w-4" />
        </ToolButton>
      </div>

      {/* Controles de tabla cuando el cursor está dentro */}
      {editor.isActive('table') && (
        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-brand/20 bg-brand/5 p-1.5 text-xs font-medium text-gray-700">
          <span className="px-1 text-brand-dark">Tabla:</span>
          <button
            type="button"
            onClick={() => chain().addRowAfter().run()}
            className="rounded-lg px-2 py-1.5 transition-colors hover:bg-brand/10"
            title="Añadir fila abajo"
          >
            + fila
          </button>
          <button
            type="button"
            onClick={() => chain().addColumnAfter().run()}
            className="rounded-lg px-2 py-1.5 transition-colors hover:bg-brand/10"
            title="Añadir columna a la derecha"
          >
            + columna
          </button>
          <button
            type="button"
            onClick={() => chain().deleteRow().run()}
            className="rounded-lg px-2 py-1.5 transition-colors hover:bg-brand/10"
            title="Eliminar fila actual"
          >
            − fila
          </button>
          <button
            type="button"
            onClick={() => chain().deleteColumn().run()}
            className="rounded-lg px-2 py-1.5 transition-colors hover:bg-brand/10"
            title="Eliminar columna actual"
          >
            − columna
          </button>
          <button
            type="button"
            onClick={() => chain().deleteTable().run()}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-red-600 transition-colors hover:bg-red-50"
            title="Eliminar tabla"
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar tabla
          </button>
        </div>
      )}

      {/* Menú flotante de formato */}
      {menu && (
        <div
          className="fixed z-50 flex translate-x-[-50%] translate-y-[-100%] items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-xl"
          style={{ left: menu.x, top: menu.y, width: 176 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolButton
            active={editor.isActive('bold')}
            onClick={() => chain().toggleBold().run()}
            title="Negrita"
          >
            <Bold className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={editor.isActive('italic')}
            onClick={() => chain().toggleItalic().run()}
            title="Cursiva"
          >
            <Italic className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            active={editor.isActive('underline')}
            onClick={() => chain().toggleUnderline().run()}
            title="Subrayado"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolButton>
          <Divider />
          <ToolButton onClick={addLink} active={editor.isActive('link')} title="Enlace">
            <LinkIcon className="h-4 w-4" />
          </ToolButton>
        </div>
      )}

      {/* Área editable */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <EditorContent editor={editor} />
      </div>

      <CarruselModal
        open={carruselOpen}
        onClose={() => setCarruselOpen(false)}
        onUpload={onUpload}
        onConfirm={(images) => {
          editor.chain().focus().setBlogCarrusel(images).run();
        }}
      />
    </div>
  );
}