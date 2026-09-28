import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openChromium } from '../lib/browser.ts';

test('an existing browser navigates its current tab', async () => {
  const actions = [];
  const result = await openChromium(async (action) => {
    actions.push(action);
    return { exit_code: 0, stdout: '{"reused":true}' };
  }, 'https://example.com');
  assert.equal(result.reused, true);
  assert.deepEqual(actions.slice(1), [
    { action: 'key', key: 'ctrl-l' },
    { action: 'type', text: 'https://example.com' },
    { action: 'key', key: 'enter' },
  ]);
  assert.ok(!actions[0].command.includes('--new-window'));
});

test('focusing an existing browser without a URL leaves the current page intact', async () => {
  const actions = [];
  await openChromium(async (action) => {
    actions.push(action);
    return { exit_code: 0, stdout: '{"reused":true}' };
  });
  assert.equal(actions.length, 1);
});

test('a new browser gets its URL at launch and launch errors do not trigger typing', async () => {
  const actions = [];
  const run = async (action) => { actions.push(action); return { exit_code: 0, stdout: '{"reused":false}' }; };
  await openChromium(run, 'https://example.com');
  assert.equal(actions.length, 1);
  const failed = await openChromium(async () => ({ exit_code: 127, stderr: 'Chromium is not installed.' }));
  assert.equal(failed.opened, false);
  assert.match(failed.error, /not installed/);
});
