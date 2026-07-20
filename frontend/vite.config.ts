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
    },
  },

  server: {
    proxy: {
      "/api/plivo/acc-analytics": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
      "/api/plivo/acc-queries": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
      "/api/plivo/download-acc-queries": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
