# Tid & Sted

Værktøj til avisspalten "Tid & Sted" for Næstved, Faxe, Vordingborg, Slagelse og Sorø. Spalten viser arrangementer for "i dag og i morgen" set fra læserens dag.

Siden opdaterer sig selv: hver morgen mandag–lørdag kører en planlagt Claude-opgave pr. kommune søgningen og lægger resultatet her i repoet. Cloudflare Pages udgiver så siden igen.

## Hvad ligger hvor

| Sti | Indhold |
|---|---|
| `docs/` | Det tekniske bag appen: denne vejledning, morgenscriptet og den fælles tjek-kode |
| `index.html` | Selve appen – ligger i roden, så den åbnes direkte på repoets adresse |
| `opgave/soegning.md` | Søgeopgaven. Bruges af de automatiske søgninger og af knappen "Søg nu". **Ret her for at ændre, hvordan der søges.** |
| `opgave/ekstra-urler.xlsx` | Excel-arket med ekstra URL'er. Det supplerer de faste steder og lægges sammen med listen, du retter i appen. |
| `docs/scripts/tjek-urler.mjs` + `docs/lib/tjek.js` + `.github/workflows/tjek-urler.yml` | Gratis tjek uden Claude. Kører hver morgen kl. ca. 03.40 og med det samme, når du uploader et nyt ark. Resultatet står i `data/urler.json`. |
| `opgave/kommuner.json` | Kommunernes faste data: steder, mødekilder, fast tid og sted for byrådsmøder, byer og tidspunktet for den automatiske søgning |
| `data/fund/` | Søgeresultater. `<kommune>_<avisdato>.json` er spalten, og `<kommune>_uge_<avisdato>.json` er de næste syv dage. Skrives af de automatiske søgninger. |
| `data/moeder/<kommune>.json` | Politiske møder, som søgningerne har fundet |
| `functions/api/[[path]].js` (skal ligge i roden) | Cloudflare-funktion. Gemmer dine OK'er og rettelser, egne møder og steder og indsatte resultater i Cloudflare KV. |

## Adresser

- **GitHub Pages:** https://roberthendel-dk.github.io/tidogsted/, hvis Pages er sat op fra roden af `main`. Her virker alt undtagen det, der skal gemmes i Cloudflare. OK'er, møder og URL'er, du tilføjer i appen, gemmes kun i den browser, du bruger.
- **Cloudflare Pages:** https://tidogsted.pages.dev. Her virker alt.

Filen `.nojekyll` sørger for, at GitHub Pages viser filerne, som de er.

## Opsætning på Cloudflare (gratis)

1. **Opret Pages-projektet.** I Cloudflare: *Workers & Pages → Create → Pages → Connect to Git*. Vælg repoet `roberthendel-dk/tidogsted`.
   - Projektnavn: `tidogsted`, så adressen bliver https://tidogsted.pages.dev. Hvis du vælger et andet navn, så ret `site` i `opgave/kommuner.json`.
   - Build command: *(tom)*
   - Build output directory: `/` (roden)
2. **Opret KV.** Gå til *Storage & Databases → KV → Create*, og opret et navnerum, fx `tidogsted`.
3. **Forbind KV.** Åbn Pages-projektet og vælg *Settings → Bindings → Add → KV namespace*. Variabelnavnet skal være `TS`, og navnerummet er `tidogsted`.
4. **Sæt en kode.** Under *Settings → Variables and Secrets* tilføjer du secret'en `TS_KODE`, som er koden, der skal til for at gemme. Skriv samme kode i appen under *Indstillinger*.
5. Deploy igen, så bindingerne virker.

Alt kører på gratisniveauerne. Der bruges ikke noget betalt Claude-API: "Sæt spalten" og "Hent arrangementer fra KultuNaut" kopierer opgaven til en almindelig Claude-chat, og du indsætter svaret.

Uden KV virker appen stadig. OK'er, møder og egne steder gemmes så bare kun i den browser, du bruger.

## Sådan bruges den

- **Kommune og avis.** Appen vælger selv den næste avis ud fra dags dato. Kun om fredagen kan du vælge mellem lørdags- og mandagsavisen.
- **Automatisk søgning.** Den kører hver morgen og tages selv i brug i spalten. "Hent resultat igen" henter det nyeste.
- **"Søg nu"** kopierer søgeopgaven til en ny Claude-chat med websøgning. Chatten giver en JSON-kodeblok, som du indsætter under "Indsæt et resultat i hånden". "Verificér alle med Claude" virker på samme måde.
- **Spalteteksten, rå arrangementer og KultuNaut-fund** gemmes i browseren pr. kommune og avis.

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

Appens del ("Tjek nu" og listen i Cloudflare) kræver, at Cloudflare er sat op. Uden Cloudflare kan du stadig bruge Excel-arket.

## Ændringer

- **Søgningen ændres** i `opgave/soegning.md`.
- **Steder, mødetider og byer ændres** i `opgave/kommuner.json`.
- **Egne steder** kan også tilføjes direkte i appen. De gemmes i Cloudflare og bliver læst af søgningerne.
- **Tidspunktet for de automatiske søgninger** ændres under scheduled tasks i Claude. Ret også `auto` i `kommuner.json`, så appen viser det rigtige tidspunkt.

De automatiske søgninger læser altid den nyeste version af filerne fra `main`.
