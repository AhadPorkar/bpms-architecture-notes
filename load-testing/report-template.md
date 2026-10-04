# Load-test run report / Lasttest-Bericht

One page per significant run. Keep the structure identical across runs so that reports can be compared side by side.
*Eine Seite pro relevantem Lauf. Die Struktur bleibt immer gleich, damit sich Berichte nebeneinander vergleichen
lassen.*

| Field / Feld | Value / Wert |
| --- | --- |
| Run id / Lauf-ID | |
| Date, time window / Datum, Zeitfenster | |
| Goal / Ziel | Which question does this run answer? / Welche Frage beantwortet dieser Lauf? |
| Build and configuration / Build und Konfiguration | Version, configuration changes since the last run |
| Environment / Umgebung | App nodes, cores, RAM; SQL Server edition, cores, RAM, storage; proxy |
| Data volume / Datenvolumen | Cases, work items, variable-history rows, form rows, users, organizations |
| Profile / Profil | Name, shape, think time, journey mix |
| Generators / Lastgeneratoren | Count, size, peak CPU and memory |

## Results against criteria / Ergebnisse gegen Kriterien

| Criterion / Kriterium | Target / Ziel | Result / Ergebnis | Pass / Bestanden |
| --- | --- | --- | --- |
| p95 per request / p95 pro Request | < 2 s | | |
| p95 complete task / p95 Aufgabe erledigen | < 4 s | | |
| Throughput / Durchsatz | ≥ 500 tx/s | | |
| Error rate / Fehlerquote | < 1 % | | |
| App CPU at peak / CPU App-Server bei Spitze | < 70 % | | |
| Memory at peak / Speicher bei Spitze | < 75 % | | |
| Recovery after spike / Erholung nach Spike | Baseline within 5 min / Ausgangsniveau innerhalb von 5 min | | |
| Data integrity check / Datenintegrität | No inconsistent instances / Keine inkonsistenten Instanzen | | |

## Bottleneck / Engpass

First resource to saturate, with evidence (metric, query, wait type).
*Erste gesättigte Ressource, mit Beleg (Metrik, Abfrage, Wait-Typ).*

## Change made / Vorgenommene Änderung

One change per run, and its measured effect.
*Eine Änderung pro Lauf und ihre gemessene Wirkung.*

## Open risks / Offene Risiken

What this run did not cover.
*Was dieser Lauf nicht abgedeckt hat.*
