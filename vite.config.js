import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/okx-api': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/okx-api/, ''),
      },
      '/okx-global': {
        target: 'https://www.okx.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/okx-global/, ''),
      },
      '/okx-eea': {
        target: 'https://eea.okx.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/okx-eea/, ''),
      },
      '/okx-us': {
        target: 'https://us.okx.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/okx-us/, ''),
      },
    },
  },
});
