/* global console */
import { cp, mkdir, readFile, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = join(root, 'apps', 'desktop', 'runtime');
const packages = ['contracts', 'control-plane', 'execution-plane', 'model-gateway', 'orchestration-core'];
await rm(runtime, { recursive: true, force: true });
await mkdir(join(runtime, 'node_modules', '@aicompany'), { recursive: true });

for (const name of packages) {
  const source = join(root, 'packages', name, 'dist');
  const target = join(runtime, 'node_modules', '@aicompany', name, 'dist');
  await cp(source, target, { recursive: true });
  const packageJson = JSON.stringify({ name: `@aicompany/${name}`, version: '0.0.0', type: 'module', main: './dist/index.js', exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } } }, null, 2);
  await cp(source, join(runtime, 'packages', name, 'dist'), { recursive: true });
  await writeFile(join(dirname(target), 'package.json'), packageJson);
  await writeFile(join(runtime, 'packages', name, 'package.json'), packageJson);
}

await cp(await realpath(join(root, 'packages', 'contracts', 'node_modules', 'zod')), join(runtime, 'deps', 'zod'), { recursive: true });

const rewriteZodImports = async (directory, relativeImport) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await rewriteZodImports(path, relativeImport);
    else if (entry.name.endsWith('.js')) {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replaceAll("from 'zod'", `from '${relativeImport}'`).replaceAll('from "zod"', `from "${relativeImport}"`));
    }
  }
};

const rewriteWorkspaceImports = async (directory, packageName) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await rewriteWorkspaceImports(path, packageName);
    else if (entry.name.endsWith('.js')) {
      let source = await readFile(path, 'utf8');
      for (const dependency of packages) {
        if (dependency === packageName) continue;
        const target = join(runtime, 'packages', dependency, 'dist', 'index.js');
        const fromDirectory = dirname(path);
        const importPath = posix.relative(fromDirectory.replaceAll('\\', '/'), target.replaceAll('\\', '/'));
        const normalized = importPath.startsWith('.') ? importPath : `./${importPath}`;
        source = source.replaceAll(`'@aicompany/${dependency}'`, `'${normalized}'`).replaceAll(`"@aicompany/${dependency}"`, `"${normalized}"`);
      }
      await writeFile(path, source);
    }
  }
};

await rewriteZodImports(join(runtime, 'node_modules', '@aicompany', 'contracts', 'dist'), '../../../../deps/zod/index.js');
await rewriteZodImports(join(runtime, 'packages', 'contracts', 'dist'), '../../../deps/zod/index.js');
for (const name of packages) await rewriteWorkspaceImports(join(runtime, 'packages', name, 'dist'), name);

await cp(join(root, 'apps', 'control-plane-server', 'server.mjs'), join(runtime, 'apps', 'control-plane-server', 'server.mjs'));
await cp(join(root, 'apps', 'local-worker', 'local-worker.mjs'), join(runtime, 'apps', 'local-worker', 'local-worker.mjs'));
await cp(join(root, 'apps', 'desktop', 'agent-hook.mjs'), join(runtime, 'agent-hook.mjs'));

await cp(join(root, 'apps', 'mission-grid', 'out'), join(runtime, 'mission-grid'), { recursive: true });
await cp(await realpath(join(root, 'apps', 'desktop', 'node_modules', 'node-pty')), join(runtime, 'deps', 'node-pty'), { recursive: true });
console.log(`Prepared desktop runtime at ${relative(root, runtime)}`);
