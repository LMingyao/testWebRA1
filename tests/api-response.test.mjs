import test from 'node:test';
import assert from 'node:assert/strict';
import { readAPIResponse } from '../app/api-response.js';
import { D1Store } from '../admin/d1-store.js';
import { fixture } from './fixture.mjs';

test('edge HTML, malformed JSON and size errors retain actionable status without exposing markup', async () => {
  for (const [status, type, body, retryable] of [
    [503, 'text/html', '<!DOCTYPE html><h1>Service unavailable</h1>', true],
    [413, 'text/html', '<html>Too large</html>', false],
    [403, 'text/html', '<html>Forbidden</html>', false],
    [200, 'application/json', '<!DOCTYPE html>', true],
    [200, 'application/json', 'null', true],
  ]) {
    await assert.rejects(readAPIResponse(new Response(body, {status, headers:{'Content-Type':type}})), error =>
      error.status === status && error.retryable === retryable && !error.message.includes('<') && !error.message.includes('Unexpected token'));
  }
  assert.deepEqual(await readAPIResponse(Response.json({revision:'current'})), {revision:'current'});
});

test('expired sessions and conflicts remain non-retryable while login errors retain their message', async () => {
  await assert.rejects(readAPIResponse(Response.json({error:'Wrong password'}, {status:401})), /Wrong password/);
  await assert.rejects(readAPIResponse(Response.json({}, {status:401}), {session:true}), error =>
    /登录已过期/.test(error.message) && error.status === 401 && !error.retryable);
  await assert.rejects(readAPIResponse(Response.json({error:'Revision conflict'}, {status:409})), error =>
    error.message === 'Revision conflict' && error.status === 409 && !error.retryable);
});

test('a transient edge response retries the same media before content save, without premature completion', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [], events = [];
  let attempts = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({url, body:options.body});
    if (url.endsWith('media-batch') && ++attempts === 1)
      return new Response('<!DOCTYPE html>Temporary edge error', {status:503, headers:{'Content-Type':'text/html'}});
    return Response.json({revision:options.method === 'PUT' ? 'next' : 'current'});
  };
  const store = new D1Store({canUpload:true});
  const uploads = [{path:'media/photo-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-640.webp',base64:'YWJj'}];
  await store.save(fixture, 'current', uploads, event => events.push(event));
  assert.deepEqual(calls.map(call => call.url.split('/').at(-1)), ['content','media-batch','media-batch','content']);
  assert.equal(calls[1].body, calls[2].body);
  assert.deepEqual(events.filter(event => event.stage === 'upload').map(event => event.completed), [0,0,1]);
  assert.equal(events.at(-1).stage, 'done');
});
