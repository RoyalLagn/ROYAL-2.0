import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { versionWebBundles } from './version-web-bundles.mjs';

const root = await mkdtemp(join(tmpdir(), 'royal-bundles-'));
try {
  async function build(name, route) {
    const dist = join(root, name);
    const js = join(dist, '_expo/static/js/web');
    await mkdir(js, { recursive: true });
    await writeFile(join(dist, 'index.html'), '<script src="/_expo/static/js/web/entry-same.js"></script>');
    await writeFile(join(js, 'entry-same.js'), 'const route="/_expo/static/js/web/route.js";');
    await writeFile(join(js, 'route.js'), route);
    const prefix = await versionWebBundles(dist);
    assert.equal(await readFile(join(dist, 'index.html'), 'utf8'), `<script src="${prefix}entry-same.js"></script>`);
    assert.equal(await readFile(join(dist, prefix.slice(1), 'entry-same.js'), 'utf8'), `const route="${prefix}route.js";`);
    assert.equal(await readFile(join(dist, prefix.slice(1), 'route.js'), 'utf8'), route);
    return prefix;
  }
  const first = await build('first', 'module-v1');
  assert.equal(await build('identical', 'module-v1'), first, 'identical builds retain cache URLs');
  assert.notEqual(await build('changed', 'module-v2'), first, 'route changes must invalidate the unchanged entry URL');
  console.log('Web bundle cache versioning checks passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
