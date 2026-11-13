import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./ui.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

for (const platform of ['ios', 'android']) {
  test(`management headings have top clearance on ${platform}`, () => {
    const exports = {};
    vm.runInNewContext(compiled, {
      exports,
      require: (name) => {
        if (name === 'react-native') return { StyleSheet: { create: (styles) => styles }, Platform: { OS: platform } };
        throw new Error(`Unexpected dependency: ${name}`);
      },
    });
    const styles = exports.createStyles({});
    assert.ok(styles.managementHeaderInner.paddingTop + (styles.managementHeading.marginTop ?? 0) >= 8);
    assert.equal(styles.managementHeading.height, undefined);
    assert.equal(styles.managementHeading.maxHeight, undefined);
  });
}
