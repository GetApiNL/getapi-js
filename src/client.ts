import { InvalidArgumentError } from './errors.js';
import { Transport, type GetApiResponse, type RequestOptions } from './transport.js';

export const VERSION = '1.0.1';
export const DEFAULT_BASE_URL = 'https://api.getapi.nl';

/** Een Nederlands huisadres, in losse delen. */
export interface HouseAddress {
  /** Nederlandse postcode, met of zonder spatie (bijvoorbeeld `3023KN`). */
  postcode: string;
  /** Alleen het getal van het huisnummer (1 tot 99999). */
  houseNumber: number;
  /** Eén letter, bijvoorbeeld `C`. */
  houseLetter?: string;
  /** Toevoeging zonder koppelteken, met voorloopnullen (bijvoorbeeld `03`). Maximaal 4 tekens. */
  houseNumberAddition?: string;
}

/** Paginering voor lijsten. */
export interface Paging {
  page?: number;
  perPage?: number;
}

type Call<T = any> = Promise<GetApiResponse<T>>;

function houseParams(a: HouseAddress): Record<string, string | number | undefined> {
  if (!Number.isInteger(a.houseNumber) || a.houseNumber < 1 || a.houseNumber > 99999) {
    throw new InvalidArgumentError('Het huisnummer moet een geheel getal van 1 tot 99999 zijn.');
  }
  if (a.houseLetter !== undefined && !/^[A-Za-z]$/.test(a.houseLetter)) {
    throw new InvalidArgumentError('De huisletter moet precies één letter zijn.');
  }
  if (a.houseNumberAddition !== undefined && !/^[A-Za-z0-9]{1,4}$/.test(a.houseNumberAddition)) {
    throw new InvalidArgumentError('De toevoeging mag maximaal 4 letters of cijfers bevatten, zonder koppelteken.');
  }
  return {
    house_number: a.houseNumber,
    house_letter: a.houseLetter,
    house_number_addition: a.houseNumberAddition,
  };
}

function limit(value: number | undefined, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new InvalidArgumentError(`De limiet moet een geheel getal van 1 tot ${max} zijn.`);
  }
  return value;
}

function perPage(p: Paging): Record<string, number | undefined> {
  if (p.page !== undefined && (!Number.isInteger(p.page) || p.page < 1)) {
    throw new InvalidArgumentError('De pagina moet een geheel getal van 1 of hoger zijn.');
  }
  if (p.perPage !== undefined && (!Number.isInteger(p.perPage) || p.perPage < 1 || p.perPage > 500)) {
    throw new InvalidArgumentError('Het aantal per pagina moet een geheel getal van 1 tot 500 zijn.');
  }
  return { page: p.page, per_page: p.perPage };
}

/** KVK-handelsregister: zoeken, details en controleren. */
export class Kvk {
  constructor(private readonly t: Transport) {}

  /**
   * Zoek bedrijven in het handelsregister. Geef `naam` of `kvkNummer` mee (minstens één).
   * `size` mag 5, 10, 25, 50 of 75 zijn.
   */
  search(
    params: { naam?: string; kvkNummer?: string; page?: number; size?: 5 | 10 | 25 | 50 | 75 },
    options?: RequestOptions,
  ): Call {
    const naam = params.naam?.trim();
    const kvkNummer = params.kvkNummer?.trim();
    if (!naam && !kvkNummer) {
      throw new InvalidArgumentError('Geef minstens een bedrijfsnaam (naam) of KVK-nummer (kvkNummer) op.');
    }
    if (params.size !== undefined && ![5, 10, 25, 50, 75].includes(params.size)) {
      throw new InvalidArgumentError('size moet 5, 10, 25, 50 of 75 zijn.');
    }
    return this.t.get('/v1/kvk/search', { naam, kvkNummer, page: params.page, size: params.size }, options);
  }

  /** Haal de gegevens van één bedrijf op via het KVK-nummer (8 cijfers). */
  get(kvkNummer: string, options?: RequestOptions): Call {
    const nummer = kvkNummer.trim();
    if (!/^\d{8}$/.test(nummer)) throw new InvalidArgumentError('Een KVK-nummer bestaat uit 8 cijfers.');
    return this.t.get(`/v1/kvk/${encodeURIComponent(nummer)}`, {}, options);
  }

  /** Controleer of een KVK-nummer bestaat. Een ongeldig nummer geeft een antwoord met `valid: false`, geen fout. */
  validate(kvkNummer: string, options?: RequestOptions): Call {
    return this.t.post('/v1/kvk/validate', { kvkNummer: kvkNummer.trim() }, true, options);
  }
}

