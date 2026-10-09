import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(path, entry.name)) : join(path, entry.name)))).flat();
}

async function check() {
  const files = (await walk('src')).filter(path => path.endsWith('.ts'));
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/\b(?:alert|confirm|prompt)\s*\(/.test(source)) throw new Error(`${file}: native dialog is prohibited`);
    if (/\.innerHTML\s*=/.test(source)) throw new Error(`${file}: use textContent for text output`);
    if (file.startsWith('src/core/') && /(?:\bfetch\s*\(|\b(?:Request|Response|D1Database|Ai|Date\.now)\b|from\s+['"](?:node:|.*backend|.*frontend|@cloudflare))/.test(source)) {
      throw new Error(`${file}: core must stay free of platform and I/O dependencies`);
    }
  }
  console.log(`Boundary checks passed (${files.length} TypeScript files).`);
}

await check();
