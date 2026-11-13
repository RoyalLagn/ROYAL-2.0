import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else files.push(path);
  }
  return files.sort();
}

// Metro's entry filename can stay unchanged when its async dependency paths
// change. An immutable cached entry then loads old routes against new shared
// modules. Version the entire graph together, using its final exported bytes.
export async function versionWebBundles(dist) {
  const originalPrefix = '/_expo/static/js/web/';
  const directory = join(dist, '_expo/static/js/web');
  const hash = createHash('sha256');
  for (const path of await filesIn(directory)) {
    hash.update(path.slice(directory.length)).update('\0');
    hash.update(await readFile(path)).update('\0');
  }
  const version = hash.digest('hex').slice(0, 20);
  const prefix = `/_expo/static/js/build-${version}/web/`;
  // Update both script tags and Metro's lazy route dependency maps.
  for (const path of await filesIn(dist)) {
    if (!/\.(?:html|js|json|map)$/.test(path)) continue;
    const source = await readFile(path, 'utf8');
    if (source.includes(originalPrefix)) {
      await writeFile(path, source.replaceAll(originalPrefix, prefix));
    }
  }
  const destination = join(dist, prefix.slice(1));
  await mkdir(dirname(destination), { recursive: true });
  await rename(directory, destination);
  return prefix;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`[build-web] Versioned JavaScript graph: ${await versionWebBundles(resolve(process.argv[2] || 'dist'))}`);
}