/** BAG-adressen: opzoeken, suggesties en BAG-id. */
export class Address {
  constructor(private readonly t: Transport) {}

  /** Zoek een adres op in de BAG. */
  lookup(address: HouseAddress, options?: RequestOptions): Call {
    return this.t.get('/v1/kadaster/bag/address', { postcode: address.postcode, ...houseParams(address) }, options);
  }

  /** Adressuggesties terwijl iemand typt (zoektekst van 2 tot 100 tekens, limiet 1 tot 25). */
  suggest(query: string, params: { limit?: number } = {}, options?: RequestOptions): Call {
    if (query.length < 2 || query.length > 100)
      throw new InvalidArgumentError('De zoektekst moet 2 tot 100 tekens lang zijn.');
    return this.t.get('/v1/kadaster/bag/address-suggest', { q: query, limit: limit(params.limit, 25) }, options);
  }

  /** Zoek een adres op via het BAG-id (16 cijfers). */
  byId(id: string, options?: RequestOptions): Call {
    if (!/^\d{16}$/.test(id)) throw new InvalidArgumentError('Een BAG-id bestaat uit 16 cijfers.');
    return this.t.get('/v1/kadaster/bag/id', { id }, options);
  }

  /** Zoek op postcode, optioneel met huisnummer. */
  postcode(postcode: string, params: { number?: number } = {}, options?: RequestOptions): Call {
    return this.t.get('/v1/lookup/postcode', { postcode, number: params.number }, options);
  }
}

/** Pandgegevens: WOZ-waarde, energielabel en pandinformatie. */
export class Property {
  constructor(private readonly t: Transport) {}

  /** WOZ-waarde van een adres. Let op: dit endpoint kost meer credits dan de meeste andere (10 per aanroep). */
  wozValue(address: HouseAddress, options?: RequestOptions): Call {
    return this.t.get('/v1/property/woz-waarde', { postcode: address.postcode, ...houseParams(address) }, options);
  }

  /** Geregistreerd energielabel van een adres (bron: EP-Online van RVO). */
  energyLabel(address: HouseAddress, options?: RequestOptions): Call {
    // Dit endpoint noemt de postcode-parameter `zipcode`.
    return this.t.get('/v1/property/energy-label', { zipcode: address.postcode, ...houseParams(address) }, options);
  }

  /** Gecombineerde pandgegevens: BAG, energielabel, WOZ-waarde, bestemmingsplan en omgeving. */
  details(address: HouseAddress, options?: RequestOptions): Call {
    return this.t.get('/v1/property/pandgegevens', { postcode: address.postcode, ...houseParams(address) }, options);
  }

  /** Lichte variant van de pandgegevens, met minder velden. */
  detailsLite(address: HouseAddress, options?: RequestOptions): Call {
    return this.t.get(
      '/v1/property/pandgegevens-lite',
      { postcode: address.postcode, ...houseParams(address) },
      options,
    );
  }
}

/** Controles: BTW, IBAN, e-mail en IP-blacklists. */
export class Validation {
  constructor(private readonly t: Transport) {}

  /** Controleer een BTW-nummer bij VIES. Een ongeldig nummer geeft `valid: false`, geen fout. */
  vat(vatNumber: string, options?: RequestOptions): Call {
    return this.t.post('/v1/validate/vat', { vat_number: vatNumber.replace(/\s+/g, '') }, true, options);
  }

  /** Controleer een IBAN, optioneel samen met een BIC. */
  iban(iban: string, params: { bic?: string } = {}, options?: RequestOptions): Call {
    const body: Record<string, string> = { iban: iban.replace(/\s+/g, '') };
    if (params.bic) body.bic = params.bic;
    return this.t.post('/v1/validate/iban', body, true, options);
  }

  /** Controleer of een e-mailadres geldig en bereikbaar is. */
  email(email: string, options?: RequestOptions): Call {
    return this.t.post('/v1/validate/email', { email }, true, options);
  }

  /** Controleer maximaal 25 e-mailadressen in één keer. */
  emailBatch(emails: string[], options?: RequestOptions): Call {
    if (emails.length < 1 || emails.length > 25) throw new InvalidArgumentError('Geef 1 tot 25 e-mailadressen op.');
    return this.t.post('/v1/validate/email/batch', { emails }, true, options);
  }

  /** Controleer of een e-mailadres van een wegwerpdienst is. */
  disposableEmail(email: string, options?: RequestOptions): Call {
    return this.t.post('/v1/validate/email/disposable', { email }, true, options);
  }

