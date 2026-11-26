import { GetApi } from '../src/index.js';

export interface Call {
  url: string;
  init: RequestInit;
}

export function mock(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const payload = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(
      new Response(payload, { status, headers: { 'Content-Type': 'application/json', ...headers } }),
    );
  }) as unknown as typeof fetch;
  return { calls, client: new GetApi({ apiKey: 'ga_live_test', fetch: fetchFn }) };
}

export const headersOf = (call: Call) => call.init.headers as Record<string, string>;
