import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The API port can move (another process may already hold 3000), so the proxy
// target follows API_PORT rather than being hardcoded.
const apiPort = process.env.API_PORT ?? "3000";
const target = `http://localhost:${apiPort}`;

/**
 * Vite 5.4.12+ rejects requests whose Host header it doesn't recognise, to block
 * DNS-rebinding attacks against the dev server. A tunnel hostname is exactly
 * that case, so sharing the dev server dies with "Blocked request. This host is
 * not allowed."
 *
 * These are scoped to the tunnel providers rather than set to `true` — allowing
 * any host would hand the protection back. Normal tunnelling should point at the
 * backend on :3000 instead; this only exists for sharing a hot-reloading dev
 * session on purpose.
 */
const TUNNEL_HOSTS = [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".ngrok.app"];

// HMR's websocket must be told it is behind https on port 443, or the browser
// tries ws://<tunnel-host>:5192 and the page reload-loops. Only when tunnelling —
// setting it unconditionally breaks plain http://localhost:5192.
const tunnelling = process.env.TUNNEL === "1";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5192,
    strictPort: false,
    allowedHosts: TUNNEL_HOSTS,
    ...(tunnelling ? { hmr: { protocol: "wss", clientPort: 443 } } : {}),
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
