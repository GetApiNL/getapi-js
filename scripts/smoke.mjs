// Rooktest op het gebouwde pakket. Draait op elke ondersteunde Node-versie (18 en hoger),
// zonder testframework, en controleert zowel de ESM- als de CommonJS-uitvoer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esm = await import('../dist/index.js');
const cjs = require('../dist/index.cjs');

function mockFetch(status, body, headers = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  };
  return { calls, fn };
}

for (const [name, lib] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  const { calls, fn } = mockFetch(200, { naam: 'Voorbeeld' }, { 'X-Credits-Remaining': '42' });
  const client = new lib.GetApi({ apiKey: 'ga_live_smoke', fetch: fn });

  const res = await client.kvk.get('53743792');
  assert.equal(res.data.naam, 'Voorbeeld', `${name}: data`);
  assert.equal(res.creditsRemaining, 42, `${name}: credits`);
  assert.equal(calls[0].url, 'https://api.getapi.nl/v1/kvk/53743792', `${name}: url`);
  assert.equal(calls[0].init.headers['X-Api-Key'], 'ga_live_smoke', `${name}: key`);

  assert.throws(() => client.kvk.get('123'), lib.InvalidArgumentError, `${name}: invoer`);

  const failing = new lib.GetApi({ apiKey: 'k', fetch: mockFetch(404, { message: 'weg' }).fn });
  await assert.rejects(failing.kvk.get('53743792'), lib.NotFoundError, `${name}: 404`);

  // Een eigen AbortSignal naast de time-out moet ook werken op Node-versies zonder AbortSignal.any.
  const controller = new AbortController();
  const received = [];
  const signalled = new lib.GetApi({
    apiKey: 'k',
    fetch: async (_url, init) => {
      received.push(init.signal);
      return new Response('{}', { status: 200 });
    },
  });
  await signalled.lookup.ip('1.1.1.1', { signal: controller.signal });
  assert.ok(received[0] instanceof AbortSignal, `${name}: signaal doorgegeven`);
  assert.equal(received[0].aborted, false, `${name}: signaal nog niet afgebroken`);
  controller.abort();
  assert.equal(received[0].aborted, true, `${name}: signaal volgt de aanroeper`);

  const hanging = new lib.GetApi({
    apiKey: 'k',
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
  });
  const abortable = new AbortController();
  const pending = hanging.lookup.ip('1.1.1.1', { signal: abortable.signal });
  abortable.abort();
  await assert.rejects(pending, lib.ConnectionError, `${name}: afgebroken aanroep`);
}

assert.equal(esm.VERSION, cjs.VERSION);
console.log(`Rooktest geslaagd op Node ${process.versions.node} (ESM en CommonJS).`);
