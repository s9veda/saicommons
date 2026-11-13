import assert from 'node:assert/strict';
import { test } from 'node:test';
import { usersWithEmail } from './userFilters.ts';

test('only users with a non-blank email appear in the editor selector', () => {
  const users = [
    { id: 'one', email: 'user@example.org' },
    { id: 'two', email: null },
    { id: 'three', email: '' },
    { id: 'four', email: '   ' },
  ];
  assert.deepEqual(usersWithEmail(users), [users[0]]);
  assert.equal(users.length, 4);
});
