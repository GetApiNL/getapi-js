/** Basisklasse voor alle fouten van de GetAPI-client. Vang deze om alles af te handelen. */
export class GetApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** De API is niet bereikt: netwerkfout, time-out of een verbroken verbinding. */
export class ConnectionError extends GetApiError {}

/** De API gaf een foutstatus. Bevat de HTTP-status en de teruggegeven body. */
export class ApiError extends GetApiError {
  constructor(
    message: string,
    /** HTTP-statuscode van het antwoord. */
    public readonly status: number,
    /** De (geparste) body van het antwoord, als die er was. */
    public readonly data: unknown = null,
    /** Foutcode uit de body, bijvoorbeeld `insufficient_credits`. */
    public readonly code: string | null = null,
  ) {
    super(message);
  }
}

/** 401 of 403: de API-key ontbreekt, is ongeldig of heeft geen toegang. */
export class AuthError extends ApiError {}

/** 402: je credits zijn op. Stuur de gebruiker naar `topupUrl` om bij te vullen. */
export class CreditsExhaustedError extends ApiError {
  constructor(
    message: string,
    status: number,
    data: unknown,
    code: string | null,
    public readonly topupUrl: string | null,
  ) {
    super(message, status, data, code);
  }
}

/** 404: het gevraagde item bestaat niet (bijvoorbeeld een onbekend KVK-nummer). */
export class NotFoundError extends ApiError {}

/** 422: de invoer is ongeldig. `errors` bevat de fouten per veld. */
export class ValidationError extends ApiError {
  constructor(
    message: string,
    status: number,
    data: unknown,
    code: string | null,
    public readonly errors: Record<string, string[]>,
  ) {
    super(message, status, data, code);
  }
}

/** 429: te veel verzoeken. Probeer opnieuw na `retryAfter` seconden. */
export class RateLimitError extends ApiError {
  constructor(
    message: string,
    status: number,
    data: unknown,
    code: string | null,
    public readonly retryAfter: number | null,
    public readonly resetAt: number | null,
  ) {
    super(message, status, data, code);
  }
}

/** 503: een bron achter de API (bijvoorbeeld KVK of VIES) is tijdelijk niet beschikbaar. */
export class UpstreamUnavailableError extends ApiError {}

/** Je gaf een ongeldige waarde mee aan de client. Er is nog geen verzoek verstuurd en er zijn geen credits gebruikt. */
export class InvalidArgumentError extends GetApiError {}
