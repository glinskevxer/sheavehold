# sheavehold

Lift access gate telemetry and skier visit analytics for a ski area.

Every RFID gate in every lift maze uploads what it read. This turns that stream
into the numbers the area actually runs on: skier visits, vertical, lift
utilisation, product mix and the exceptions worth a supervisor walking down to
the maze about.

## Running it

```
npm install
npm test
npm run typecheck
npm run lint
```

## Layout

| path | what lives there |
| --- | --- |
| `src/util` | identifiers, results and the small shared helpers |
| `tests` | the suite, split into unit and integration |
