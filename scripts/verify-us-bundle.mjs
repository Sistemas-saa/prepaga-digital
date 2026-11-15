import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "vite";

const distDir = path.resolve("dist");
const requiredRef = "ykducvvcjzdpoojxlsig";
const forbiddenRef = "ejiycfqxgtrzaysgpzmx";
const requiredUrl = `https://${requiredRef}.supabase.co`;
const forbiddenUrl = `https://${forbiddenRef}.supabase.co`;

const env = loadEnv("us", process.cwd(), "");
let keyProjectRef = null;

try {
  const payload = JSON.parse(
    Buffer.from(env.VITE_SUPABASE_PUBLISHABLE_KEY.split(".")[1] ?? "", "base64url").toString(
      "utf8",
    ),
  );
  keyProjectRef = payload.ref;
} catch {
  // Se reporta junto con las demÃ¡s inconsistencias, sin imprimir la key.
}

if (
  env.VITE_SUPABASE_URL !== requiredUrl ||
  env.VITE_SUPABASE_PROJECT_ID !== requiredRef ||
  keyProjectRef !== requiredRef
) {
  throw new Error("ConfiguraciÃ³n US rechazada: URL, project ID o publishable key no coinciden.");
}

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
      return entry.name.endsWith(".js") ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

const indexPath = path.join(distDir, "index.html");
const indexContent = await readFile(indexPath, "utf8");
const entryMatch = indexContent.match(/<script[^>]+src="([^"]+\/index-[^"]+\.js)"/i);
const entryPath = entryMatch
  ? path.join(distDir, entryMatch[1].replace(/^\//, ""))
  : null;
const entryContent = entryPath ? await readFile(entryPath, "utf8") : "";
const runtimeContent = `${indexContent}\n${entryContent}`;
const foundRequiredUrl = runtimeContent.includes(requiredUrl);
const foundForbiddenUrl = runtimeContent.includes(forbiddenUrl);
const javascriptFiles = await listJavaScriptFiles(path.join(distDir, "assets"));
const forbiddenUrlFiles = [];

for (const file of javascriptFiles) {
  if ((await readFile(file, "utf8")).includes(forbiddenUrl)) {
    forbiddenUrlFiles.push(path.relative(distDir, file));
  }
}

if (!entryPath || !foundRequiredUrl || foundForbiddenUrl || forbiddenUrlFiles.length > 0) {
  const details = [
    !entryPath ? "no se encontrÃ³ el entrypoint principal" : null,
    !foundRequiredUrl ? "el runtime principal no contiene la URL exacta de Test US" : null,
    foundForbiddenUrl ? "el runtime principal contiene la URL de Brasil" : null,
    forbiddenUrlFiles.length > 0
      ? `hay chunks con la URL de Brasil: ${forbiddenUrlFiles.join(", ")}`
      : null,
  ].filter(Boolean);
  throw new Error(`Bundle US rechazado: ${details.join("; ")}.`);
}

console.log("Bundle US verificado: Test US presente y ninguna URL de Brasil.");
