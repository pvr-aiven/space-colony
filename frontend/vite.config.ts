import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_ORIGIN ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
