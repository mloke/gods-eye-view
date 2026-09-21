#!/usr/bin/env node
/**
 * Snapshot HomeAlone site files into JSON modules the browser graph can import.
 * Edit HomeAlone in its own repo, bump the submodule, then rerun this script.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../src/data/homeCommand/yaml.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'vendor', 'homealone', 'site');
const OUT = path.join(ROOT, 'src', 'data', 'homeCommand');

const yamlPath = path.join(SITE, 'inventory.yaml');
const spec = parseYaml(readFileSync(yamlPath, 'utf8'));
if (!spec?.cameras?.length) {
  throw new Error(`HomeAlone inventory did not parse cameras from ${yamlPath}`);
}
writeFileSync(
  path.join(OUT, 'inventory.site.json'),
  `${JSON.stringify(spec, null, 2)}\n`,
);
copyFileSync(path.join(SITE, 'layout.geojson'), path.join(OUT, 'layout.site.json'));
console.log(
  'Wrote src/data/homeCommand/{inventory,layout}.site.json from vendor/homealone/site',
);
