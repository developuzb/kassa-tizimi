const test = require('node:test');
const assert = require('node:assert');
const { esc, Security } = require('../js/utils.js');

test('esc HTML belgilarini zararsizlantiradi', () => {
  assert.strictEqual(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(esc('a & b'), 'a &amp; b');
  assert.strictEqual(esc('"qo\'sh"'), '&quot;qo&#39;sh&quot;');
});

test('esc null/undefined ni bo\'sh satrga aylantiradi', () => {
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
  assert.strictEqual(esc(0), '0');
});

test('Security.make har safar boshqa salt beradi', async () => {
  const a = await Security.make('1234');
  const b = await Security.make('1234');
  assert.notStrictEqual(a.salt, b.salt);
  assert.notStrictEqual(a.hash, b.hash);
});

test('Security.verify to\'g\'ri parolni tasdiqlaydi, noto\'g\'risini rad etadi', async () => {
  const rec = await Security.make('admin123');
  assert.strictEqual(await Security.verify('admin123', rec), true);
  assert.strictEqual(await Security.verify('boshqa', rec), false);
  assert.strictEqual(await Security.verify('admin123', null), false);
});
