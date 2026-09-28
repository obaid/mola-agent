// Exercise the same TypeScript modules Next builds, without a test-only client.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export function compileLib() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const output = mkdtempSync(join(tmpdir(), 'mola-cloud-contract-'));
  writeFileSync(join(output, 'package.json'), '{"type":"module"}');
  symlinkSync(join(root, 'node_modules'), join(output, 'node_modules'), 'dir');
  symlinkSync(join(root, 'bin'), join(output, 'bin'), 'dir');
  function compile(folder) {
    mkdirSync(join(output, folder), { recursive: true });
    for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
      const relative = join(folder, entry.name);
      if (entry.isDirectory()) compile(relative);
      else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(join(root, relative), 'utf8');
        const { outputText } = ts.transpileModule(source, { compilerOptions: {
          target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        } });
        const resolved = outputText.replace(/(from\s*|import\s*\()(['"])(\.[^'"]+)\2/g, (_, lead, quote, specifier) => {
          const path = /\.(js|ts)$/.test(specifier) ? specifier.replace(/\.ts$/, '.js') : `${specifier}.js`;
          return `${lead}${quote}${path}${quote}`;
        });
        writeFileSync(join(output, relative.replace(/\.ts$/, '.js')), resolved);
      }
    }
  }
  compile('lib');
  return { output, load: (name) => import(pathToFileURL(join(output, `lib/${name}.js`)).href) };
}
