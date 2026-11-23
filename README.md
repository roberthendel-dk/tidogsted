# Tid & Sted

Værktøj til avisspalten "Tid & Sted" for Næstved, Faxe, Vordingborg, Slagelse og Sorø. Spalten viser arrangementer for "i dag og i morgen" set fra læserens dag.

Siden opdaterer sig selv: hver morgen mandag–lørdag kører en planlagt Claude-opgave pr. kommune søgningen og lægger resultatet her i repoet. Cloudflare Pages udgiver så siden igen.

## Hvad ligger hvor

| Sti | Indhold |
|---|---|
| `public/index.html` | Selve appen |
| `public/opgave/soegning.md` | Søgeopgaven. Bruges af de automatiske søgninger og af knappen "Søg nu". **Ret her for at ændre, hvordan der søges.** |
| `public/opgave/ekstra-urler.xlsx` | **Dit Excel-ark med ekstra URL'er.** Det supplerer de faste steder. Tilføj, slet eller slå rækker fra (Aktiv = nej), og upload arket igen. |
| `scripts/tjek-urler.mjs` + `.github/workflows/tjek-urler.yml` | Gratis tjek uden Claude. Kører hver morgen kl. ca. 03.40 og med det samme, når du uploader et nyt ark. Resultatet står i `public/data/urler.json`. |
| `public/opgave/kommuner.json` | Kommunernes faste data: steder, mødekilder, fast tid og sted for byrådsmøder, byer og tidspunktet for den automatiske søgning |
| `public/data/fund/` | Søgeresultater. `<kommune>_<avisdato>.json` er spalten, og `<kommune>_uge_<avisdato>.json` er de næste syv dage. Skrives af de automatiske søgninger. |
| `public/data/moeder/<kommune>.json` | Politiske møder, som søgningerne har fundet |
| `functions/api/[[path]].js` | Cloudflare-funktion. Gemmer dine OK'er og rettelser, egne møder og steder og indsatte resultater i Cloudflare KV. |

## Opsætning på Cloudflare (gratis)

1. **Opret Pages-projektet.** I Cloudflare: *Workers & Pages → Create → Pages → Connect to Git*. Vælg repoet `roberthendel-dk/tidogsted`.
   - Projektnavn: `tidogsted`, så adressen bliver https://tidogsted.pages.dev. Hvis du vælger et andet navn, så ret `site` i `public/opgave/kommuner.json`.
   - Build command: *(tom)*
   - Build output directory: `public`
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

## Excel-arket med ekstra URL'er

1. **Hent arket.** Brug linket "Hent arket" under "Steder" i appen, eller åbn `public/opgave/ekstra-urler.xlsx` på GitHub og vælg Download.
2. **Ret på fanen URLer.** Du kan tilføje en række, slette en række eller sætte Aktiv til "nej". Kommune, Type og Aktiv har rullelister.
3. **Upload arket.** Brug "Upload nyt ark" i appen, eller *Add file → Upload files* i mappen `public/opgave` på GitHub. Behold filnavnet `ekstra-urler.xlsx`, og tryk *Commit changes*.

Scriptet tjekker for hver URL:
- om siden svarer
- om indholdet er ændret siden sidst
- hvilke arrangementer siden viser de næste 10 dage, hvis den har dem i et standardformat (schema.org eller iCal)

Fundene kommer ind i spalten og ugeoversigten som "Excel-liste" og er altid markeret [TJEK]. Claude-søgningerne gennemgår også alle aktive URL'er og krydstjekker fundene. Under "Kørsler" kan du se, om tjekket er gået godt.

## Ændringer

- **Søgningen ændres** i `public/opgave/soegning.md`.
- **Steder, mødetider og byer ændres** i `public/opgave/kommuner.json`.
- **Egne steder** kan også tilføjes direkte i appen. De gemmes i Cloudflare og bliver læst af søgningerne.
- **Tidspunktet for de automatiske søgninger** ændres under scheduled tasks i Claude. Ret også `auto` i `kommuner.json`, så appen viser det rigtige tidspunkt.

De automatiske søgninger læser altid den nyeste version af filerne fra `main`.
