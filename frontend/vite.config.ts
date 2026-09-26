import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
  ],
  // test: {
  //   globals: true,
  //   environment: "jsdom",
  // },

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@testers-dashboard": resolve(__dirname, "../testers-dashboard/frontend/src"),
    },
  },

  server: {
    fs: {
      // Testers Dashboard code lives outside this project root
      // (../testers-dashboard/frontend/src) but is still part of this same
      // Vite build - allow the dev server to read it.
      allow: [resolve(__dirname, ".."), resolve(__dirname)],
    },
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
