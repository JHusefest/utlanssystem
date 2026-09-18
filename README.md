# Utlånssystem

Webapplikasjon for å holde orden på IT-utstyr som lånes ut til elever.

- **Backend:** Python / FastAPI + SQLAlchemy
- **Database:** PostgreSQL
- **Frontend:** Next.js (React) med ren CSS – ingen byggeavhengigheter utover Next
- **Kjøring:** Docker Compose – én kommando, samme oppsett overalt

---

## Kom i gang

Du trenger [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac, Windows) eller Docker Engine (Linux).

```bash
cd utlanssystem
cp .env.example .env       # og fyll inn egne passord
docker compose up --build
```

Åpne <http://localhost:3000>.

Første gang opprettes en administrator automatisk, med brukernavnet og passordet du satte i `.env`
(`FIRST_ADMIN_USERNAME` / `FIRST_ADMIN_PASSWORD`). **Logg inn og bytt passordet med én gang**
under *Min konto → Bytt passord*.

Stopp med `Ctrl+C`, eller `docker compose down`. Dataene ligger trygt i Docker-volumet `db-data`
og overlever omstart.

---

## Hvem kan gjøre hva

| Handling | Uten innlogging | Vanlig bruker | Administrator |
|---|:--:|:--:|:--:|
| Se utstyrsliste og hvem som har lånt hva | ✅ | ✅ | ✅ |
| Be om å låne utstyr | – | ✅ | ✅ |
| Godkjenne eller avslå en forespørsel | – | – | ✅ |
| Trekke sin egen ubehandlede forespørsel | – | ✅ | ✅ |
| Melde inn at utstyr er levert | – | ✅ | ✅ |
| Bekrefte at utstyr faktisk er tilbake | – | – | ✅ |
| Legge til / endre / slette utstyr | – | – | ✅ |
| Importere utstyr fra Excel | – | – | ✅ |
| Opprette / endre / slette brukere | – | – | ✅ |

Hele oversikten er åpen uten innlogging – innlogging kreves først når noen skal
*gjøre* noe.

---

## Slik flyter et lån

Ingenting skifter hender uten at en lærer har sagt ja, og ingenting regnes som
levert før en lærer har sett at det står i skapet.

```
              eleven ber om                  læreren
              å låne noe                     godkjenner
   [ledig] ──────────────► [Venter på ──────────────────► [Utlånt]
      ▲                     godkjenning]                     │
      │                          │                           │ eleven melder
      │        læreren avslår,   │                           │ inn retur
      │        eller eleven      │                           ▼
      │        trekker           │                    [Retur til
      │◄─────────────────────────┘                     bekreftelse]
      │                                                      │
      │            læreren bekrefter at det står i skapet     │
      └───────────────────────────────────────────────────────┘
```

Statusene et lån kan ha:

| Status | Betyr | Utstyret er |
|---|---|---|
| Venter på godkjenning | Eleven har bedt om å låne | reservert |
| Utlånt | Godkjent og utlevert | ute |
| Retur til bekreftelse | Eleven sier det er levert | fortsatt ute |
| Levert | Læreren har bekreftet | ledig |
| Avslått | Læreren sa nei | ledig |
| Trukket | Eleven ombestemte seg | ledig |

Tre ting er verdt å merke seg:

- **En forespørsel holder av utstyret.** Ingen andre kan be om den samme PC-en
  mens forespørselen ligger i kø. Derfor bør du avslå det du ikke skal
  gjennomføre, i stedet for å la det ligge.
- **Innmeldt retur frigir ingenting.** Utstyret står som elevens ansvar helt til
  du har bekreftet det. Står det ikke i skapet likevel, trykker du «Står ikke i
  skapet», og lånet går tilbake til aktivt.
- **Administratorer godkjenner ikke seg selv.** Låner du noe som administrator,
  blir det aktivt med en gang. Du kan også registrere retur rett fra et aktivt
  lån når eleven står foran deg i døra – uten å vente på at hen melder inn.

Køen ligger under **Godkjenning** i menyen, med en teller som viser hvor mange
saker som venter.

---


## Utstyr: to måter å telle på

Systemet håndterer begge deler samtidig:

- **Unik enhet** – én rad per fysisk gjenstand, med eget serienummer.
  Bruk dette for PC-er, nettbrett, Raspberry Pi og annet du vil kunne spore
  enkeltvis. Statusen veksler automatisk mellom *ledig* og *utlånt*.
- **Antallsbasert** – én rad for mange like ting, med et totalantall.
  Bruk dette for HDMI-kabler, ladere, musematter. Systemet regner ut hvor mange
  som er ledige (totalt minus det som er ute).

---

## Importere utstyr fra Excel

1. Logg inn som administrator og gå til **Adm. utstyr**.
2. Klikk **Last ned Excel-mal** – malen har riktige kolonner, nedtrekkslister og
   et eget ark med veiledning.
