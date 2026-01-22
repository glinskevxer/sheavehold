# command reference

Generated from the program. Do not edit by hand.

## `sheavehold about`

what this build is and what it holds

## `sheavehold day`

the daily operations sheet

| argument | required | what it is |
| --- | --- | --- |
| `date` | yes | operating date, YYYY-MM-DD |

| option | default | what it does |
| --- | --- | --- |
| `--format <format>` | `text` | text, json or csv |
| `--rebuild` |  | recompute the day before printing it |
| `--out <file>` |  | write to a file instead of the terminal |

## `sheavehold doctor`

check the store over, reading only

| option | default | what it does |
| --- | --- | --- |
| `--quiet` |  | print nothing unless something is wrong |
| `--warnings` |  | fail the run on warnings too |

## `sheavehold exceptions`

the supervisor work queue

## `sheavehold exceptions decide`

record a decision about a finding

| argument | required | what it is |
| --- | --- | --- |
| `id` | yes | exception id |
| `disposition` | yes | confirmed, dismissed, referred or open |

| option | default | what it does |
| --- | --- | --- |
| `--by <name>` |  | who is deciding |
| `--note <text>` |  | what they want recorded |

## `sheavehold exceptions list`

the register over a period

| argument | required | what it is |
| --- | --- | --- |
| `from` | yes | first operating date |
| `to` | yes | last operating date |

| option | default | what it does |
| --- | --- | --- |
| `--open` |  | only the findings nobody has decided |

## `sheavehold exceptions scan`

run the fraud rules over a day again

| argument | required | what it is |
| --- | --- | --- |
| `date` | yes | operating date |

## `sheavehold guest`

who a guest is and what they hold

## `sheavehold guest household`

everybody on one account

| argument | required | what it is |
| --- | --- | --- |
| `household` | yes | household id |

## `sheavehold guest show`

one guest, by id, printed number or tag serial

| argument | required | what it is |
| --- | --- | --- |
| `who` | yes | guest id, printed card number or tag serial |

| option | default | what it does |
| --- | --- | --- |
| `--as-of <date>` | `2025-01-13` | the date to work the age band out on |

## `sheavehold ingest`

take one or more gate uploads in

| argument | required | what it is |
| --- | --- | --- |
| `files` | yes | upload files to read |

| option | default | what it does |
| --- | --- | --- |
| `--force` |  | store the rows even when the envelope does not check out |
| `--quiet` |  | print only the batches that were refused |

## `sheavehold lift`

what the lifts did

## `sheavehold lift day`

every lift on one day

| argument | required | what it is |
| --- | --- | --- |
| `date` | yes | operating date |

## `sheavehold lift show`

one lift on one day, hour by hour

| argument | required | what it is |
| --- | --- | --- |
| `lift` | yes | lift code |
| `date` | yes | operating date |

## `sheavehold lift utilisation`

utilisation over a period

| argument | required | what it is |
| --- | --- | --- |
| `from` | yes | first operating date |
| `to` | yes | last operating date |

| option | default | what it does |
| --- | --- | --- |
| `--threshold <percent>` | `70` | what counts as a pinched hour |

## `sheavehold replay`

rebuild from the scans on file

## `sheavehold replay all`

restate and rebuild every day on file

| option | default | what it does |
| --- | --- | --- |
| `--dry-run` |  | say what would move without rebuilding anything |

## `sheavehold replay day`

restate and rebuild one day

| argument | required | what it is |
| --- | --- | --- |
| `date` | yes | operating date |

## `sheavehold replay period`

restate and rebuild a period

| argument | required | what it is |
| --- | --- | --- |
| `from` | yes | first operating date |
| `to` | yes | last operating date |

## `sheavehold revenue`

what the season was worth

## `sheavehold revenue days`

what each day was worth

| argument | required | what it is |
| --- | --- | --- |
| `from` | yes | first operating date |
| `to` | yes | last operating date |

| option | default | what it does |
| --- | --- | --- |
| `--weighting <name>` | `even` | one of even, rides, vertical, rate-card |

## `sheavehold revenue passes`

what each unlimited pass cost its holder

## `sheavehold revenue products`

what each product was worth

## `sheavehold season`

the season, not the day

## `sheavehold season compare`

this season against an earlier one

| argument | required | what it is |
| --- | --- | --- |
| `to` | yes | last operating date of this season |

| option | default | what it does |
| --- | --- | --- |
| `--against <date>` |  | the opening of the season to compare with |
| `--from <date>` |  | first operating date, defaults to the season opening |

## `sheavehold season leaderboard`

the vertical leaderboard

| argument | required | what it is |
| --- | --- | --- |
| `to` | yes | last operating date |

| option | default | what it does |
| --- | --- | --- |
| `--from <date>` |  | first operating date, defaults to the season opening |
| `--limit <count>` | `10` | how many to list |

## `sheavehold season products`

the product mix

| argument | required | what it is |
| --- | --- | --- |
| `to` | yes | last operating date |

| option | default | what it does |
| --- | --- | --- |
| `--from <date>` |  | first operating date, defaults to the season opening |

## `sheavehold season summary`

season to date

| argument | required | what it is |
| --- | --- | --- |
| `to` | yes | last operating date |

| option | default | what it does |
| --- | --- | --- |
| `--from <date>` |  | first operating date, defaults to the season opening |

