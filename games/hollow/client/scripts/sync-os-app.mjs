// Copies the ImbatranimOS build (`dist/os/`, from `vite build --mode os`) into
// `games/hollow/os-app/dist/`, the committed copy ImbatranimOS installs from a
// URL without building anything. Source maps stay out: the app doesn't need
// them and they are five times its size.
import { cpSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const client = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(client, 'dist', 'os');
const to = join(client, '..', 'os-app', 'dist');

if (!statSync(join(from, 'hollow.mjs'), { throwIfNoEntry: false })) {
  console.error(`sync-os-app: ${relative(process.cwd(), from)}/hollow.mjs is missing; run vite build --mode os first`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith('.map') });

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else files.push(relative(to, p));
  }
};
walk(to);
console.log(`sync-os-app: ${files.length} files into ${relative(process.cwd(), to)}: ${files.join(', ')}`);
