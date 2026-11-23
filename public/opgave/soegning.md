# Søgeopgave – avisspalten "Tid & Sted"

Denne fil er den fælles søgeopgave. Den bruges både af de automatiske morgensøgninger og af knappen "Søg nu" i appen. Ret i filen for at ændre, hvordan der søges.

Skriv alt på dansk. Kommunens faste data (navn, byer, steder, mødekilder, fast tid og sted for byrådsmøder) står i `public/opgave/kommuner.json` – eller er sat ind over denne tekst.

## A. Find avisen

Find dags dato i Europe/Copenhagen. Spalten laves dagen før udgivelse og viser arrangementer for "i dag og i morgen" set fra læserens dag:

- mandag–torsdag: næste dags avis (fx tirsdag → avis onsdag, dækker onsdag + torsdag)
- fredag: BÅDE lørdagsavisen (lørdag + søndag) OG mandagsavisen (mandag + tirsdag) – lav hele opgaven for hver af dem
- lørdag og søndag: mandagsavisen (mandag + tirsdag)

AVIS = avisens dato (YYYY-MM-DD). DAGE = [AVIS, AVIS+1]. UGE = de syv dage AVIS+2 … AVIS+8.

Er avisen allerede angivet over denne tekst, så brug den.

## B. Regler for spalten

- Kun arrangementer i kommunen. Tjek byen ved hvert arrangement.
- Aflyste arrangementer udelades helt – også fra noten.
- Almindelige gudstjenester og almindelige biografforestillinger tages ikke med.
- Gæt aldrig et tidspunkt. Mangler tiden, så `"start": ""` og `"krydstjekket": false`.
- Titlen skal sige, hvem der optræder eller holder oplægget – aldrig "Koncert" eller "Foredrag" alene.
- Ingen priser, beskrivelser eller links i spalten.
- [UDSOLGT] ved udsolgt. [TJEK] ved ikke-bekræftet eller manglende tid.
- Hvert arrangement krydstjekkes på stedets egen officielle side. Samlekalendere (KultuNaut, Dit Næstved m.fl.) og billetsider tæller IKKE som officielle.

Format:

- Dagsoverskrift: "Mandag den 23. november"
- Én linje pr. arrangement, sorteret efter tid, linjeskift efter hver: `kl. [start]–[slut] – [Titel], [Sted]`
- Tider: "kl. 13", "kl. 08–14", "kl. 10.10–10.45". Tankestreg (–), aldrig bindestreg. Ingen orddeling.
- Byrådsmøde: "kl. 18.30 – Byrådsmøde, Byrådssalen, Næstved Rådhus". Borgermøde: "kl. 17–19 – Borgermøde om [emne], [Sted]".

## C. Trin (brug websøgning og hent siderne)

0. **Tjekliste.** Gennemgå kommunens steder og mødekilder én for én – også brugerens egne steder (se D.1) og de ekstra URL'er fra Excel-arket (se D.1) – og notér resultatet for hvert sted, også "intet på datoerne".
0b. **KultuNaut.** Læs listen for kommunen side for side, 12 arrangementer pr. side:
   `https://www.kultunaut.dk/perl/arrlist2/type-nynaut?startnr=1&Area=<Kommunenavn>-storkommune&`, derefter startnr=13, 25, 37 … til datoerne er passeret. Tjek byen ved hvert arrangement – områdefilteret virker ikke altid. KultuNaut er kun et spor; krydstjek altid på stedets egen side.
1. **Søg bredt** efter arrangementer på DAGE: koncerter, foredrag, teater, udstillingsåbninger, markeder, sport, foreningsarrangementer.
1a. **Ekstra** for kommunen (feltet `ekstra`), fx hjemmekampe.
1b. **Politiske møder** fra første dag i DAGE til sidste dag i UGE: byrådsmøder/kommunalbestyrelsesmøder, borgermøder, høringsmøder og åbne udvalgsmøder. Brug kommunens mødekilder og kommune-tv. Fast tid og sted står i kommunens data – men dagsordenen afgør altid. Afviser en dagsordensportal automatisk hentning, så find dagsordenerne via websøgning.
2. **Krydstjek** alle arrangementer på stedets officielle side. Notér "Krydstjekket: ja/nej" og kilden pr. arrangement.
3. **Formatér** spalten efter reglerne i B.
U. **De næste syv dage** (lettere søgning): stederne, KultuNaut og møderne for UGE. Krydstjek så vidt muligt. Ikke til tryk.

