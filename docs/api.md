# api reference

Generated from the router. Do not edit by hand.

| method | path | scope | summary |
| --- | --- | --- | --- |
| GET | `/batches` |  | every upload the base station has taken |
| POST | `/batches` | ingest | take an upload in |
| GET | `/batches/:batch` |  | one upload |
| GET | `/exceptions` |  | the register, paged, oldest first |
| GET | `/exceptions/:id` |  | one finding |
| POST | `/exceptions/decide` | supervise | record a decision about a finding |
| GET | `/exceptions/open/count` |  | how much is waiting for a supervisor |
| POST | `/exceptions/scan/:date` | write | run the fraud rules over one day again |
| GET | `/guests/:guest` |  | what a guest is carrying and where they have been |
| GET | `/reports/daily/:date` |  | the daily operations report |
| GET | `/reports/products` |  | product mix over a period |
| GET | `/reports/season` |  | season to date |
| GET | `/reports/utilisation` |  | lift utilisation over a period |
| GET | `/rides/day/:date` |  | every ride on one operating day |
| POST | `/rides/day/:date/recompute` | write | rebuild one day from the scans on file |
| GET | `/rides/lift/:lift/:date` |  | every ride on one lift on one day |
| GET | `/routes` |  | every route this build serves |
| GET | `/scans/day/:date` |  | every scan on one operating day |
| GET | `/scans/media/:serial` |  | every scan a card has ever made |
| GET | `/scans/terminal/:terminal` |  | every scan one gate has sent |
| GET | `/visits/day/:date` |  | every visit on one operating day |

## scopes

- `ingest`
- `supervise`
- `write`

## problem codes

| code | status |
| --- | --- |
| `bad_date` | 400 |
| `bad_format` | 400 |
| `bad_lift` | 400 |
| `bad_limit` | 400 |
| `bad_media` | 400 |
| `bad_terminal` | 400 |
| `empty_upload` | 400 |
| `forbidden` | 403 |
| `handler_failed` | 500 |
| `invalid_body` | 422 |
| `limit_too_large` | 400 |
| `method_not_allowed` | 405 |
| `missing_parameter` | 400 |
| `no_batch` | 404 |
| `no_exception` | 404 |
| `no_guest` | 404 |
| `not_found` | 404 |
| `reversed_period` | 400 |
| `unreadable_upload` | 422 |
