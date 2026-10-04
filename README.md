# Mads' AI-kontor

En første, interaktiv prototype af det grafiske AI-kontor: flere roller, manager-chat, projekter, beslutningsindbakke og et mobiltilpasset kontor.

Denne version er bevidst et lokalt, sikkert første kontrolrum. Den gemmer projekter, opgaver, beslutninger og aktivitet på Mac'en. Den kan bede en læse- og rådgivningsbegrænset Codex-manager om et struktureret arbejdsspor, men foretager ikke GitHub-ændringer, deploys, køb eller filændringer på vegne af modeller.

## Åbn prototypen

Kør nedenstående i projektmappen, og åbn derefter `http://127.0.0.1:4173`.

```bash
node server.mjs
```

Serveren giver UI'et en lokal, skrivebeskyttet Codex-manager. Den kræver, at Codex allerede er logget ind på Mac'en. Den bruger den eksisterende ChatGPT/Codex-login, har kun ét aktivt job ad gangen, har en tidsgrænse på to minutter og kan ikke skrive filer, deploye eller bruge API-nøgler.

## Det er bygget nu

- Et levende, Game Dev Tycoon-inspireret kontor på desktop og mobil.
- Fem medarbejderroller med opgavekort, materialer og ærlig status.
- Managerens fritekstfelt til idéer og feedback, koblet til en lokal, læsebegrænset Codex-manager når serveren kører.
- En kort indbakke med managerens arbejdsspor og de beslutninger, der venter på Mads.
- Vedvarende projekter, opgaver, leverancer, acceptkriterier og et fælles bibliotek med noter, briefs og links — gemt lokalt i `data/office-state.json`, som aldrig commit'es.
- En opgave kan klargøres til en worker, men det starter ikke en model og giver ikke rettigheder.
- Live-synkronisering på tværs af åbne lokale faner, møde-markeringer, fokus-tilstand, medarbejderpaneler og responsiv mobilnavigation.

## Tjek før aflevering

```bash
node --check app.js
node --check server.mjs
node --test
```

## Næste produktlag

1. Tilføj bibliotek med rigtige uploadede filer og projektmateriale.
2. Lad godkendte worker-forbindelser aflevere artefakter og checks på opgaver.
3. Kobl Claude Code og Gemini CLI på som særskilte, eksplicit godkendte medarbejdere.
4. Kobl GitHub-branches, tests, previews og senere Render/Xcode på gennem eksplicitte tilladelser.

## Samarbejde gennem GitHub

GitHub er nu gjort klar som fælles værksted for Mads og andre kodeagenter:

- `AGENTS.md` forklarer produktets retning, sikkerhedsgrænser og Git-regler.
- `docs/` indeholder den fælles produktretning og arbejdsaftale.
- GitHub Issues har skabeloner til afgrænsede agentopgaver og fejl.
- Pull requests har en fast afleveringsskabelon.
- GitHub Actions kører syntakstjek på hver pull request og push til `main`.

En anden AI bør få en konkret GitHub Issue, arbejde i sin egen branch og aflevere en pull request. Den skal ikke skrive direkte til `main`.
