import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Datos de trazabilidad del build. Si no hay git disponible (ej. el build dentro
// de Docker, donde .dockerignore excluye .git) se degrada a 'unknown' sin romper.
const readGitInfo = () => {
  const run = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "unknown";
    }
  };
  // En Docker no hay .git: el Dockerfile pasa GIT_COMMIT / GIT_BRANCH como build-arg.
  const env = (name: string) => {
    const v = process.env[name]?.trim();
    return v && v !== "unknown" ? v : null;
  };
  return {
    commit: env("GIT_COMMIT") ?? run("git rev-parse --short HEAD"),
    branch: env("GIT_BRANCH") ?? run("git rev-parse --abbrev-ref HEAD"),
  };
};

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

        // Genera build-version.json para que el cliente detecte updates y para
        // saber QUÉ commit está desplegado en cada entorno (prod y test).
        const git = readGitInfo();
        fs.writeFileSync(
          path.resolve(__dirname, 'dist/build-version.json'),
          JSON.stringify({
            version: buildVersion,
            buildAt,
            commit: git.commit,
            branch: git.branch,
            mode,
          }, null, 2)
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
