import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Change ESP32_HOST to match your device IP or use motorctrl.local
const ESP32_HOST = process.env.ESP32_HOST || "http://192.168.1.100";
const ESP32_WS   = process.env.ESP32_WS   || "ws://192.168.1.100";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target:       ESP32_HOST,
        changeOrigin: true,
        rewrite:      (p) => p,
      },
      "/ws": {
        target:     ESP32_WS,
        ws:         true,
        changeOrigin: true,
      },
    },
  },
});
