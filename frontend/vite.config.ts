import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The API port can move (another process may already hold 3000), so the proxy
// target follows API_PORT rather than being hardcoded.
const apiPort = process.env.API_PORT ?? "3000";
const target = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5192,
    strictPort: false,
    proxy: {
      "/api": { target, changeOrigin: true },
      "/posters": { target, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
