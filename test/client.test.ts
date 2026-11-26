import { describe, expect, it } from 'vitest';
import {
  ApiError,
  AuthError,
  ConnectionError,
  CreditsExhaustedError,
  GetApi,
  InvalidArgumentError,
  NotFoundError,
  RateLimitError,
  UpstreamUnavailableError,
  ValidationError,
  VERSION,
} from '../src/index.js';
import { headersOf, mock, type Call } from './helpers.js';

describe('client', () => {
  it('weigert een lege key', () => {
    expect(() => new GetApi({ apiKey: ' ' })).toThrow(InvalidArgumentError);
    expect(() => new GetApi({} as never)).toThrow(InvalidArgumentError);
  });

  it('geeft een duidelijke fout zonder fetch', () => {
    const original = globalThis.fetch;
    try {
      // @ts-expect-error fetch wordt hier bewust verwijderd
      delete globalThis.fetch;
      expect(() => new GetApi({ apiKey: 'k' })).toThrow(/fetch/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('stuurt key en client-headers mee', async () => {
    const { calls, client } = mock(200, { naam: 'X' }, { 'X-Credits-Remaining': '248' });
    const res = await client.kvk.get('53743792');
    expect(res.data.naam).toBe('X');
    expect(res.creditsRemaining).toBe(248);
    expect(calls[0]!.url).toBe('https://api.getapi.nl/v1/kvk/53743792');
    expect(headersOf(calls[0]!)['X-Api-Key']).toBe('ga_live_test');
    expect(headersOf(calls[0]!)['X-GetAPI-Client']).toBe(`getapi-js/${VERSION}`);
    expect(headersOf(calls[0]!)['User-Agent']).toMatch(/^getapi-js\/\d+\.\d+\.\d+ \(node\//);
  });

  it('gebruikt een eigen baseUrl zonder dubbele slash', async () => {
    const calls: Call[] = [];
    const client = new GetApi({
      apiKey: 'k',
      baseUrl: 'https://staging.example.test/',
      fetch: ((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as unknown as typeof fetch,
    });
    await client.lookup.ip('1.1.1.1');
    expect(calls[0]!.url).toBe('https://staging.example.test/v1/lookup/ip?ip=1.1.1.1');
  });

  it('eigen clientName verschijnt in de header', async () => {
    const calls: Call[] = [];
    const client = new GetApi({
      apiKey: 'k',
      clientName: 'mijn-app/2.1',
      fetch: ((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as unknown as typeof fetch,
    });
    await client.lookup.ip('1.1.1.1');
    expect(headersOf(calls[0]!)['X-GetAPI-Client']).toBe('mijn-app/2.1');
  });

  it('creditsRemaining is null zonder of met ongeldige header', async () => {
    expect((await mock(200, {}).client.lookup.ip('8.8.8.8')).creditsRemaining).toBeNull();
    expect(
      (await mock(200, {}, { 'X-Credits-Remaining': 'veel' }).client.lookup.ip('8.8.8.8')).creditsRemaining,
    ).toBeNull();
  });

  it('laat null en lege queryparameters weg', async () => {
    const { calls, client } = mock(200, {});
    await client.kvk.search({ naam: ' bol ', page: 2 });
    expect(calls[0]!.url).toBe('https://api.getapi.nl/v1/kvk/search?naam=bol&page=2');
  });

  it('stuurt een Idempotency-Key mee', async () => {
    const { calls, client } = mock(200, {});
    await client.property.wozValue({ postcode: '3023KN', houseNumber: 161 }, { idempotencyKey: 'abc' });
    expect(headersOf(calls[0]!)['Idempotency-Key']).toBe('abc');
    expect(calls[0]!.url).toContain('/v1/property/woz-waarde?postcode=3023KN&house_number=161');
  });

  it('post stuurt JSON', async () => {
    const { calls, client } = mock(200, { valid: true });
    await client.validation.vat('NL 820646660 B01');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ vat_number: 'NL820646660B01' });
    expect(headersOf(calls[0]!)['Content-Type']).toBe('application/json');
  });

  it('accepteert een leeg antwoord', async () => {
    const { client } = mock(200, null);
    expect((await client.lookup.ip('1.1.1.1')).data).toBeNull();
  });
});

describe('foutafhandeling', () => {
  it('422 bij een controle is een antwoord', async () => {
    const { client } = mock(422, { valid: false });
    const res = await client.validation.vat('NL000');
    expect(res.data.valid).toBe(false);
    expect(res.status).toBe(422);
  });

  it('422 elders is een ValidationError', async () => {
    const { client } = mock(422, { message: 'fout', errors: { q: ['te kort'] } });
    await expect(client.kvk.search({ naam: 'x' })).rejects.toMatchObject({ errors: { q: ['te kort'] } });
    await expect(client.kvk.search({ naam: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('422 zonder errors geeft een lege lijst', async () => {
    const { client } = mock(422, {});
    await expect(client.kvk.search({ naam: 'x' })).rejects.toMatchObject({ errors: {} });
  });

  it.each([
    [401, AuthError],
    [403, AuthError],
    [404, NotFoundError],
    [503, UpstreamUnavailableError],
    [500, ApiError],
  ])('status %i geeft de juiste fout', async (status, cls) => {
    const { client } = mock(status, { message: 'x' });
    await expect(client.kvk.get('53743792')).rejects.toBeInstanceOf(cls);
  });

  it('foutklassen hebben een herkenbare naam en status', async () => {
    const { client } = mock(404, { message: 'Bestaat niet', error: 'not_found' });
    const err = (await client.kvk.get('53743792').catch((e: unknown) => e)) as NotFoundError;
    expect(err.name).toBe('NotFoundError');
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('Bestaat niet');
  });

  it('een foutstatus zonder JSON-body geeft toch een ApiError', async () => {
    const { client } = mock(502, '<html>Bad gateway</html>');
    await expect(client.kvk.get('53743792')).rejects.toMatchObject({ status: 502 });
  });

  it('402 geeft topupUrl', async () => {
    const { client } = mock(
      402,
      { error: 'insufficient_credits', topup_url: 'https://getapi.nl/topup' },
      { 'X-Credits-Remaining': '0' },
    );
    const err = (await client.kvk.get('53743792').catch((e: unknown) => e)) as CreditsExhaustedError;
    expect(err).toBeInstanceOf(CreditsExhaustedError);
    expect(err.topupUrl).toBe('https://getapi.nl/topup');
    expect(err.code).toBe('insufficient_credits');
  });

  it('429 leest Retry-After uit header, anders body', async () => {
    const a = (await mock(429, { retry_after: 9 }, { 'Retry-After': '30', 'X-RateLimit-Reset': '1700000000' })
      .client.kvk.get('53743792')
      .catch((e: unknown) => e)) as RateLimitError;
    expect(a).toBeInstanceOf(RateLimitError);
    expect(a.retryAfter).toBe(30);
    expect(a.resetAt).toBe(1700000000);

    const b = (await mock(429, { retry_after: 9 })
      .client.kvk.get('53743792')
      .catch((e: unknown) => e)) as RateLimitError;
    expect(b.retryAfter).toBe(9);
    expect(b.resetAt).toBeNull();
  });

  it('netwerkfout wordt ConnectionError met oorzaak', async () => {
    const cause = new TypeError('fetch failed');
    const client = new GetApi({ apiKey: 'k', fetch: () => Promise.reject(cause) });
    const err = (await client.kvk.get('53743792').catch((e: unknown) => e)) as ConnectionError;
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.cause).toBe(cause);
  });

  it('ongeldige JSON bij 200 wordt ApiError', async () => {
    const { client } = mock(200, 'geen json');
    await expect(client.kvk.get('53743792')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('time-out en afbreken', () => {
  const hanging = (timeoutMs = 15000) =>
    new GetApi({
      apiKey: 'k',
      timeoutMs,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal!;
          const fail = () => reject(signal.reason as Error);
          if (signal.aborted) fail();
          else signal.addEventListener('abort', fail, { once: true });
        })) as unknown as typeof fetch,
    });

  it('een time-out wordt ConnectionError', async () => {
    const err = (await hanging(20)
      .lookup.ip('1.1.1.1')
      .catch((e: unknown) => e)) as ConnectionError;
    expect(err).toBeInstanceOf(ConnectionError);
    expect(err.message).toMatch(/geen antwoord/);
  });

  it('een eigen AbortSignal breekt de aanroep af', async () => {
    const controller = new AbortController();
    const pending = hanging().lookup.ip('1.1.1.1', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ConnectionError);
  });

  it('een al afgebroken signaal breekt direct af', async () => {
    await expect(hanging().lookup.ip('1.1.1.1', { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      ConnectionError,
    );
  });

  it('werkt ook zonder AbortSignal.any', async () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
    try {
      // @ts-expect-error AbortSignal.any ontbreekt op Node 18 en wordt hier nagebootst
      delete AbortSignal.any;
      const controller = new AbortController();
      const pending = hanging().lookup.ip('1.1.1.1', { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(ConnectionError);

      await expect(hanging().lookup.ip('1.1.1.1', { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
        ConnectionError,
      );
      await expect(hanging(20).lookup.ip('1.1.1.1', { signal: new AbortController().signal })).rejects.toThrow(
        /geen antwoord/,
      );
    } finally {
      Object.defineProperty(AbortSignal, 'any', original);
    }
  });
});