  /** Controleer of een IP-adres op een DNS-blacklist staat. */
  dnsbl(ip: string, options?: RequestOptions): Call {
    return this.t.post('/v1/validate/dnsbl', { ip }, false, options);
  }
}

/** Opzoeken: IP-adres en DNS. */
export class Lookup {
  constructor(private readonly t: Transport) {}

  /** Gegevens over een IP-adres. */
  ip(ip: string, options?: RequestOptions): Call {
    return this.t.get('/v1/lookup/ip', { ip }, options);
  }

  /** Nameservers van een domein. */
  dnsNameservers(domain: string, options?: RequestOptions): Call {
    return this.t.get('/v1/lookup/dns/nameservers', { domain }, options);
  }

  /** DNS-records van een domein. `type` mag A, AAAA, CNAME, MX, NS, TXT, SOA, PTR, SRV of ALL zijn. */
  dnsRecords(
    domain: string,
    params: { type?: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'SOA' | 'PTR' | 'SRV' | 'ALL' } = {},
    options?: RequestOptions,
  ): Call {
    return this.t.get('/v1/lookup/dns/records', { domain, type: params.type }, options);
  }
}

/** RDW-voertuiggegevens. */
export class Vehicle {
  constructor(private readonly t: Transport) {}

  /** Voertuiggegevens op kenteken (met of zonder streepjes). */
  get(licensePlate: string, options?: RequestOptions): Call {
    const plate = licensePlate.replace(/[\s-]+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(plate)) throw new InvalidArgumentError('Dit is geen geldig kenteken.');
    return this.t.get('/v1/rdw/vehicle', { license_plate: plate }, options);
  }
}

/** CBS SBI-codes (bedrijfsindeling). */
export class Sbi {
  constructor(private readonly t: Transport) {}

  /** Lijst SBI-codes, optioneel gefilterd op niveau (1 tot 5) of bovenliggende code. */
  index(params: { level?: number; parentCode?: string } = {}, options?: RequestOptions): Call {
    if (params.level !== undefined && (!Number.isInteger(params.level) || params.level < 1 || params.level > 5)) {
      throw new InvalidArgumentError('Het niveau moet 1 tot 5 zijn.');
    }
    return this.t.get('/v1/cbs/sbi', { level: params.level, parent_code: params.parentCode }, options);
  }

  /** Zoek SBI-codes op tekst (2 tot 100 tekens, limiet 1 tot 100). */
  search(query: string, params: { limit?: number } = {}, options?: RequestOptions): Call {
    if (query.length < 2 || query.length > 100)
      throw new InvalidArgumentError('De zoektekst moet 2 tot 100 tekens lang zijn.');
    return this.t.get('/v1/cbs/sbi/search', { q: query, limit: limit(params.limit, 100) }, options);
  }

  /** Eén SBI-code ophalen. */
  get(code: string, options?: RequestOptions): Call {
    return this.t.get(`/v1/cbs/sbi/${encodeURIComponent(code)}`, {}, options);
  }
}

/** Omgevingsloket (DSO): documenten en plannen bij een locatie. */
export class Dso {
  constructor(private readonly t: Transport) {}

  private location(l: { lat?: number; lon?: number; postcode?: string; huisnummer?: number }) {
    const hasCoords = l.lat !== undefined && l.lon !== undefined;
    const hasAddress = !!l.postcode && l.huisnummer !== undefined;
    if (!hasCoords && !hasAddress) {
      throw new InvalidArgumentError('Geef een locatie op: lat en lon, of postcode en huisnummer.');
    }
    return { lat: l.lat, lon: l.lon, postcode: l.postcode, huisnummer: l.huisnummer };
  }

  /** Documenten bij een locatie. */
  documents(
    location: { lat?: number; lon?: number; postcode?: string; huisnummer?: number },
    options?: RequestOptions,
  ): Call {
    return this.t.get('/v1/dso/documents', this.location(location), options);
  }

  /** Plannen bij een locatie. */
  plans(
    location: { lat?: number; lon?: number; postcode?: string; huisnummer?: number },
    options?: RequestOptions,
  ): Call {
    return this.t.get('/v1/dso/plans', this.location(location), options);
  }
}

/** NDW-verkeersdata: laadpunten, emissiezones en truckparkeerplaatsen. */
export class Ndw {
  constructor(private readonly t: Transport) {}

