# sheavehold

Lift access gate telemetry and skier visit analytics for a ski area.

Every RFID gate in every lift maze uploads what it read. This turns that stream
into the numbers the area actually runs on: skier visits, vertical, lift
utilisation, product mix, revenue attribution, and the exceptions worth a
supervisor walking down to the maze about.

The interesting part is that the stream is bad. Gates run on a local clock that
drifts, they buffer while the radio link is down and upload hours later, they
double read a tag that lingers in the field, and the same person walks through
two gates in one maze. Nothing downstream is trustworthy until the stream has
been normalised, deduped and sessionised, and every one of those steps has a
rule that changes what the next one measures.

## The pipeline

```
raw terminal upload
  -> envelope verification (sequence continuity, batch checksum)
  -> clock normalisation (per terminal offset and drift)
  -> admission (media known, product entitled, gate in service)
  -> dedupe (per terminal, then across the gates of one maze)
  -> rides (one accepted scan is one ride on that lift)
  -> visits (rides into a skier day, split on an inactivity gap)
  -> vertical, capacity, revenue attribution
  -> exceptions (pass-back, impossible transfer, blackout breach)
  -> reports
```

## Running it

```
npm install
npm test
npm run typecheck
npm run lint
npm run build
node dist/cli/entry.js about
```

## Layout

| path | what lives there |
| --- | --- |
| `src/util` | identifiers, results, money, the operating clock, csv, tables |
| `src/domain` | the rules, one directory per concept, no io |
| `src/ingest` | upload envelopes, readers, handshakes |
| `src/storage` | journal, snapshots, migrations, the indexed store |
| `src/service` | orchestration across the domain and the store |
| `src/report` | renderers over the read models |
| `src/api` | an in process router, no http dependency |
| `src/cli` | the commander wiring |
| `tests` | unit, properties and integration |
| `docs` | generated from the code, never edited by hand |

The layers only depend downward and `npm run verify-tree` enforces it.

## The generated pages

`docs/commands.md` and `docs/api.md` come out of the program and the router.
Run `npm run commands` and `npm run api-docs` after changing either, or the
docs job in CI will say so.
