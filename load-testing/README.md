# Load-testing kit

[English](#english) · [Deutsch](#deutsch)

## English

k6 scripts and a mock API that go with [the load-testing method](../docs/en/04-load-testing.md). The scripts model
users of a BPM web application: they log in once, browse the inbox, complete tasks, start cases, open dashboards and
upload attachments, with think time between actions. The mock API imitates the *shape* of such a system so that every
profile can be tried without a real target. It is not the API of any real product.

### Layout

```text
load-testing/
├── k6/
│   ├── main.js            entry point: options, scenarios, user assignment
│   ├── lib/config.js      environment variables
│   ├── lib/profiles.js    smoke, load, stress, spike, soak, login-storm, throughput
│   ├── lib/journeys.js    user journeys and their mix
│   ├── lib/session.js     login, token renewal, authenticated requests
│   ├── lib/metrics.js     business-transaction metrics
│   └── data/users.csv     400 synthetic users in 4 organizations
├── mock-api/server.js     Node.js mock, no dependencies
├── scripts/
│   ├── generate-users.mjs create N synthetic users
│   └── run-distributed.sh split a run over several generators
├── docker-compose.yml     mock API + k6 in containers
└── report-template.md     one-page run report
```

### Quick start

```bash
node mock-api/server.js &                       # http://localhost:8080
k6 run -e PROFILE=smoke -e THINK_MIN_S=0.2 -e THINK_MAX_S=0.5 k6/main.js
```

Or with containers only:

```bash
docker compose up --abort-on-container-exit     # PROFILE=smoke by default
PROFILE=spike SCALE=0.02 DURATION_FACTOR=0.05 docker compose up --abort-on-container-exit
```

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | System under test |
| `PROFILE` | `smoke` | `smoke`, `load`, `stress`, `spike`, `soak`, `login-storm`, `throughput` |
| `SCALE` | `1` | Multiplies users and rates (e.g. `0.02` for a laptop rehearsal) |
| `DURATION_FACTOR` | `1` | Multiplies durations (e.g. `0.05` for a dry run) |
| `THINK_MIN_S` / `THINK_MAX_S` | `5` / `13` | Think time range in seconds |
| `P95_MS` | `2000` | p95 threshold per request; business transactions get twice this |
| `MAX_ERROR_RATE` | `0.01` | Maximum share of failed requests |
| `SOAK_MINUTES` | `2880` | Soak duration (48 h) |
| `UPLOAD_KIB` | `200` | Attachment size |

Mock API: `PORT`, `MOCK_LATENCY_MS`, `MOCK_JITTER_MS`, `MOCK_ERROR_RATE`, `TOKEN_TTL_S`.

### Against a real system

1. Create at least as many test users as virtual users, spread over organizations and roles:
   `node scripts/generate-users.mjs 5000 4 > k6/data/users.csv`, then import the accounts into the system under test.
2. Map the endpoints in `lib/session.js` and `lib/journeys.js` to your API.
3. Replace the journey weights with the mix measured in your access logs.
4. Run `smoke`, then `load`, then the rest. Follow the protocol in the method document.

Pass `--no-usage-report` (or set `K6_NO_USAGE_REPORT=true`) on networks without internet access.

---

## Deutsch

k6-Skripte und eine Mock-API zur [Lasttest-Methode](../docs/de/04-load-testing.md). Die Skripte bilden Benutzer einer
BPM-Webanwendung nach: Sie melden sich einmal an, blättern im Posteingang, erledigen Aufgaben, starten Fälle,
öffnen Dashboards und laden Anhänge hoch, mit Denkzeit zwischen den Aktionen. Die Mock-API ahmt die *Form* eines
solchen Systems nach, damit sich jedes Profil ohne echtes Zielsystem ausprobieren lässt. Sie ist nicht die API eines
realen Produkts.

### Schnellstart

```bash
node mock-api/server.js &                       # http://localhost:8080
k6 run -e PROFILE=smoke -e THINK_MIN_S=0.2 -e THINK_MAX_S=0.5 k6/main.js
```

Nur mit Containern:

```bash
docker compose up --abort-on-container-exit     # standardmäßig PROFILE=smoke
PROFILE=spike SCALE=0.02 DURATION_FACTOR=0.05 docker compose up --abort-on-container-exit
```

### Einstellungen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:8080` | Zu testendes System |
| `PROFILE` | `smoke` | `smoke`, `load`, `stress`, `spike`, `soak`, `login-storm`, `throughput` |
| `SCALE` | `1` | Multipliziert Benutzerzahlen und Raten (z. B. `0.02` für eine Probe auf dem Laptop) |
| `DURATION_FACTOR` | `1` | Multipliziert Laufzeiten (z. B. `0.05` für einen Probelauf) |
| `THINK_MIN_S` / `THINK_MAX_S` | `5` / `13` | Bereich der Denkzeit in Sekunden |
| `P95_MS` | `2000` | p95-Schwelle pro Request; Geschäftstransaktionen erhalten das Doppelte |
| `MAX_ERROR_RATE` | `0.01` | Maximaler Anteil fehlgeschlagener Requests |
| `SOAK_MINUTES` | `2880` | Dauer des Dauertests (48 h) |
| `UPLOAD_KIB` | `200` | Größe des Anhangs |

Mock-API: `PORT`, `MOCK_LATENCY_MS`, `MOCK_JITTER_MS`, `MOCK_ERROR_RATE`, `TOKEN_TTL_S`.

### Gegen ein echtes System

1. Mindestens so viele Testbenutzer wie virtuelle Benutzer anlegen, verteilt auf Organisationen und Rollen:
   `node scripts/generate-users.mjs 5000 4 > k6/data/users.csv`, danach die Konten in das Zielsystem importieren.
2. Die Endpunkte in `lib/session.js` und `lib/journeys.js` auf die eigene API abbilden.
3. Die Gewichte der Journeys durch den Mix aus den eigenen Zugriffsprotokollen ersetzen.
4. Zuerst `smoke`, dann `load`, dann den Rest ausführen. Dabei dem Protokoll im Methodendokument folgen.

In Netzen ohne Internetzugang `--no-usage-report` übergeben (oder `K6_NO_USAGE_REPORT=true` setzen).
