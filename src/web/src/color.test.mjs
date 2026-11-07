import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hexToRgb, rgbToHex } from './color.ts';

test('color picker converts RGB channels to API-compatible hex and back', () => {
  assert.deepEqual(hexToRgb('#1e40af'), [30, 64, 175]);
  assert.deepEqual(hexToRgb('#FFFFFF'), [255, 255, 255]);
  assert.equal(hexToRgb('#fff'), null);
  assert.equal(hexToRgb('invalid'), null);
  assert.equal(rgbToHex([0, 15, 255]), '#000fff');
  assert.equal(rgbToHex(hexToRgb('#1e40af')), '#1e40af');
});
