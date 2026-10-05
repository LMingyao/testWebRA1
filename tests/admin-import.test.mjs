import test from 'node:test';
import assert from 'node:assert/strict';
import { bindWorkflow } from '../admin/workflow.js';
import { fixture } from './fixture.mjs';

test('backup import requires a connected idle editor throughout file reading', async t => {
  const previousDocument = globalThis.document, previousConfirm = globalThis.confirm;
  t.after(() => { globalThis.document = previousDocument; globalThis.confirm = previousConfirm; });
  let adapter = null, content = null, busy = false, picked = 0, read = 0, applied = 0, confirmed = 0;
  const notices = [], button = {}, input = { value: 'backup.json', click: () => picked++ };
  globalThis.document = { querySelector: selector => selector === '#import-backup' ? button : input };
  globalThis.confirm = () => { confirmed++; return true; };
  bindWorkflow({store: () => adapter, data: () => content, isBusy: () => busy,
    isDirty: () => false, notice: (...args) => notices.push(args), apply: value => { applied++; content = value; }});
  const file = { size: 100, text: async () => { read++; return JSON.stringify(fixture); } };
  const select = async selected => { input.files = [selected]; input.value = 'backup.json'; await input.onchange({target: input}); };

  button.onclick();
  await select(file);
  assert.equal(picked, 0);
  assert.equal(read, 0);
  assert.equal(applied, 0);
  assert.equal(confirmed, 0);
  assert.equal(input.value, '');
  assert.ok(notices.every(([message, error]) => message.includes('登录') && error));

  adapter = {mode: 'd1'};
  button.onclick();
  await select(file);
  assert.equal(read, 0, 'a session without loaded content cannot import');
  content = structuredClone(fixture);
  busy = true;
  button.onclick();
  await select(file);
  assert.equal(picked, 0);
  assert.equal(read, 0, 'saving blocks imports');

  busy = false;
  button.onclick();
  await select(file);
  assert.equal(picked, 1);
  assert.equal(applied, 1, 'authenticated import opens a draft');
  assert.equal(confirmed, 1);

  await select({size: 100, text: async () => { adapter = null; return JSON.stringify(fixture); }});
  assert.equal(applied, 1, 'disconnecting while reading must not replace the draft');
  adapter = {mode: 'd1'};
  await select({size: 100, text: async () => { adapter = {mode: 'd1'}; return JSON.stringify(fixture); }});
  assert.equal(applied, 1, 'changing connections while reading must not replace the draft');
  await select({size: 100, text: async () => { busy = true; return JSON.stringify(fixture); }});
  assert.equal(applied, 1, 'starting a save while reading must not replace the draft');
  assert.equal(confirmed, 1);
});
