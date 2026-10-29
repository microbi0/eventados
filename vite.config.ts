import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Caminhos absolutos: as páginas estáticas para o Google vivem em subpastas (/eventos/porto/).
// Funciona igual no domínio próprio e dentro da app Android (Capacitor serve a partir da raiz).
export default defineConfig({
  base: '/',
  plugins: [react()],
});
