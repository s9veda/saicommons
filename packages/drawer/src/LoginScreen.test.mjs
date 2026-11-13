import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./LoginScreen.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const element = (type, props) => ({ type, props });
const dependencies = {
  react: { useState: (initial) => [initial, () => {}] },
  'react/jsx-runtime': { jsx: element, jsxs: element },
  'react-native': { View: 'View', Text: 'Text' },
  'lucide-react-native': { CircleUserRound: 'CircleUserRound', LogIn: 'LogIn' },
  './api': { ApiError: Error },
  './Button': { Button: 'Button' },
  './ErrorText': { ErrorText: 'ErrorText' },
  './Field': { Field: 'Field' },
  './Context': { DrawerThemeProvider: 'DrawerThemeProvider', useDrawerTheme: () => ({}) },
  './theme': { createTheme: (theme) => theme },
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

test('sign-in description is optional and supplied by the host', () => {
  const defaultTree = walk(exports.LoginScreen({ onSignedIn() {} }));
  assert.equal(defaultTree.some((item) => typeof item === 'string' && item.includes('administrator')), false);
  assert.ok(defaultTree.some((item) => item?.type === 'Field' && item.props.label === 'Email'));
  assert.ok(defaultTree.some((item) => item?.type === 'Button' && item.props.title === 'Send sign-in code'));

  const customTree = walk(exports.LoginScreen({ onSignedIn() {}, signedOutDescription: 'Host description' }));
  assert.ok(customTree.includes('Host description'));
});
