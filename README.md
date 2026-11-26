# GetAPI voor JavaScript en TypeScript

[![npm](https://img.shields.io/npm/v/@getapinl/getapi.svg)](https://www.npmjs.com/package/@getapinl/getapi)
[![CI](https://github.com/GetApiNL/getapi-js/actions/workflows/ci.yml/badge.svg)](https://github.com/GetApiNL/getapi-js/actions/workflows/ci.yml)
[![Licentie](https://img.shields.io/npm/l/@getapinl/getapi.svg)](LICENSE)

Officiële client voor [GetAPI.nl](https://getapi.nl/?utm_source=npm&utm_medium=sdk&utm_campaign=js-readme): Nederlandse bedrijfs-, adres-, pand- en controlegegevens via één API-key. KVK, BAG, BTW (VIES), WOZ, energielabel, RDW en meer.

GetAPI verzamelt en publiceert de data zelf, onder een eigen domein, API en account. Eén key is genoeg.

- Zonder runtime-afhankelijkheden: gebruikt de ingebouwde `fetch`
- Typed (TypeScript), werkt met ESM en CommonJS
- Node 18 of hoger (getest op 18, 20, 22 en 24)

## Installeren

```bash
npm install @getapinl/getapi
```

[Maak gratis een API-key aan](https://getapi.nl/register?utm_source=npm&utm_medium=sdk&utm_campaign=js-readme&utm_content=install).

## Gebruiken

```ts
import { GetApi } from '@getapinl/getapi';

const getapi = new GetApi({ apiKey: process.env.GETAPI_KEY! });

const { data, creditsRemaining } = await getapi.kvk.get('53743792');
console.log(data.naam);
```

Elke aanroep geeft `{ data, status, creditsRemaining, headers }` terug. `creditsRemaining` is alleen gevuld als de API de header `X-Credits-Remaining` meestuurt.

```ts
// Bedrijf zoeken op naam
await getapi.kvk.search({ naam: 'bol', size: 10 });

// Adres opzoeken. Splits het adres in losse delen:
// "Hooidrift 161C-03" wordt huisnummer 161, letter C en toevoeging 03.
await getapi.address.lookup({ postcode: '3023KN', houseNumber: 161, houseLetter: 'C', houseNumberAddition: '03' });

// BTW-nummer controleren: een ongeldig nummer geeft { valid: false }, geen fout.
await getapi.validation.vat('NL820646660B01');

// WOZ-waarde en energielabel
await getapi.property.wozValue({ postcode: '3023KN', houseNumber: 161 });
await getapi.property.energyLabel({ postcode: '3023KN', houseNumber: 161 });

// Kenteken
await getapi.vehicle.get('AB-123-C');
```

## Overzicht

| Resource     | Methodes                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `kvk`        | `search`, `get`, `validate`                                                                        |
| `address`    | `lookup`, `suggest`, `byId`, `postcode`                                                            |
| `property`   | `wozValue`, `energyLabel`, `details`, `detailsLite`                                                |
| `validation` | `vat`, `iban`, `email`, `emailBatch`, `disposableEmail`, `dnsbl`                                   |
| `lookup`     | `ip`, `dnsNameservers`, `dnsRecords`                                                               |
| `vehicle`    | `get`                                                                                              |
| `sbi`        | `index`, `search`, `get`                                                                           |
| `dso`        | `documents`, `plans`                                                                               |
| `ndw`        | `chargePoints`, `chargePoint`, `emissionZones`, `emissionZone`, `truckParking`, `truckParkingSite` |

De volledige API-documentatie staat op [getapi.nl/docs](https://getapi.nl/docs).

## Opties

```ts
new GetApi({
  apiKey: 'ga_live_...',
  baseUrl: 'https://api.getapi.nl', // standaard
  timeoutMs: 15000, // standaard
  fetch: eigenFetch, // optioneel, handig in tests
  clientName: 'mijn-app/2.1', // optioneel, voor herkenning in je logs
});
```

Aanroepen die credits kosten accepteren een `idempotencyKey`. Dezelfde key binnen 10 minuten geeft hetzelfde antwoord en rekent hooguit één keer af. Dat is handig als je een aanroep opnieuw doet na een time-out:

```ts
await getapi.property.wozValue({ postcode: '3023KN', houseNumber: 161 }, { idempotencyKey: 'order-4711' });
```

## Fouten afhandelen

Alle fouten erven van `GetApiError`.

| Klasse                     | Wanneer                                                   |
| -------------------------- | --------------------------------------------------------- |
| `AuthError`                | 401 of 403: key ontbreekt of is ongeldig                  |
| `CreditsExhaustedError`    | 402: credits op, met `topupUrl`                           |
| `NotFoundError`            | 404: bijvoorbeeld een onbekend KVK-nummer                 |
| `ValidationError`          | 422: ongeldige invoer, met `errors` per veld              |
| `RateLimitError`           | 429: te veel verzoeken, met `retryAfter` (seconden)       |
| `UpstreamUnavailableError` | 503: een bron achter de API is tijdelijk niet beschikbaar |
| `ConnectionError`          | netwerkfout of time-out                                   |
| `InvalidArgumentError`     | ongeldige invoer, gemeld voordat er iets is verstuurd     |

```ts
import { NotFoundError, CreditsExhaustedError } from '@getapinl/getapi';

try {
  await getapi.kvk.get('00000000');
} catch (e) {
  if (e instanceof NotFoundError) {
    /* onbekend KVK-nummer */
  } else if (e instanceof CreditsExhaustedError) {
    console.log(e.topupUrl);
  } else throw e;
}
```

## Let op: gebruik je key niet in de browser

Je API-key hoort op de server. Zet hem niet in code die in een browser draait, want dan kan iedereen hem uitlezen en je credits opmaken. Roep GetAPI aan vanuit je backend en geef alleen het resultaat door.

## Ontwikkelen

```bash
npm install
npm run check
```

`npm run check` draait in één keer dezelfde controles als de CI:

| Commando                          | Wat het doet                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| `npm run format` / `format:check` | Opmaak met Prettier (past aan / controleert alleen)               |
| `npm run lint` / `lint:fix`       | Best practices met ESLint en typescript-eslint                    |
| `npm run typecheck`               | TypeScript in strikte modus                                       |
| `npm test`                        | Unit tests met Vitest (Node 20 of hoger)                          |
| `npm run build`                   | ESM, CommonJS en types in `dist`                                  |
| `npm run test:smoke`              | Rooktest op het gebouwde pakket, werkt vanaf Node 18              |
| `npm run check:package`           | Controleert `exports` en types met publint en Are the Types Wrong |

Een nieuwe versie publiceren: verhoog `version` in `package.json` en `VERSION` in `src/client.ts`, werk de CHANGELOG bij en maak een release met de tag `vX.Y.Z`. De workflow publiceert het pakket dan op npm met provenance.

## Totstandkoming
Deze package is met behulp van AI geschreven en voor zover mogelijk door GetApi.nl beoordeeld. De code wordt gecontroleerd door een testsuite met 100% dekking, door een contracttest tegen de [OpenAPI-spec](https://getapi.nl/openapi.json) en door ruff en mypy --strict.
Zie je iets dat niet klopt? Open een [issue](https://github.com/GetApiNL/getapi-python/issues).

## Over GetAPI

GetAPI is een label van [WD Noord](https://wdnoord.nl/?utm_source=npm&utm_medium=sdk&utm_campaign=getapi-js-readme&utm_content=footer).

## Licentie

[MIT](LICENSE)
