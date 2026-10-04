// Module resolve hook that lets plain Node run the TypeScript sources behind lib/jobs/cli.ts.
// Next and Vitest resolve "@/..." and extensionless imports themselves, Node does not.
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../../", import.meta.url);

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function existingTs(url) {
  const path = fileURLToPath(url);
  for (const candidate of [path, `${path}.ts`, `${path}/index.ts`]) {
    if (isFile(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

function localUrl(specifier, parentURL) {
  if (specifier.startsWith("@/")) return new URL(specifier.slice(2), ROOT);
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  return relative && parentURL?.startsWith("file:") ? new URL(specifier, parentURL) : null;
}

export async function resolve(specifier, context, nextResolve) {
  const url = localUrl(specifier, context.parentURL);
  const href = url ? existingTs(url) : null;
  if (!href) return nextResolve(specifier, context);
  return { url: href, format: href.endsWith(".ts") ? "module-typescript" : undefined, shortCircuit: true };
}
