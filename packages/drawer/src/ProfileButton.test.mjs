import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./ProfileButton.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const element = (type, props) => ({ type, props });
const dependencies = {
  react: {},
  'react/jsx-runtime': { jsx: element, jsxs: element },
  'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: (styles) => styles } },
  'lucide-react-native': { CircleUserRound: 'CircleUserRound' },
  './theme': { defaultTheme: { primary: '#000', white: '#fff' } },
};
const exports = {};
vm.runInNewContext(compiled, { exports, require: (name) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
} });

test('signing in keeps the profile button size while adding the status dot', () => {
  const signedOut = exports.ProfileButton({ user: null, onPress() {} });
  const signedIn = exports.ProfileButton({ user: {}, onPress() {} });
  const flatten = (style) => Object.assign({}, ...[style].flat().filter(Boolean));
  const before = flatten(signedOut.props.style);
  const after = flatten(signedIn.props.style);

  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.equal(after.position, before.position);
  assert.equal(signedOut.props.children[1], null);
  assert.equal(signedIn.props.children[1].type, 'View');
});
