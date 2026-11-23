# Tid & Sted

Værktøj til avisspalten "Tid & Sted" for Næstved, Faxe, Vordingborg, Slagelse og Sorø. Spalten viser arrangementer for "i dag og i morgen" set fra læserens dag.

Siden opdaterer sig selv: hver morgen mandag–lørdag kører en planlagt Claude-opgave pr. kommune søgningen og lægger resultatet her i repoet. Cloudflare udgiver så siden igen.

## Hvad ligger hvor

| Sti | Indhold |
|---|---|
| `docs/README.md` | Denne vejledning |
| `index.html` | Selve appen – ligger i roden, så den åbnes direkte på repoets adresse |
| `opgave/soegning.md` | Søgeopgaven. Bruges af de automatiske søgninger og af knappen "Søg nu". **Ret her for at ændre, hvordan der søges.** |
| `opgave/ekstra-urler.xlsx` | Excel-arket med ekstra URL'er. Det supplerer de faste steder og lægges sammen med listen, du retter i appen. |
| `scripts/tjek-urler.mjs` + `lib/tjek.js` + `.github/workflows/tjek-urler.yml` | Gratis tjek uden Claude. Kører hver morgen kl. ca. 03.40 og med det samme, når du uploader et nyt ark. Resultatet står i `data/urler.json`. |
| `opgave/kommuner.json` | Kommunernes faste data: steder, mødekilder, fast tid og sted for byrådsmøder, byer og tidspunktet for den automatiske søgning |
| `data/fund/` | Søgeresultater. `<kommune>_<avisdato>.json` er spalten, og `<kommune>_uge_<avisdato>.json` er de næste syv dage. Skrives af de automatiske søgninger. |
| `data/moeder/<kommune>.json` | Politiske møder, som søgningerne har fundet |
| `worker.js`, `wrangler.jsonc`, `.assetsignore` | Opsætningen af Cloudflare-workeren |
| `functions/api/[[path]].js` | Cloudflare-funktion. Gemmer dine OK'er og rettelser, egne møder og steder og indsatte resultater i Cloudflare KV. |

## Adresse

Appen kører på **https://tidogsted.robert-hendel.workers.dev** (en Cloudflare Worker). Opsætningen står i `wrangler.jsonc` og `worker.js` i roden af repoet.

## Opsætning på Cloudflare (gratis, én gang)

1. **Kobl workeren til repoet** (er gjort). Workeren tidogsted er koblet til repoet, så siden udgives automatisk ved hver ændring.
2. **Opret lagerpladsen.** Gå til Storage & Databases → Workers KV, klik Create, og kald den tidogsted. Kopiér dens **ID** og indsæt den i `wrangler.jsonc` (eller giv den til Claude).
3. **Vælg en kode.** Åbn workeren tidogsted og gå til Settings → Variables and Secrets → Add. Vælg Type: Secret, skriv navnet `TS_KODE`, og skriv din kode som værdi. Klik Deploy eller Save.
4. **Skriv koden på siden.** Åbn siden, og skriv koden under Indstillinger. Står der "Data gemmes i Cloudflare. Koden er godkendt.", er du færdig.

Indtil lagerpladsen er sat op, virker siden stadig. OK'er, møder og URL'er gemmes så kun i den browser, du bruger.

## Med og uden Claude

Appen kan køre begge veje. Knapperne findes i to udgaver:

| Opgave | Uden Claude (gratis, med det samme) | Med Claude (finder mere, krydstjekker) |
|---|---|---|
| Søg | **Søg uden Claude**: henter de faste steders sider, dine egne steder og de ekstra URL'er og læser arrangementerne ud | **Søg med Claude**: kopierer søgeopgaven til en Claude-chat. Derudover kører der automatiske Claude-søgninger hver morgen |
| KultuNaut-tekst | **Læs uden Claude** | **Læs med Claude** |
| Rå arrangementer | **Sæt spalten uden Claude**: skriv gerne én pr. linje, fx "Onsdag kl. 19.30 Koncert med X, Grønnegades Kaserne" | **Sæt spalten med Claude** |

