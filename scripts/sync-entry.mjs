import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const toml = readFileSync(join(projectRoot, 'agent.toml'), 'utf8');
const data = parse(toml);

writeFileSync(join(projectRoot, 'entry.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('wrote entry.json from agent.toml');
