import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativo para funcionar tanto no GitHub Pages como dentro da app Android (Capacitor).
export default defineConfig({
  base: './',
  plugins: [react()],
});
