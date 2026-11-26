import { describe, expect, it } from 'vitest';
import { InvalidArgumentError, type GetApi } from '../src/index.js';
import { headersOf, mock } from './helpers.js';

const BASE = 'https://api.getapi.nl';
const HOUSE = { postcode: '3023KN', houseNumber: 161, houseLetter: 'C', houseNumberAddition: '03' };
const HOUSE_QUERY = 'house_number=161&house_letter=C&house_number_addition=03';

type Run = (client: GetApi) => Promise<unknown>;

const getRequests: [string, Run, string][] = [
  ['kvk.search', (c) => c.kvk.search({ naam: 'bol', size: 10 }), '/v1/kvk/search?naam=bol&size=10'],
  ['kvk.search op nummer', (c) => c.kvk.search({ kvkNummer: '53743792' }), '/v1/kvk/search?kvkNummer=53743792'],
  ['address.lookup', (c) => c.address.lookup(HOUSE), `/v1/kadaster/bag/address?postcode=3023KN&${HOUSE_QUERY}`],
  [
    'address.suggest',
    (c) => c.address.suggest('Hooidrift', { limit: 5 }),
    '/v1/kadaster/bag/address-suggest?q=Hooidrift&limit=5',
  ],
  ['address.byId', (c) => c.address.byId('0599200000000001'), '/v1/kadaster/bag/id?id=0599200000000001'],
  [
    'address.postcode',
    (c) => c.address.postcode('3023KN', { number: 161 }),
    '/v1/lookup/postcode?postcode=3023KN&number=161',
  ],
  ['property.wozValue', (c) => c.property.wozValue(HOUSE), `/v1/property/woz-waarde?postcode=3023KN&${HOUSE_QUERY}`],
  [
    'property.energyLabel',
    (c) => c.property.energyLabel(HOUSE),
    `/v1/property/energy-label?zipcode=3023KN&${HOUSE_QUERY}`,
  ],
  ['property.details', (c) => c.property.details(HOUSE), `/v1/property/pandgegevens?postcode=3023KN&${HOUSE_QUERY}`],
  [
    'property.detailsLite',
    (c) => c.property.detailsLite(HOUSE),
    `/v1/property/pandgegevens-lite?postcode=3023KN&${HOUSE_QUERY}`,
  ],
  ['lookup.ip', (c) => c.lookup.ip('8.8.8.8'), '/v1/lookup/ip?ip=8.8.8.8'],
  ['lookup.dnsNameservers', (c) => c.lookup.dnsNameservers('getapi.nl'), '/v1/lookup/dns/nameservers?domain=getapi.nl'],
  [
    'lookup.dnsRecords',
    (c) => c.lookup.dnsRecords('getapi.nl', { type: 'MX' }),
    '/v1/lookup/dns/records?domain=getapi.nl&type=MX',
  ],
  ['vehicle.get', (c) => c.vehicle.get('ab-123-c'), '/v1/rdw/vehicle?license_plate=AB123C'],
  ['sbi.index', (c) => c.sbi.index({ level: 2, parentCode: '62' }), '/v1/cbs/sbi?level=2&parent_code=62'],
  ['sbi.search', (c) => c.sbi.search('software', { limit: 10 }), '/v1/cbs/sbi/search?q=software&limit=10'],
  ['sbi.get', (c) => c.sbi.get('62.01'), '/v1/cbs/sbi/62.01'],
  ['dso.documents', (c) => c.dso.documents({ lat: 52.1, lon: 5.1 }), '/v1/dso/documents?lat=52.1&lon=5.1'],
  [
    'dso.plans',
    (c) => c.dso.plans({ postcode: '3023KN', huisnummer: 161 }),
    '/v1/dso/plans?postcode=3023KN&huisnummer=161',
  ],
  [
    'ndw.chargePoints',
    (c) => c.ndw.chargePoints({ city: 'Utrecht', connectorTypes: ['CCS', 'Type2'], available: true, perPage: 50 }),
    '/v1/ndw/laadpunten?city=Utrecht&connector_types%5B%5D=CCS&connector_types%5B%5D=Type2&beschikbaar=true&per_page=50',
  ],
  ['ndw.chargePoint', (c) => c.ndw.chargePoint('NL-ABC'), '/v1/ndw/laadpunten/NL-ABC'],
  [
    'ndw.emissionZones',
    (c) => c.ndw.emissionZones({ zoneType: 'zero_emission', page: 2 }),
    '/v1/ndw/emissiezones?zone_type=zero_emission&page=2',
  ],
  ['ndw.emissionZone', (c) => c.ndw.emissionZone('amsterdam'), '/v1/ndw/emissiezones/amsterdam'],
  [
    'ndw.truckParking',
    (c) => c.ndw.truckParking({ status: 'available', road: 'A2' }),
    '/v1/ndw/truckparking?status=available&road=A2',
  ],
  ['ndw.truckParkingSite', (c) => c.ndw.truckParkingSite('site 1'), '/v1/ndw/truckparking/site%201'],
  ['kvk.get', (c) => c.kvk.get(' 53743792 '), '/v1/kvk/53743792'],
];

