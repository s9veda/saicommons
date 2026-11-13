import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8') + '\nexport { AdminApp };';
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const element = (type, props) => ({ type, props });
const user = { id: '1', name: 'Test Admin', is_admin: true };
const react = {
  useState: (initial) => [initial === null ? user : initial === true ? false : initial, () => {}],
  useCallback: (callback) => callback,
  useEffect: () => {},
};
const dependencies = {
  react,
  'react/jsx-runtime': { jsx: element, jsxs: element },
  'expo-status-bar': { StatusBar: 'StatusBar' },
  'lucide-react-native': { LucideProvider: 'LucideProvider' },
  'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
  'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  './src/api': { apiConfig: {}, api: {} },
  '@saicommons/drawer': {
    Button: 'Button', ErrorText: 'ErrorText', ProfileButton: 'ProfileButton', ProfileDrawer: 'ProfileDrawer',
    defaultTheme: {}, configureApi() {}, createTheme: (theme) => theme,
  },
  './assets/sai.webp': 'sai-image',
  './assets/sai-values-logo-transparent.png': 'logo-image',
};
const exports = {};
vm.runInNewContext(compiled, { exports, require: (name) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
} });

function walk(node) {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!node || typeof node !== 'object') return [node];
  return [node, ...walk(node.props?.children)];
}

test('signed-in home shows status and keeps management in the profile drawer', () => {
  const tree = walk(exports.AdminApp());
  const welcome = tree.find((node) => node?.props?.children === 'Welcome to the Admin app. You are signed in.');
  assert.equal(welcome.props.accessibilityRole, 'header');
  assert.equal(welcome.props.style.textAlign, 'center');
  assert.equal(tree.some((node) => node?.props?.accessibilityRole === 'tablist'), false);
  const drawer = tree.find((node) => node?.type === 'ProfileDrawer');
  assert.equal(drawer.props.enableManagement, true);
  assert.equal(drawer.props.user, user);
  assert.equal(drawer.props.signedOutDescription, 'Sign in with an administrator account to manage centers and users.');
});
