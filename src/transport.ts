import {
  ApiError,
  AuthError,
  ConnectionError,
  CreditsExhaustedError,
  NotFoundError,
  RateLimitError,
  UpstreamUnavailableError,
  ValidationError,
} from './errors.js';
import type { GetApiError } from './errors.js';

/** Een antwoord van de API. */
export interface GetApiResponse<T = any> {
  /** De geparste JSON-body. */
  data: T;
  /** HTTP-statuscode. */
  status: number;
  /** Resterende credits volgens de header `X-Credits-Remaining`, als die is meegestuurd. */
  creditsRemaining: number | null;
  /** Alle responseheaders. */
  headers: Headers;
}

/** Opties voor één aanroep. */
export interface RequestOptions {
  /**
   * Idempotency-Key voor aanroepen die credits kosten. Dezelfde key binnen 10 minuten geeft
   * hetzelfde antwoord en rekent hooguit één keer af.
   */
  idempotencyKey?: string;
  /** Een AbortSignal om de aanroep af te breken. */
  signal?: AbortSignal;
}

export interface TransportConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  fetch: typeof fetch;
  clientHeader: string;
  userAgent: string | null;
}

/** Combineert signalen zonder `AbortSignal.any`, dat pas vanaf Node 20.3 bestaat. */
function combineSignals(timeout: AbortSignal, external?: AbortSignal): AbortSignal {
  if (!external) return timeout;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeout, external]);

  const controller = new AbortController();
  const abort = (source: AbortSignal) => () => controller.abort(source.reason);
  for (const source of [timeout, external]) {
    if (source.aborted) {
      controller.abort(source.reason);
      break;
    }
    source.addEventListener('abort', abort(source), { once: true });
  }
  return controller.signal;
}

type Query = Record<string, string | number | boolean | (string | number)[] | null | undefined>;

export class Transport {
  constructor(private readonly config: TransportConfig) {}

  get<T = any>(path: string, query: Query = {}, options: RequestOptions = {}): Promise<GetApiResponse<T>> {
    return this.send<T>('GET', path, query, undefined, false, options);
  }

  /**
   * @param invalidIsAnswer Bij true is een 422 een gewoon antwoord (`valid: false`) en geen fout.
   */
  post<T = any>(
    path: string,
    body: unknown,
    invalidIsAnswer = false,
    options: RequestOptions = {},
  ): Promise<GetApiResponse<T>> {
    return this.send<T>('POST', path, {}, body, invalidIsAnswer, options);
  }

  private async send<T>(
    method: 'GET' | 'POST',
    path: string,
    query: Query,
    body: unknown,
    invalidIsAnswer: boolean,
    options: RequestOptions,
  ): Promise<GetApiResponse<T>> {
    const url = this.config.baseUrl.replace(/\/+$/, '') + path + this.queryString(query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Api-Key': this.config.apiKey,
      'X-GetAPI-Client': this.config.clientHeader,
    };
    if (this.config.userAgent) headers['User-Agent'] = this.config.userAgent;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const signal = combineSignals(AbortSignal.timeout(this.config.timeoutMs), options.signal);

    let res: Response;
    try {
      res = await this.config.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
      throw new ConnectionError(
        timedOut
          ? `De GetAPI-server gaf binnen ${Math.round(this.config.timeoutMs / 1000)} seconden geen antwoord.`
          : 'Kan GetAPI niet bereiken. Controleer je internetverbinding.',
        { cause },
      );
    }

    const text = await res.text();
    let data: any = null;
    if (text !== '') {
      try {
        data = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiError('GetAPI gaf een antwoord dat geen geldige JSON is.', res.status, text);
      }
    }

    if (res.ok || (res.status === 422 && invalidIsAnswer)) {
      const remaining = res.headers.get('X-Credits-Remaining');
      return {
        data: data as T,
        status: res.status,
        creditsRemaining:
          remaining !== null && remaining !== '' && !Number.isNaN(Number(remaining)) ? Number(remaining) : null,
        headers: res.headers,
      };
    }

    throw this.toError(res, data);
  }

  private toError(res: Response, data: any): GetApiError {
    const status = res.status;
    const code: string | null =
      typeof data?.error === 'string' ? data.error : typeof data?.code === 'string' ? data.code : null;
    const apiMessage: string | null = typeof data?.message === 'string' ? data.message : null;

    switch (true) {
      case status === 401 || status === 403:
        return new AuthError(
          apiMessage ?? 'De API-key is ongeldig of heeft geen toegang tot dit endpoint.',
          status,
          data,
          code,
        );
      case status === 402: {
        const topupUrl: string | null = typeof data?.topup_url === 'string' ? data.topup_url : null;
        return new CreditsExhaustedError(
          'Je credits zijn op. Vul je saldo aan om door te gaan.',
          status,
          data,
          code,
          topupUrl,
        );
      }
      case status === 404:
        return new NotFoundError(apiMessage ?? 'Niet gevonden.', status, data, code);
      case status === 422: {
        const errors: Record<string, string[]> = data?.errors && typeof data.errors === 'object' ? data.errors : {};
        return new ValidationError(apiMessage ?? 'De invoer is ongeldig.', status, data, code, errors);
      }
      case status === 429: {
        const header = res.headers.get('Retry-After');
        const fromHeader = header !== null && header !== '' && !Number.isNaN(Number(header)) ? Number(header) : null;
        const fromBody: number | null = typeof data?.retry_after === 'number' ? data.retry_after : null;
        const reset = res.headers.get('X-RateLimit-Reset');
        return new RateLimitError(
          'Te veel verzoeken. Probeer het later opnieuw.',
          status,
          data,
          code,
          fromHeader ?? fromBody,
          reset !== null && reset !== '' && !Number.isNaN(Number(reset)) ? Number(reset) : null,
        );
      }
      case status === 503:
        return new UpstreamUnavailableError(
          apiMessage ?? 'De bron achter deze API is tijdelijk niet beschikbaar.',
          status,
          data,
          code,
        );
      default:
        return new ApiError(apiMessage ?? `GetAPI gaf een onverwachte fout (HTTP ${status}).`, status, data, code);
    }
  }

  private queryString(query: Query): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value)) {
        for (const item of value) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }
}
