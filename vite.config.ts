import { defineConfig } from 'vite';
export default defineConfig({
  root: 'src/frontend',
  build: { outDir: '../../dist/pages', emptyOutDir: false },
  server: { port: 5173, strictPort: true, proxy: { '^/api/': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
});
