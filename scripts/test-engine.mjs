#!/usr/bin/env node
/**
 * Cross-platform wrapper for the template-engine regression test.
 *
 * The original implementation was a Bash script. The project is also used on
 * Windows machines without WSL, so keep the exact same checks in Node instead
 * of making `npm run test:engine` depend on a shell that may not exist.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2] || 'origin/main';
const tmp = join(root, '.tmp-engine-test');
const oldLib = join(tmp, 'old', 'lib');
const out = join(tmp, 'out');
const needsWindowsShell = (command) =>
  process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
const runOptions = { cwd: root, stdio: 'inherit' };
const runCaptureOptions = { cwd: root, encoding: 'utf8' };

const run = (command, args) => execFileSync(command, args, { ...runOptions, shell: needsWindowsShell(command) });
const capture = (command, args, env = process.env) =>
  execFileSync(command, args, { ...runCaptureOptions, shell: needsWindowsShell(command), env });

rmSync(tmp, { recursive: true, force: true });
mkdirSync(oldLib, { recursive: true });
mkdirSync(out, { recursive: true });

try {
  const oldEngine = capture('git', ['show', `${ref}:src/lib/enhancedTemplateEngine.ts`]);
  writeFileSync(join(oldLib, 'enhancedTemplateEngine.ts'), oldEngine, 'utf8');
  cpSync(join(root, 'src/lib/utils.ts'), join(oldLib, 'utils.ts'));
  cpSync(join(root, 'src/lib/appUrls.ts'), join(oldLib, 'appUrls.ts'));

  const esbuild = process.platform === 'win32'
    ? process.execPath
    : join(root, 'node_modules', '.bin', 'esbuild');
  const esbuildArgs = process.platform === 'win32'
    ? [join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')]
    : [];
  run(esbuild, [...esbuildArgs,
    'tests/template-engine/render.ts', '--bundle', '--platform=node', '--format=cjs',
    '--alias:@=./src', '--outfile=.tmp-engine-test/out/new.cjs', '--log-level=error',
  ]);
  run(esbuild, [...esbuildArgs,
    'tests/template-engine/render.ts', '--bundle', '--platform=node', '--format=cjs',
    '--alias:@=./.tmp-engine-test/old', '--outfile=.tmp-engine-test/out/old.cjs', '--log-level=error',
  ]);
  run(esbuild, [...esbuildArgs,
    'tests/template-engine/checks.ts', '--bundle', '--platform=node', '--format=cjs',
    '--alias:@=./src', '--outfile=.tmp-engine-test/out/checks.cjs', '--log-level=error',
  ]);

  writeFileSync(join(out, 'old.json'), capture(process.execPath, [join(tmp, 'out', 'old.cjs')]), 'utf8');
  writeFileSync(
    join(out, 'new.json'),
    capture(process.execPath, [join(tmp, 'out', 'new.cjs')], {
      ...process.env,
      ANEXO_PATH: join(root, 'docs/plantilla-anexo-incorporacion.html'),
    }),
    'utf8',
  );

  console.log(`(motor de referencia: ${ref})\n`);
  run(process.execPath, ['tests/template-engine/compare.cjs', join(tmp, 'out')]);
  console.log('');
  run(process.execPath, [join(tmp, 'out', 'checks.cjs')]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