const postRequests: [string, Run, string, unknown][] = [
  ['kvk.validate', (c) => c.kvk.validate(' 53743792 '), '/v1/kvk/validate', { kvkNummer: '53743792' }],
  [
    'validation.vat',
    (c) => c.validation.vat('NL 8206.46660 B01'),
    '/v1/validate/vat',
    { vat_number: 'NL8206.46660B01' },
  ],
  [
    'validation.iban',
    (c) => c.validation.iban('NL91 ABNA 0417 1643 00', { bic: 'ABNANL2A' }),
    '/v1/validate/iban',
    { iban: 'NL91ABNA0417164300', bic: 'ABNANL2A' },
  ],
  ['validation.email', (c) => c.validation.email('a@b.nl'), '/v1/validate/email', { email: 'a@b.nl' }],
  [
    'validation.emailBatch',
    (c) => c.validation.emailBatch(['a@b.nl', 'c@d.nl']),
    '/v1/validate/email/batch',
    { emails: ['a@b.nl', 'c@d.nl'] },
  ],
  [
    'validation.disposableEmail',
    (c) => c.validation.disposableEmail('a@b.nl'),
    '/v1/validate/email/disposable',
    { email: 'a@b.nl' },
  ],
  ['validation.dnsbl', (c) => c.validation.dnsbl('1.2.3.4'), '/v1/validate/dnsbl', { ip: '1.2.3.4' }],
];

describe('GET-endpoints', () => {
  it.each(getRequests)('%s', async (_name, run, path) => {
    const { calls, client } = mock(200, {});
    await run(client);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.url).toBe(BASE + path);
    expect(calls[0]!.init.body).toBeUndefined();
  });
});

describe('POST-endpoints', () => {
  it.each(postRequests)('%s', async (_name, run, path, body) => {
    const { calls, client } = mock(200, {});
    await run(client);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.url).toBe(BASE + path);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(body);
    expect(headersOf(calls[0]!)['Content-Type']).toBe('application/json');
  });

  it('iban zonder bic stuurt geen bic mee', async () => {
    const { calls, client } = mock(200, {});
    await client.validation.iban('NL91ABNA0417164300');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ iban: 'NL91ABNA0417164300' });
  });
});

describe('invoercontrole voor het versturen', () => {
  const invalid: [string, Run][] = [
    ['kvk.get met te kort nummer', (c) => c.kvk.get('123')],
    ['kvk.search zonder zoekterm', (c) => c.kvk.search({})],
    ['kvk.search met alleen spaties', (c) => c.kvk.search({ naam: '  ' })],
    ['kvk.search met ongeldige size', (c) => c.kvk.search({ naam: 'x', size: 3 as never })],
    ['huisnummer 0', (c) => c.address.lookup({ postcode: '3023KN', houseNumber: 0 })],
    ['huisnummer 100000', (c) => c.address.lookup({ postcode: '3023KN', houseNumber: 100000 })],
    ['huisnummer met decimalen', (c) => c.address.lookup({ postcode: '3023KN', houseNumber: 1.5 })],
    ['huisletter met twee tekens', (c) => c.address.lookup({ postcode: '3023KN', houseNumber: 1, houseLetter: 'AB' })],
    [
      'toevoeging met koppelteken',
      (c) => c.address.lookup({ postcode: '3023KN', houseNumber: 1, houseNumberAddition: 'ab-12' }),
    ],
    ['suggest te kort', (c) => c.address.suggest('a')],
    ['suggest te lang', (c) => c.address.suggest('a'.repeat(101))],
    ['suggest met limiet 26', (c) => c.address.suggest('abc', { limit: 26 })],
    ['byId met te weinig cijfers', (c) => c.address.byId('123')],
    ['kenteken met leestekens', (c) => c.vehicle.get('AB_123!')],
    ['sbi.index met niveau 6', (c) => c.sbi.index({ level: 6 })],
    ['sbi.search te kort', (c) => c.sbi.search('a')],
    ['sbi.search met limiet 101', (c) => c.sbi.search('abc', { limit: 101 })],
    ['dso zonder locatie', (c) => c.dso.documents({})],
    ['dso met alleen lat', (c) => c.dso.plans({ lat: 52 })],
    ['emailBatch leeg', (c) => c.validation.emailBatch([])],
    ['emailBatch met 26 adressen', (c) => c.validation.emailBatch(Array.from({ length: 26 }, () => 'a@b.nl'))],
    ['ndw met pagina 0', (c) => c.ndw.chargePoints({ page: 0 })],
    ['ndw met perPage 501', (c) => c.ndw.emissionZones({ perPage: 501 })],
  ];

  it.each(invalid)('%s', (_name, run) => {
    const { calls, client } = mock(200, {});
    expect(() => run(client)).toThrow(InvalidArgumentError);
    expect(calls).toHaveLength(0);
  });
});