## D. Gem resultatet

### D.1 Brugerens egne steder og ekstra URL'er

- Hent `<site>/api/data/kilder` (site står i kommuner.json). Det er et JSON-objekt; tag de poster med, hvor `kommune` er kommunens id. Kan siden ikke hentes, så fortsæt uden.
- Læs `public/data/urler.json` (i repoet, eller `<site>/data/urler.json`). Det er brugerens Excel-ark `public/opgave/ekstra-urler.xlsx`, tjekket af et script samme morgen. Tag de URL'er med, hvor `kommune` er kommunens id og `aktiv` ikke er false, og følg `note`. URL'er med `"aendret": true` er ændret siden i går – kig ekstra efter nye arrangementer dér. Arrangementerne under `arrangementer` er fundet automatisk og ikke krydstjekket: krydstjek dem og tag dem med i spalten, hvis de holder. Ved manuel kørsel står URL'erne allerede i kommunens data som `ekstra_urler`.

### D.2 Med adgang til repoet (de automatiske søgninger)

Repoet er `roberthendel-dk/tidogsted`. Skriv disse filer (kommune-id fx `naestved`):

1. `public/data/fund/<id>_<AVIS>.json` – spalten:

```json
{"type":"spalte","kommune":"<id>","avis":"<AVIS>","dage":["<dag1>","<dag2>"],"opdateret":"<ISO-tid>","af":"automatisk",
 "spalte":"<færdig spaltetekst med dagsoverskrifter og \n mellem linjerne>",
 "note":"<hvert arrangement med 'Krydstjekket: ja/nej' og kilde, og tjeklisten pr. sted>",
 "arrangementer":[{"dato":"YYYY-MM-DD","start":"HH:MM eller tom","slut":"HH:MM eller tom","titel":"…","sted":"…","kilde":"https://… (officiel side)","krydstjekket":true,"udsolgt":false}],
 "tjekliste":[{"sted":"…","resultat":"…"}],
 "kilder":[{"navn":"…","url":"https://…"}]}
```

2. `public/data/fund/<id>_uge_<AVIS>.json` – de næste syv dage:

```json
{"type":"uge","kommune":"<id>","avis":"<AVIS>","dage":["…7 datoer…"],"opdateret":"<ISO-tid>","af":"automatisk",
 "arrangementer":[{"dato":"…","start":"…","slut":"…","titel":"…","sted":"…","kilde":"…","krydstjekket":false,"udsolgt":false}]}
```

3. `public/data/moeder/<id>.json` – kommunens politiske møder. Læs filen, hvis den findes. Fjern møder før i dag, og erstat/tilføj møderne fra denne søgning (samme `id` = samme møde):

```json
{"kommune":"<id>","opdateret":"<ISO-tid>",
 "moeder":[{"id":"<id>_<dato>_<kort-navn>","dato":"YYYY-MM-DD","start":"HH:MM","slut":"","type":"raad|borger|hoering|udvalg","titel":"Byrådsmøde / Borgermøde om …","sted":"…","kilde":"https://…","krydstjekket":true}]}
```

Filnavne og id'er: kun a–z, 0–9, `-`, `_` og `.` (ingen æ, ø, å). Rør ikke andre filer.

Skriv og push spalten (fil 1) og møderne (fil 3), så snart de er klar – før ugesøgningen – så de er gemt, selv hvis resten fejler. Commit på `main` med en besked som "Søgning: Næstved, avis 2026-11-24". Før push: `git pull --rebase origin main`. Afvises push, så pull igen og prøv op til tre gange. Cloudflare Pages udgiver automatisk siden igen efter hvert push.

### D.3 Uden adgang til repoet (knappen "Søg nu" i en almindelig chat)

Giv hele resultatet i ÉN kodeblok med JSON, som brugeren indsætter i appen under "Indsæt et resultat i hånden":

```json
{"fund":{…som fil 1…},"uge":{…som fil 2, hvis du har lavet den…},"moeder":[…møderne som i fil 3…]}
```

## E. Slut

Afslut med en kort opsummering: avis(er), antal arrangementer, antal krydstjekket, møder fundet, og hvad der mangler. Gik noget galt med at gemme, så skriv det tydeligt øverst.
