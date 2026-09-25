import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    fs: {
      // /fase-2-implementacion importa un .md con ?raw desde docs/ (raíz del repo)
      allow: [path.resolve(root, '..')],
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-dom') || id.includes(`${path.sep}react${path.sep}`)) return 'vendor-react';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@fortawesome')) return 'vendor-icons';
          if (id.includes('@tiptap')) return 'vendor-tiptap';
          return 'vendor';
        },
      },
    },
  },
});
