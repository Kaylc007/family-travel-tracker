// Vite configuration for building and displaying frontend assets

import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  // Use Vite only for bundling assets, not for a full SPA
  appType: "custom",

  // Disable default public folder handling
  publicDir: false,

  build: {
    // Output folder for compiled assets
    outDir: "dist",

    // Generate manifest so the server can load the correct files
    manifest: "manifest.json",

    // Entry point for the frontend
    rollupOptions: {
      input: "/client/main.js"
    }
  },

  server: {
    // Run Vite in middleware mode so Express can control the server
    middlewareMode: true,

    // Port used for hot module reload in development
    hmr: { port: 24678 }
  },

  resolve: {
    // Allows imports like "@/file" instead of long relative paths
    alias: {
      "@": path.resolve(process.cwd(), "client")
    }
  }
});