Alt, hvad appen finder uden Claude, er markeret [TJEK]. Uden Claude læser appen sider, der viser arrangementer i et kendt format: kalenderfiler (iCal), schema.org eller kort med dato, klokkeslæt og titel som på bibliotekernes lister. Sider uden sådan en opbygning kan den ikke læse. De står under "Kunne ikke læse" efter søgningen, og dem tager Claude-søgningen sig af. Politiske møder finder appen ikke selv. Dem tilføjer du i formularen, eller også finder Claude-søgningen dem.

## Sådan bruges den

- **Kommune og avis.** Appen vælger selv den næste avis ud fra dags dato. Kun om fredagen kan du vælge mellem lørdags- og mandagsavisen.
- **Automatisk søgning.** Den kører hver morgen og tages selv i brug i spalten. "Hent resultat igen" henter det nyeste.
- **"Søg nu"** kopierer søgeopgaven til en ny Claude-chat med websøgning. Chatten giver en JSON-kodeblok, som du indsætter under "Indsæt et resultat i hånden". "Verificér alle med Claude" virker på samme måde.
- **Spalteteksten, rå arrangementer og KultuNaut-fund** gemmes i browseren pr. kommune og avis.

## De faste steder

De faste steder og mødekilder for hver kommune står i `opgave/kommuner.json`. Under "Steder" i appen kan du:
- **Ret:** ændre navn og URL, fx tilføje en URL, der mangler
- **Fjern:** få søgningerne til at springe stedet over. Du skal klikke to gange for at bekræfte.
- **Nulstil:** gå tilbage til det, der står i `kommuner.json`

Rettelserne gemmes i Cloudflare. Søgningerne, "Søg nu" og morgentjekket bruger dem. Faste steder med en URL tjekkes også hver morgen, og deres status står ved stedet, fx "svarer", "3 fund", "ændret" eller "fejl".

## Ekstra URL'er – i appen eller i Excel

Ekstra URL'er supplerer de faste steder. Du kan styre dem to steder, og listerne lægges sammen:

**I appen (nemmest).** Afsnittet "Ekstra URL'er" har disse funktioner:
- **Tilføj og tjek:** lægger en ny URL ind og tjekker den med det samme.
- **Tjek nu:** tjekker en URL igen.
- **Slå fra / Slå til:** springer URL'en over uden at slette den.
- **Ret:** ændrer sted, URL, type eller note.
- **Slet:** fjerner URL'en. Du skal klikke to gange for at bekræfte.
- **Download som Excel:** henter hele den samlede liste.

Det, du ændrer i appen, gemmes i Cloudflare. Du kan også rette og slette rækker, der kommer fra Excel-arket.

**I Excel-arket.** Arket er `opgave/ekstra-urler.xlsx`.
1. Hent det med "Hent Excel-arket" i appen.
2. Ret på fanen URLer.
3. Upload det igen med "Upload nyt ark", eller med *Add file → Upload files* i `opgave` på GitHub. Behold filnavnet.

Hver morgen ca. kl. 03.40 tjekker et script alle aktive URL'er gratis og uden Claude. Det kører også med det samme, når du uploader et nyt ark. For hver URL tjekker det:
- om siden svarer
- om indholdet er ændret siden sidst
- hvilke arrangementer siden viser de næste 10 dage, hvis den har dem i et standardformat (schema.org eller iCal)

Fundene kommer ind i spalten og ugeoversigten som "Excel-liste" og er altid markeret [TJEK]. Claude-søgningerne gennemgår også alle aktive URL'er og krydstjekker fundene.

Appens del ("Tjek nu" og listen i Cloudflare) kræver, at lagerpladsen er sat op. Uden Cloudflare kan du stadig bruge Excel-arket.

## Ændringer

- **Søgningen ændres** i `opgave/soegning.md`.
- **Steder, mødetider og byer ændres** i `opgave/kommuner.json`.
- **Egne steder** kan også tilføjes direkte i appen. De gemmes i Cloudflare og bliver læst af søgningerne.
- **Tidspunktet for de automatiske søgninger** ændres under scheduled tasks i Claude. Ret også `auto` i `kommuner.json`, så appen viser det rigtige tidspunkt.

De automatiske søgninger læser altid den nyeste version af filerne fra `main`.
