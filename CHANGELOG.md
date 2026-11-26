# Wijzigingen

Dit project volgt [Semantic Versioning](https://semver.org/lang/nl/).

## 1.0.1

- Een eigen `signal` bij een aanroep werkt nu ook op Node 18 en 19 (`AbortSignal.any` is niet meer nodig).
- Pakketvalidatie, code-stijl (Prettier), linting (ESLint) en tests op Node 18 tot en met 24 zijn onderdeel van de release.

## 1.0.0

- Eerste versie: KVK, adressen (BAG), pandgegevens (WOZ, energielabel), controles (BTW, IBAN, e-mail, DNSBL), opzoeken (IP, DNS), RDW, CBS SBI, DSO en NDW.
- Zonder runtime-afhankelijkheden, met ESM, CommonJS en TypeScript-types.
