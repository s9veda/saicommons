import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(path, dependencies, globals) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const context = vm.createContext({
    exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  vm.runInContext(compiled, context, { filename: path });
  return exports;
}

function createClients(apiKey = 'test-client-key') {
  const storage = new Map();
  const calls = [];
  const globals = {
    process: { env: { EXPO_PUBLIC_API_URL: 'https://api.example.test/', EXPO_PUBLIC_API_KEY: apiKey } },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      return {
        ok: true,
        json: async () => url.endsWith('/v1/verify-otp') ? { token: 'test-token' } : { centers: [] },
      };
    },
  };
  const native = { Platform: { OS: 'web' } };
  const drawer = loadModule('../../../packages/drawer/src/api.ts', {
    'react-native': native,
    'expo-secure-store': {},
  }, globals);
  const app = loadModule('./api.ts', { 'react-native': native, '@saicommons/drawer': drawer }, globals);
  drawer.configureApi(app.apiConfig);
  return { app, drawer, calls, storage };
}

test('drawer and app requests share the configured client and session token', async () => {
  const { app, drawer, calls, storage } = createClients();

  await drawer.login('user@example.test');
  assert.equal(calls[0].url, 'https://api.example.test/v1/login');
  assert.equal(calls[0].headers['x-api-key'], 'test-client-key');

  const result = await drawer.verifyOtp('user@example.test', '123456');
  assert.equal(calls[1].url, 'https://api.example.test/v1/verify-otp');
  await drawer.setToken(result.token);
  await app.api.centers();
  assert.equal(calls[2].headers.authorization, 'Bearer test-token');

  await app.setToken(null);
  assert.equal(drawer.getToken(), null);
  storage.set('token', 'restored-token');
  await app.loadToken();
  await app.api.centers();
  assert.equal(calls[3].headers.authorization, 'Bearer restored-token');
});

test('drawer reports missing client configuration instead of sending a request', async () => {
  const { drawer, calls } = createClients('');
  await assert.rejects(drawer.login('user@example.test'), /API configuration requires an API key/);
  assert.equal(calls.length, 0);
});

test('shared management requests use the configured API and authenticated session', async () => {
  const { drawer, calls } = createClients();
  await drawer.setToken('test-token');
  const center = { name: 'Center', badge_text_color: '#112233', editor_ids: [] };
  const user = { name: 'User', gender: null, is_admin: false, associated_centers: [1], editor_for: [] };

  await drawer.api.saveCenter(null, center);
  await drawer.api.saveCenter(1, center);
  await drawer.api.deleteCenter(1);
  await drawer.api.saveUser(null, user);
  await drawer.api.saveUser('user-1', user);
  await drawer.api.deleteUser('user-1');

  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ['https://api.example.test/v1/centers', 'POST'],
    ['https://api.example.test/v1/centers/1', 'PUT'],
    ['https://api.example.test/v1/centers/1', 'DELETE'],
    ['https://api.example.test/v1/admin/users', 'POST'],
    ['https://api.example.test/v1/admin/users/user-1', 'PUT'],
    ['https://api.example.test/v1/admin/users/user-1', 'DELETE'],
  ]);
  assert.ok(calls.every(({ headers }) => headers.authorization === 'Bearer test-token' && headers['x-api-key'] === 'test-client-key'));
  assert.deepEqual(JSON.parse(calls[0].body), center);
  assert.deepEqual(JSON.parse(calls[3].body), user);
});
