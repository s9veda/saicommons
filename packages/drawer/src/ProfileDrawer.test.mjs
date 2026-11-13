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
      visible: true, user: isAdmin === null ? null : { ...user, is_admin: isAdmin, editor_for: [] }, enableManagement,
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

test('editors can manage users but not centers', () => {
  const drawer = createDrawer();
  const actions = (editorFor) => drawer(false, true, { user: { ...user, is_admin: false, editor_for: editorFor } })
    .filter((item) => item?.type === 'management').map((item) => item.props.section);
  assert.deepEqual(actions([]), []);
  assert.deepEqual(actions([1]), ['users']);
});

test('management sections are independently permission-gated', () => {
  const { canManageManagementSection } = load('./ManagementView.tsx', {
    react: {}, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': {}, 'lucide-react-native': { ArrowLeft: 'ArrowLeft' },
    './api': {}, './types': {}, './CentersScreen': {}, './UsersScreen': {},
    './Context': { useDrawerTheme: () => ({}) },
  });
  const editor = { ...user, is_admin: false, editor_for: [1] };
  assert.equal(canManageManagementSection('users', editor), true);
  assert.equal(canManageManagementSection('centers', editor), false);
  assert.equal(canManageManagementSection('users', { ...editor, editor_for: [] }), false);
});

test('editors can only edit non-admin users with nonempty centers entirely in their scope', () => {
  const { canEditUser, validateUserInput } = load('./UsersScreen.tsx', {
    react: { useMemo: (callback) => callback(), useState: () => [null, () => {}] },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': {},
    './api': { ApiError: Error, GENDERS: [], api: {} },
    './managementUi': {},
  });
  const editor = { ...user, is_admin: false, editor_for: [1, 2] };
  assert.equal(canEditUser({ ...user, is_admin: false, associated_centers: [1, 2] }, editor), true);
  assert.equal(canEditUser({ ...user, is_admin: true, associated_centers: [1] }, editor), false);
  assert.equal(canEditUser({ ...user, is_admin: false, associated_centers: [] }, editor), false);
  assert.equal(canEditUser({ ...user, is_admin: false, associated_centers: [1, 3] }, editor), false);
  assert.equal(validateUserInput({ name: 'A & B', email: '', isAdmin: false, member: new Set([1]), editor: new Set() }), '');
  assert.match(validateUserInput({ name: 'A & ', email: '', isAdmin: false, member: new Set([1]), editor: new Set() }), /two nonempty names/);
  assert.match(validateUserInput({ name: 'A & B', email: 'pair@example.test', isAdmin: false, member: new Set([1]), editor: new Set() }), /cannot have an email/);
  assert.match(validateUserInput({ name: 'A & B', email: '', isAdmin: true, member: new Set([1]), editor: new Set() }), /cannot be administrators or editors/);
  assert.match(validateUserInput({ name: 'A & B', email: '', isAdmin: false, member: new Set([1]), editor: new Set([1]) }), /cannot be administrators or editors/);
  assert.match(validateUserInput({ name: 'A & B', email: '', isAdmin: false, member: new Set(), editor: new Set() }), /at least one center/);
  assert.match(validateUserInput({ name: 'Solo', email: '', isAdmin: true, member: new Set([1]), editor: new Set() }), /must have an email/);
  assert.match(validateUserInput({ name: 'Solo', email: '', isAdmin: false, member: new Set([1]), editor: new Set([1]) }), /must have an email/);
  assert.match(validateUserInput({ name: 'Solo', email: 'solo@example.test', isAdmin: false, member: new Set(), editor: new Set() }), /at least one center/);
});

function usersScreen(platform, account, centers, confirmAction, search = '') {
  let stateIndex = 0;
  const { UsersScreen } = load('./UsersScreen.tsx', {
    react: { useMemo: (callback) => callback(), useState: (initial) => [stateIndex++ === 1 ? search : initial, () => {}] },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { FlatList: 'FlatList', Platform: { OS: platform }, Text: 'Text', View: 'View' },
    './api': { ApiError: Error, GENDERS: [], api: {} },
    './managementUi': {
      useManagementTheme: () => ({ managementStyles: {} }),
      AddButton: 'AddButton', Badge: 'Badge', Chip: 'Chip', ErrorText: 'ErrorText',
      ManagementHeader: 'ManagementHeader', ManagementSearch: 'ManagementSearch',
      RowActions: 'RowActions', confirmAction,
    },
  });
  return UsersScreen({ users: [account], centers, me: { ...user, is_admin: true }, reload: async () => {} });
}

test('center filters scroll with the user list on web and native', () => {
  const centers = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Center ${i + 1}` }));
  for (const platform of ['web', 'ios', 'android']) {
    const tree = usersScreen(platform, user, centers, async () => false);
    const list = walk(tree).find((item) => item?.type === 'FlatList');
    const filters = walk(list.props.ListHeaderComponent).filter((item) => item?.type === 'Chip');
    assert.ok(filters.some((chip) => chip.props.label === 'Center 40'));
    assert.ok(filters.some((chip) => chip.props.label === 'All centers'));
    assert.equal(walk(tree).some((item) => item?.type === 'Chip'), false);
  }
});

test('delete confirmation describes users without email', () => {
  const messages = [];
  for (const [email, expected] of [[null, 'no email address'], ['', 'no email address'], ['test@example.test', 'test@example.test']]) {
    const account = { ...user, email };
    const tree = usersScreen('web', account, [], (message) => { messages.push(message); return Promise.resolve(false); });
    const list = walk(tree).find((item) => item?.type === 'FlatList');
    const actions = walk(list.props.renderItem({ item: account })).find((item) => item?.type === 'RowActions');
    actions.props.onDelete();
    assert.equal(messages.at(-1), `Delete Test (${expected})?`);
  }
});

test('missing email displays a fallback and does not match a search for null', () => {
  const account = { ...user, email: null };
  const listFor = (search) => walk(usersScreen('web', account, [], async () => false, search))
    .find((item) => item?.type === 'FlatList');
  const row = listFor('').props.renderItem({ item: account });
  assert.ok(walk(row).includes('No email'));
  assert.equal(listFor('null').props.data.length, 0);
  assert.equal(listFor('test').props.data.length, 1);
  const namedNull = walk(usersScreen('web', { ...account, name: 'Nulla' }, [], async () => false, 'null'))
    .find((item) => item?.type === 'FlatList');
  assert.equal(namedNull.props.data.length, 1);
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
