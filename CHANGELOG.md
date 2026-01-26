# changelog

## 0.9.0

- The whole command line, the in process router and the generated references.
- The store keeps its indexes on sorted runs, so a season range is two searches
  rather than a scan of every ride.
- The rollover grace and the mid station inference run inside the day rebuild.

## 0.5.0

- Rides, visits, vertical and the daily sheet.
- Pass-back and impossible transfer detection, with a register a supervisor can
  clear without it coming back the next morning.

## 0.2.0

- Gate uploads, clock correction and dedupe.
- The season calendar, the product catalogue and the entitlement rules.