  /** Laadpunten voor elektrische voertuigen. */
  chargePoints(
    params: Paging & { city?: string; status?: string; connectorTypes?: string[]; available?: boolean } = {},
    options?: RequestOptions,
  ): Call {
    return this.t.get(
      '/v1/ndw/laadpunten',
      {
        city: params.city,
        status: params.status,
        'connector_types[]': params.connectorTypes,
        beschikbaar: params.available,
        ...perPage(params),
      },
      options,
    );
  }

  /** Eén laadpunt ophalen. */
  chargePoint(id: string, options?: RequestOptions): Call {
    return this.t.get(`/v1/ndw/laadpunten/${encodeURIComponent(id)}`, {}, options);
  }

  /** Milieuzones en zero-emissiezones. */
  emissionZones(
    params: Paging & { zoneType?: 'low_emission' | 'zero_emission'; city?: string } = {},
    options?: RequestOptions,
  ): Call {
    return this.t.get(
      '/v1/ndw/emissiezones',
      { zone_type: params.zoneType, city: params.city, ...perPage(params) },
      options,
    );
  }

  /** Eén emissiezone ophalen. */
  emissionZone(id: string, options?: RequestOptions): Call {
    return this.t.get(`/v1/ndw/emissiezones/${encodeURIComponent(id)}`, {}, options);
  }

  /** Parkeerplaatsen voor vrachtwagens. */
  truckParking(
    params: Paging & { status?: 'available' | 'full' | 'closed' | 'unknown'; available?: boolean; road?: string } = {},
    options?: RequestOptions,
  ): Call {
    return this.t.get(
      '/v1/ndw/truckparking',
      { status: params.status, beschikbaar: params.available, road: params.road, ...perPage(params) },
      options,
    );
  }

  /** Eén truckparkeerplaats ophalen. */
  truckParkingSite(id: string, options?: RequestOptions): Call {
    return this.t.get(`/v1/ndw/truckparking/${encodeURIComponent(id)}`, {}, options);
  }
}

/** Instellingen voor de client. */
export interface GetApiOptions {
  /** Je API-key (begint met `ga_live_`). Zet hem nooit in code die in een browser draait. */
  apiKey: string;
  /** Basis-URL van de API. Standaard `https://api.getapi.nl`. */
  baseUrl?: string;
  /** Time-out in milliseconden. Standaard 15000. */
  timeoutMs?: number;
  /** Eigen `fetch`, bijvoorbeeld voor tests. Standaard de ingebouwde `fetch`. */
  fetch?: typeof fetch;
  /** Naam van het kanaal waarmee je GetAPI aanroept, bijvoorbeeld `mijn-app/2.1`. Alleen voor je eigen herkenning in de logs. */
  clientName?: string;
}

/**
 * De GetAPI-client.
 *
 * ```ts
 * import { GetApi } from '@getapinl/getapi';
 *
 * const getapi = new GetApi({ apiKey: process.env.GETAPI_KEY! });
 * const { data } = await getapi.kvk.get('53743792');
 * ```
 */
export class GetApi {
  readonly kvk: Kvk;
  readonly address: Address;
  readonly property: Property;
  readonly validation: Validation;
  readonly lookup: Lookup;
  readonly vehicle: Vehicle;
  readonly sbi: Sbi;
  readonly dso: Dso;
  readonly ndw: Ndw;

  constructor(options: GetApiOptions) {
    if (!options?.apiKey || options.apiKey.trim() === '') {
      throw new InvalidArgumentError('De API-key ontbreekt. Maak gratis een key aan op https://getapi.nl/register.');
    }

    const isNode = typeof process !== 'undefined' && !!process.versions?.node;
    const platform = isNode ? `node/${process.versions.node.split('.')[0]}` : 'browser';
    const clientHeader = options.clientName ?? `getapi-js/${VERSION}`;

    const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      throw new InvalidArgumentError(
        'Er is geen fetch beschikbaar. Gebruik Node 18 of hoger, of geef zelf een fetch mee.',
      );
    }

    const t = new Transport({
      apiKey: options.apiKey.trim(),
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? 15000,
      fetch: fetchImpl,
      clientHeader,
      // Browsers staan het instellen van User-Agent niet toe.
      userAgent: isNode ? `getapi-js/${VERSION} (${platform})` : null,
    });

    this.kvk = new Kvk(t);
    this.address = new Address(t);
    this.property = new Property(t);
    this.validation = new Validation(t);
    this.lookup = new Lookup(t);
    this.vehicle = new Vehicle(t);
    this.sbi = new Sbi(t);
    this.dso = new Dso(t);
    this.ndw = new Ndw(t);
  }
}
