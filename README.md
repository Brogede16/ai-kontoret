# Mads' AI-kontor

En første, interaktiv prototype af det grafiske AI-kontor: flere roller, manager-chat, projekter, beslutningsindbakke og et mobiltilpasset kontor.

Denne version er bevidst et lokalt, sikkert første kontrolrum. Den gemmer projekter, opgaver, beslutninger og aktivitet på Mac'en. Den kan bede en læse- og rådgivningsbegrænset Codex-manager om et struktureret arbejdsspor, men foretager ikke GitHub-ændringer, deploys, køb eller filændringer på vegne af modeller.

## Åbn prototypen

Kør nedenstående i projektmappen, og åbn derefter `http://127.0.0.1:4173`.

```bash
node server.mjs
```

Serveren giver UI'et en lokal, skrivebeskyttet Codex-manager. Den kræver, at Codex allerede er logget ind på Mac'en. Den bruger den eksisterende ChatGPT/Codex-login, har kun ét aktivt job ad gangen, har en tidsgrænse på to minutter og kan ikke skrive filer, deploye eller bruge API-nøgler.

Hvis Codex ikke findes på Mac'en, starter kontoret stadig. Det viser så "Manageren er ikke forbundet" i stedet for at lade som om, og alt andet end managerens oplæg virker.

### Lokal sikkerhed

Serveren lytter kun på `127.0.0.1`, men det alene beskytter ikke mod andre hjemmesider i samme browser. Derfor:

- afvises forespørgsler med et fremmed `Host`-navn (DNS-rebinding)
- skal alle POSTs være JSON og må ikke komme fra en fremmed `Origin` (skjulte cross-site-forespørgsler)
- serveres kun `index.html`, `app.js` og de to stylesheets — aldrig kildekode, `.git`, `data/` eller docs.

## Det er bygget nu

- Et levende, Game Dev Tycoon-inspireret kontor på desktop og mobil.
- Fem faste medarbejderroller med opgavekort, materialer og ærlig status.
- En talentbank med spildesigner, grafiker, tekstforfatter og marketingperson. Manageren kan bemande dem pr. projekt, men de er ikke automatisk forbundet til en model eller et værktøj.
- En forbindelsesoversigt, der skiller de reelle lokale worker-forbindelser fra rollerne og viser deres begrænsninger.
- Managerens fritekstfelt til idéer og feedback, koblet til en lokal, læsebegrænset Codex-manager når serveren kører.
- En kort indbakke med managerens arbejdsspor og de beslutninger, der venter på Mads.
- En læsbar projektsamtale med Mads' beskeder, managerens oplæg og registrerede beslutninger — ikke skjulte modeltanker.
- Et chef-lag med direktionsbeslutninger først og mindre team-afgørelser nedenunder, begge med anbefaling, trade-off og timing.
- Designgennemgange med to retninger, kriterier og anbefaling. De viser kun det grundlag, der faktisk er leveret.
- Vedvarende projekter, opgaver, leverancer, acceptkriterier og et fælles bibliotek med noter, briefs og links — gemt lokalt i `data/office-state.json`, som aldrig commit'es.
- Lokale referencebilleder (PNG, JPEG, WebP eller GIF op til 2 MB) kan vedhæftes til et projekt og vises i biblioteket. De gemmes under `data/uploads/`, bliver ikke commit'et og er ikke læst af manageren eller sendt til en model.
- En opgave kan klargøres til en worker, men det starter ikke en model og giver ikke rettigheder.
- Skrivebordenes status udledes af de rigtige opgaver (i gang, klar, planlagt). En rolle uden opgaver står som ledig, ikke som travl.
- Specialister fra talentbanken vises i kontoret, når de er sat på det aktive projekt — tydeligt markeret som ikke forbundet.
- "Bed om ny runde" fravælger oplæggets planlagte opgaver, så de ikke bliver liggende som spøgelsesarbejde.
- Fokus-tilstand skjuler team-afgørelser fra indbakken, så kun direktionsvalg står tilbage. Aftenlys dæmper kontorkortet. Begge huskes i browseren.
- Live-synkronisering på tværs af åbne lokale faner, møde-markeringer, fokus-tilstand, medarbejderpaneler og responsiv mobilnavigation.

## Tjek før aflevering

```bash
node --check app.js
node --check server.mjs
node --test
```

## Næste produktlag

1. Tilføj bibliotek med rigtige uploadede filer, previews og projektmateriale.
2. Lad godkendte worker-forbindelser aflevere artefakter og checks på opgaver.
3. Kobl Claude Code og Gemini CLI på som særskilte, eksplicit godkendte medarbejdere.
4. Kobl GitHub, tests, previews og senere Render/Xcode på gennem eksplicitte tilladelser.

## Samarbejde gennem GitHub

GitHub er nu gjort klar som fælles værksted for Mads og andre kodeagenter:

- `AGENTS.md` forklarer produktets retning, sikkerhedsgrænser og Git-regler.
- `docs/` indeholder den fælles produktretning og arbejdsaftale.
- GitHub Issues har skabeloner til afgrænsede agentopgaver og fejl.
- Pull requests har en fast afleveringsskabelon.
- GitHub Actions kører syntakstjek på hver pull request og push til `main`.

Produktretning, arbejdsaftale, [talentbank](docs/TALENT-BANK.md), [worker-forbindelser](docs/WORKER-CONNECTIONS.md) og beslutningslog ligger i `docs/`. Mads har godkendt direkte arbejde på `main`; andre AI-medarbejdere skal stadig få en konkret opgave, læse dokumentationen og køre de relevante tests.
