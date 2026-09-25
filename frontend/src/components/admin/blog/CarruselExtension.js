import { Node, mergeAttributes } from '@tiptap/core';

export default Node.create({
  name: 'blogCarrusel',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: (el) => {
          try {
            const raw = JSON.parse(el.getAttribute('data-images') || '[]');
            return Array.isArray(raw) ? raw : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          'data-images': JSON.stringify(attrs.images || []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-carrusel]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const count = (node.attrs.images || []).length;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-carrusel': '',
        class: 'gl-carrusel-bloque',
      }),
      `Carrusel de imágenes (${count})`,
    ];
  },

  addCommands() {
    return {
      setBlogCarrusel:
        (images) =>
        ({ commands }) =>
          commands.insertContent({
            type: 'blogCarrusel',
            attrs: { images: Array.isArray(images) ? images : [] },
          }),
    };
  },
});