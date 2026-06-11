# Firebase Realtime Database — security rules deploy

Project: `activiteitenweger-9125d` (regio europe-west1)

De repo bevat twee rules-bestanden:

- `database.rules.transitional.json` — staat **6-teken** (legacy) én **14-teken** rooms toe. Nodig zodat de automatische migratie de oude room nog kan lezen/verwijderen.
- `database.rules.json` — **STRIKT**: alleen **14-teken** rooms. Geen read/write op root of op `rooms` zelf (geen listing).

`firebase.json` wijst standaard naar `database.rules.json` (de strikte eindversie).

## Twee-staps deployvolgorde (belangrijk)

Deploy je meteen strikt, dan kunnen toestellen met een oude 6-teken-code niet meer migreren (lezen/verwijderen van de oude room wordt geweigerd). Volg daarom:

### Stap 1 — transitional rules deployen

```sh
npx firebase-tools login
```

Laat `firebase.json` tijdelijk naar de transitional-rules wijzen en deploy. Eenvoudigst:

```sh
cp database.rules.json database.rules.json.bak
cp database.rules.transitional.json database.rules.json
npx firebase-tools deploy --only database
cp database.rules.json.bak database.rules.json   # herstel de strikte versie in de repo
rm database.rules.json.bak
```

### Stap 2 — app-update uitrollen

Rol deze versie van de app uit (nieuwe `js/sync.js`, `sw.js` cache-bump v27). Bestaande toestellen met een 6-teken-code migreren bij de volgende start automatisch naar een veilige 14-teken-code.

### Stap 3 — strikte rules deployen

Wacht tot alle toestellen gemigreerd zijn (toon-de-nieuwe-code-modal verschenen, andere toestellen opnieuw verbonden met de nieuwe code), deploy dan de strikte eindversie:

```sh
npx firebase-tools deploy --only database
```

(`firebase.json` wijst al naar `database.rules.json`.)

## Datastructuur die de rules toelaten

Onder `rooms/<14-teken-code>`:

- `activities` — object: dagsleutel → array activiteiten
- `energy` — object: dagsleutel → energiewaarde
- `baseline` — array met basisniveau-historiek
- `meta` — object: dagsleutel → `{ m: <timestamp> }`
- `lastModified` — number (`isNumber()`)

`$other: false` weert alle andere top-level keys onder een room.

## Let op

RTDB rules-JSON ondersteunt geen comments in alle tooling — houd `database.rules*.json` puur JSON.