3. Fyll inn utstyret ditt (slett eksempelradene).
4. Klikk **Importer Excel** og velg filen.

Du får en oppsummering med hvor mange rader som ble opprettet, oppdatert og hoppet over,
samt merknader for hver rad som hadde noe rart i seg.

### Kolonner

| Kolonne | Påkrevd | Beskrivelse |
|---|:--:|---|
| Navn | ✅ | Navnet på utstyret |
| Kategori | | Gjør det lett å filtrere, f.eks. «Bærbar PC» |
| Type | | `unik` eller `antall`. Tomt = `unik` hvis serienummer er fylt ut, ellers `antall` |
| Serienummer | | Kun for `unik`. Må være unikt |
| Merkelapp | | Intern ID / klistremerke |
| Antall | | Kun for `antall`. Totalt antall stk |
| Plassering | | F.eks. «Skap A, hylle 1» |
| Status | | `ledig`, `service` eller `utrangert`. Tomt = ledig |
| Beskrivelse | | Fritekst |

Engelske overskrifter (`Name`, `Category`, `Serial number` …) godtas også.
Setter du `utlånt` i Status-kolonnen, blir den lest som `ledig` – om noe er
utlånt styres av lånene i appen, ikke av regnearket.

**Importen er trygg å kjøre flere ganger.** Rader med samme serienummer oppdaterer
eksisterende utstyr i stedet for å lage duplikater. Antallsbasert utstyr kjennes igjen
på navn + kategori. Hvis én rad feiler, blir bare den hoppet over – resten importeres.

---

## Flytte applikasjonen til en annen maskin

Hele poenget med Docker-oppsettet: du trenger ikke installere Python, Node eller
PostgreSQL på serveren – bare Docker.

```bash
# På den nye maskinen
git clone <ditt-repo>        # eller kopier mappa dit
cd utlanssystem
cp .env.example .env         # husk nye, sterke passord
docker compose up -d --build
```

Applikasjonen svarer nå på port 3000. Endre `APP_PORT` i `.env` hvis du vil ha en annen port.

### Ta med dataene

```bash
# Sikkerhetskopi
docker compose exec db pg_dump -U utlaan utlaan > backup.sql

# Gjenopprett på ny maskin
cat backup.sql | docker compose exec -T db psql -U utlaan utlaan
```

Lag gjerne en fast rutine på dette – det er den eneste kopien av lånehistorikken.

### Før du legger den på nett

- Sett en lang, tilfeldig `SECRET_KEY` (`openssl rand -hex 32`).
- Bytt alle standardpassord i `.env`.
- Legg en omvendt proxy (Caddy, Nginx, Traefik) foran med HTTPS. Uten HTTPS går
  passord i klartekst over nettverket.
- Vurder om applikasjonen bør ligge på skolens interne nett i stedet for åpent internett.

---

## Utvikling uten Docker

**Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg://utlaan:utlaan@localhost:5432/utlaan"
uvicorn app.main:app --reload
```

API-dokumentasjon: <http://localhost:8000/docs>

**Frontend**

```bash
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

<http://localhost:3000>

---

## Prosjektstruktur

```
utlanssystem/
├── docker-compose.yml       Postgres + backend + frontend
├── .env.example             Mal for miljøvariabler
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py          Oppstart, tabeller, første admin
│       ├── config.py        Innstillinger fra miljøvariabler
│       ├── database.py      Tilkobling og økter
│       ├── models.py        User, Equipment, Loan
│       ├── schemas.py       Validering inn og ut
│       ├── security.py      Passordhashing (bcrypt) og JWT
│       ├── deps.py          Innlogging og rollesjekk
│       ├── excel.py         Lesing og skriving av Excel
│       └── routers/         auth, users, equipment, loans, stats
└── frontend/
    ├── Dockerfile
    ├── app/                 Sider (Next.js App Router)
    ├── components/          Header, dialoger, UI-byggeklosser
    └── lib/                 API-klient, typer, formatering
```

### Om databaseskjemaet

Prosjektet bruker ikke Alembic. Tabeller opprettes med
`Base.metadata.create_all`, og endringer på tabeller som allerede finnes ligger
som idempotent SQL i `migrate_schema()` i `main.py`. Den kjøres ved hver
oppstart og kan trygt kjøres om igjen.

Legger du til felter senere, må du enten utvide den funksjonen eller nullstille
databasen med `docker compose down -v` – det siste sletter all lånehistorikk.

---

## Feilsøking

**«port is already allocated»** – noe annet bruker port 3000. Sett `APP_PORT=3001` i `.env`.

**Backend starter ikke** – den venter på at databasen skal bli klar og prøver på nytt i opptil
et minutt. Se loggen med `docker compose logs -f backend`.

**Glemt admin-passord** – opprett en ny admin direkte i databasen, eller tøm databasen og start
på nytt (dette sletter alt): `docker compose down -v && docker compose up --build`.

**Endringer i koden vises ikke** – bygg på nytt: `docker compose up --build`.
