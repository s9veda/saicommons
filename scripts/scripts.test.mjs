import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runScript(name, args = [], failNpm = false) {
  const dir = mkdtempSync(join(tmpdir(), 'saicommons-scripts-'));
  try {
    const log = join(dir, 'calls');
    const mock = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({
  command: path.basename(process.argv[1]), args: process.argv.slice(2), cwd: process.cwd()
}) + '\\n');
if (process.env.MOCK_FAIL_NPM && path.basename(process.argv[1]) === 'npm') process.exit(1);
`;
    for (const command of ['npm', 'npx']) writeFileSync(join(dir, command), mock, { mode: 0o755 });
    const result = spawnSync(join(root, 'scripts', name), args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, MOCK_LOG: log, MOCK_FAIL_NPM: failNpm ? '1' : '' },
    });
    if (result.error) throw result.error;
    const calls = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    return { status: result.status, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('launch scripts and web build use the shared app and forward arguments', () => {
  for (const [file, command] of [
    ['launch-web.sh', 'web'], ['launch-ios.sh', 'ios'],
    ['launch-android.sh', 'android'], ['build-web.sh', 'build-web'],
  ]) {
    const result = runScript(file, ['--example', 'two words']);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls[0].args, ['--prefix', join(root, 'src'), 'run', command, '--', '--example', 'two words']);
  }
});

test('native build and deployment use EAS production profiles', () => {
  for (const platform of ['ios', 'android']) {
    for (const [prefix, action] of [['build', 'build'], ['deploy', 'submit']]) {
      const result = runScript(`${prefix}-${platform}.sh`, ['--non-interactive']);
      assert.equal(result.status, 0);
      assert.deepEqual(result.calls[0], {
        command: 'npx', args: ['eas-cli@latest', action, '--platform', platform, '--profile', 'production', '--non-interactive'],
        cwd: join(root, 'src'),
      });
    }
  }
});

test('web deployment builds first, forwards arguments, and stops on build failure', () => {
  const result = runScript('deploy-web.sh', ['--branch', 'preview']);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls.map((call) => call.command), ['npm', 'npx']);
  assert.deepEqual(result.calls[1], {
    command: 'npx',
    args: ['wrangler', 'pages', 'deploy', '../dist', '--project-name', 'saicommons-web', '--branch', 'preview'],
    cwd: join(root, 'src', 'web'),
  });
  const failure = runScript('deploy-web.sh', [], true);
  assert.notEqual(failure.status, 0);
  assert.deepEqual(failure.calls.map((call) => call.command), ['npm']);
});

test('API deployment uses the Worker config without uploading local secrets', () => {
  const result = runScript('deploy-api.sh', ['--dry-run']);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, [{
    command: 'npx', args: ['wrangler', 'deploy', '--config', 'src/api/wrangler.jsonc', '--dry-run'],
    cwd: root,
  }]);
});
