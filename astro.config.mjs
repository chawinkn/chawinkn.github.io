// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://chawinkn.github.io',
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()]
  }
});