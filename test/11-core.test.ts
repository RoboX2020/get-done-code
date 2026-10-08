import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, parseCriteria, linesAdded, addLines, addSave, addActive, applyGithub, nextImage, isHttpsImage } from '../src/core';

test('parseCriteria drops junk, floors every', () => {
  assert.deepEqual(parseCriteria([{ type: 'lines', every: 100.7 }, { type: 'x' }, { type: 'lines', every: 0 }, { type: 'github' }, null]), [{ type: 'lines', every: 100 }, { type: 'github' }]);
  assert.deepEqual(parseCriteria('nope'), []);
});
test('linesAdded counts typed newlines, not replaced ones or deletes', () => {
  assert.equal(linesAdded('a\nb\nc', 0), 2);
  assert.equal(linesAdded('a\nb', 1), 0);
  assert.equal(linesAdded('', 3), 0);
  assert.equal(linesAdded('\n'.repeat(5000), 0), 200);
});
test('every 100 lines gives a reward and carries remainder', () => {
  const s = emptyState(); const c = parseCriteria([{ type: 'lines', every: 100 }]);
  assert.equal(addLines(s, c, 60), 0);
  assert.equal(addLines(s, c, 60), 1);
  assert.equal(s.lines, 20);
  assert.equal(addLines(s, c, 250), 2);
  assert.equal(s.lines, 70);
});
test('saves and minutes', () => {
  const s = emptyState(); const c = parseCriteria([{ type: 'saves', every: 2 }, { type: 'minutes', every: 1 }]);
  assert.equal(addSave(s, c), 0); assert.equal(addSave(s, c), 1);
  assert.equal(addActive(s, c, 90000), 1); assert.equal(s.activeMs, 30000);
});
test('github reward once per day, only with contributions', () => {
  const s = emptyState(); const c = parseCriteria([{ type: 'github' }]);
  assert.equal(applyGithub(s, c, '2026-10-08', 0), 0);
  assert.equal(applyGithub(s, c, '2026-10-08', 3), 1);
  assert.equal(applyGithub(s, c, '2026-10-08', 9), 0);
  assert.equal(applyGithub(s, c, '2026-10-09', 1), 1);
  assert.equal(applyGithub(s, [], '2026-10-10', 1), 0);
});
test('images cycle in order, https only', () => {
  const s = emptyState(); const imgs = ['https://a/1.png', 'http://bad/2.png', 'https://a/3.png'];
  assert.equal(nextImage(s, imgs), 'https://a/1.png');
  assert.equal(nextImage(s, imgs), 'https://a/3.png');
  assert.equal(nextImage(s, imgs), 'https://a/1.png');
  assert.equal(nextImage(emptyState(), []), undefined);
  assert.equal(isHttpsImage('javascript:alert(1)'), false);
});
