import { Node, mergeAttributes } from '@tiptap/core';

export const Column = Node.create({
  name: 'column',
  group: 'block',
  content: 'paragraph block*',
  defining: true,
  isolating: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'div[data-column]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'gl-col' }), 0];
  },
});

export const ColumnLayout = Node.create({
  name: 'columnLayout',
  group: 'block',
  content: 'column column+',
  defining: true,
  isolating: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'div[data-column-layout]' }];
  },
  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-columns') || '2', 10);
          return n === 3 ? 3 : 2;
        },
        renderHTML: (attrs) => ({ 'data-columns': String(attrs.columns === 3 ? 3 : 2) }),
      },
    };
  },
  renderHTML({ HTMLAttributes, node }) {
    const cols = node.attrs.columns === 3 ? 3 : 2;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-column-layout': '',
        'data-columns': String(cols),
        class: `gl-columns gl-columns-${cols}`,
      }),
      0,
    ];
  },
  addCommands() {
    return {
      setColumns:
        (columns) =>
        ({ commands }) => {
          const count = columns === 3 ? 3 : 2;
          const content = Array.from({ length: count }, () => ({
            type: 'column',
            content: [{ type: 'paragraph' }],
          }));
          return commands.insertContent({
            type: 'columnLayout',
            attrs: { columns: count },
            content,
          });
        },
    };
  },
});