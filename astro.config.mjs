// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://chawinkn.com",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },
});
