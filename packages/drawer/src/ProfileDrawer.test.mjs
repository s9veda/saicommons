import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const element = (type, props) => ({ type, props });
const user = { id: '1', name: 'Test', email: 'test@example.test', is_admin: false, editor_for: [1], associated_centers: [1] };

function load(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

function walk(node) {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!node || typeof node !== 'object') return [node];
  return [node, ...walk(node.props?.children)];
}

function createDrawer(management = null) {
  let stateIndex = 0;
  const react = {
    useState: (initial) => [stateIndex++ === 2 ? management : initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    useEffect: () => {},
  };
  class AnimatedValue {
    interpolate() { return 0; }
  }
  const native = {
    Animated: { Value: AnimatedValue }, Platform: { OS: 'android' },
    StyleSheet: { absoluteFill: {} }, useWindowDimensions: () => ({ width: 800 }),
    Modal: 'Modal', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView',
    SafeAreaView: 'LegacySafeAreaView', KeyboardAvoidingView: 'KeyboardAvoidingView',
  };
  const render = {
    renderDefaultHeader: () => null, renderUserIdentity: () => null,
    renderDefaultAccessSection: () => null, renderCenterAccessSection: () => null,
    renderSignOutButton: () => null, renderErrorText: () => null,
    renderManagementButton: (_styles, _colors, section) => element('management', { section }),
  };
  const { ProfileDrawer } = load('./ProfileDrawer.tsx', {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': native, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'ContextSafeAreaView' },
    './LoginScreen': { LoginScreen: 'LoginScreen' },
    './ui': { createColors: () => ({}) },
    './Context': { DrawerThemeProvider: 'DrawerThemeProvider', useDrawerTheme: () => ({}) },
    './theme': { createTheme: (theme) => theme },
    './DrawerStyles': { getDrawerStyles: () => ({}) },
    './api': { api: {}, ApiError: Error },
    './ManagementView': { ManagementView: 'ManagementView' },
    './DrawerRender': render,
  });
  return (isAdmin, enableManagement, props = {}) => {
    stateIndex = 0;
    return walk(ProfileDrawer({
      visible: true, user: isAdmin === null ? null : { ...user, is_admin: isAdmin }, enableManagement,
      onClose() {}, onSignedIn() {}, onSignOut() {},
      ...props,
    }));
  };
}

test('management actions are opt-in and limited to administrators', () => {
  const drawer = createDrawer();
  const actions = (isAdmin, enableManagement) => drawer(isAdmin, enableManagement)
    .filter((item) => item?.type === 'management').map((item) => item.props.section);

  assert.deepEqual(actions(true, true), ['centers', 'users']);
  assert.deepEqual(actions(false, true), []);
  assert.deepEqual(actions(true, false), []);
});

test('drawer passes the host description to its sign-in form', () => {
  const tree = createDrawer()(null, false, { signedOutDescription: 'Host description' });
  const login = tree.find((item) => item?.type === 'LoginScreen');
  assert.equal(login.props.signedOutDescription, 'Host description');
});

test('profile and management content respect native safe-area insets', () => {
  for (const section of [null, 'centers', 'users']) {
    const tree = createDrawer(section)(true, true);
    const safeArea = tree.find((item) => item?.type === 'ContextSafeAreaView');
    assert.ok(safeArea);
    assert.ok(safeArea.props.edges.includes('top'));
    assert.ok(safeArea.props.edges.includes('bottom'));
    assert.equal(tree.some((item) => item?.type === 'LegacySafeAreaView'), false);
  }
});

test('center access displays names, missing IDs, and admin access', () => {
  const native = { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View' };
  const { renderCenterAccessSection } = load('./DrawerRender.tsx', {
    react: {}, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': native,
    'lucide-react-native': { Building2: 'Building2' },
  });
  const text = (account) => walk(renderCenterAccessSection({}, {}, account, new Map([[1, 'Known Center']]), false, '', () => {}))
    .filter((item) => typeof item === 'string');

  assert.ok(text({ ...user, associated_centers: [1, 2] }).includes('Known Center, Center 2'));
  assert.ok(text({ ...user, is_admin: true }).includes('All centers'));
});
