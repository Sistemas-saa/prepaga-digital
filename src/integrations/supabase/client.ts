import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Valores de PRODUCCIÓN (fuente de verdad). CUALQUIER build de producción
// (`vite build`, incluido el del Dockerfile) usa SIEMPRE estos valores → es
// imposible que un build apunte a otra base por accidente.
const PROD_SUPABASE_URL = "https://ejiycfqxgtrzaysgpzmx.supabase.co";
const PROD_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaXljZnF4Z3RyemF5c2dwem14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTY1MDgsImV4cCI6MjA4OTg5MjUwOH0.U0n0WlIsSbqC8W5uEXOyjDB8kX3mI9WBc0dBwBxgASg";
const TEST_US_PROJECT_REF = "ykducvvcjzdpoojxlsig";

// El override de base de datos SOLO se permite en dos casos explícitos:
//   1. `vite dev` (import.meta.env.DEV) → desarrollo local con `.env.local`.
//   2. Build marcado explícitamente como TEST con VITE_ENV_TARGET=test
//      (lo setea `.env.us`, usado por `npm run build:us` / `npm run deploy:test`).
// En CUALQUIER otro build —incluido `npm run build`, que usa el Dockerfile de
// producción— se ignora el env y se usan los valores de PROD.
// La comparación se escribe SIN transformaciones (nada de .trim()/.toLowerCase())
// a propósito: Vite reemplaza `import.meta.env.VITE_ENV_TARGET` por un literal, de
// modo que `isTestBuild` queda resuelto en tiempo de compilación. Eso permite que
// el bundler elimine por completo la rama de producción en un build de test, y que
// las constantes PROD_* no lleguen al bundle. Con una transformación en el medio la
// expresión deja de ser plegable y la URL de BR termina embebida en el bundle de
// test — lo detecta scripts/verify-us-bundle.mjs.
const isDev = import.meta.env.DEV === true;
// Se aceptan las DOS señales de build de test: el modo `us` (npm run build:us,
// scripts de comisiones) y VITE_ENV_TARGET=test (npm run deploy:test). Ambas se
// comparan crudas, sin .trim()/.toLowerCase(), para que sigan siendo plegables.
const isTestBuild =
  !isDev && (import.meta.env.MODE === 'us' || import.meta.env.VITE_ENV_TARGET === 'test');
const allowEnvOverride = isDev || isTestBuild;

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
const envProjectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined)?.trim();

const envProjectRef = envUrl
  ?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1]
  ?.toLowerCase();

// Un build de TEST tiene que apuntar al proyecto US y a ningún otro. Se valida en
// tiempo de build: si la configuración no cuadra, el build revienta en vez de
// generar un bundle que apunte a una base equivocada. No aplica a `vite dev`,
// para no impedir apuntar a un Supabase local.
if (isTestBuild) {
  if (envProjectRef !== TEST_US_PROJECT_REF || envProjectId !== TEST_US_PROJECT_REF) {
    throw new Error(
      `Build de test bloqueado: VITE_SUPABASE_URL debe apuntar a ${TEST_US_PROJECT_REF}.`,
    );
  }
  if (!envKey) {
    throw new Error("Build de test bloqueado: falta VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  try {
    const payload = JSON.parse(atob(envKey.split(".")[1] ?? "")) as { ref?: string };
    if (payload.ref !== TEST_US_PROJECT_REF) {
      throw new Error("project ref inesperado");
    }
  } catch {
    throw new Error(
      `Build de test bloqueado: la publishable key no pertenece a ${TEST_US_PROJECT_REF}.`,
    );
  }
}

// El ternario arranca por `isTestBuild` para que, cuando es estáticamente true, el
// bundler pliegue la expresión y descarte la rama de producción entera.
export const SUPABASE_URL = isTestBuild
  ? envUrl!
  : isDev && envUrl
    ? envUrl
    : PROD_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = isTestBuild
  ? envKey!
  : isDev && envKey
    ? envKey
    : PROD_SUPABASE_PUBLISHABLE_KEY;

// 'test' | 'production' — informativo, para diagnóstico, trazabilidad del build
// y el badge de entorno.
export const ENV_TARGET = allowEnvOverride && envUrl ? 'test' : 'production';
export const SUPABASE_PROJECT_REF =
  SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? null;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
