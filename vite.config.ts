import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    // Inyecta versión de build en sw.js y genera build-version.json
    {
      name: 'sw-version-inject',
      apply: 'build' as const,
      writeBundle() {
        const buildVersion = Date.now().toString(36);
        const buildAt = new Date().toISOString();

        // Reemplaza CACHE_NAME en dist/sw.js con la versión real del build
        const swPath = path.resolve(__dirname, 'dist/sw.js');
        if (fs.existsSync(swPath)) {
          const content = fs.readFileSync(swPath, 'utf-8');
          const updated = content.replace(
            /CACHE_NAME\s*=\s*['"][^'"]+['"]/,
            `CACHE_NAME = 'prepaga-digital-${buildVersion}'`
          ).replace(
            /CACHE_VERSION\s*=\s*['"][^'"]+['"]/,
            `CACHE_VERSION = '${buildVersion}'`
          );
          fs.writeFileSync(swPath, updated);
        }

        // Genera build-version.json para que el cliente detecte updates
        fs.writeFileSync(
          path.resolve(__dirname, 'dist/build-version.json'),
          JSON.stringify({ version: buildVersion, buildAt }, null, 2)
        );
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-accordion',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
            '@radix-ui/react-toast',
          ],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-editor': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extensions',
          ],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['pdf-lib'],
        },
      },
    },
  },
}));
