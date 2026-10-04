# Mads' AI-kontor

En første, interaktiv prototype af det grafiske AI-kontor: flere roller, manager-chat, projekter, beslutningsindbakke og et mobiltilpasset kontor.

Denne version er bevidst en lokal UI-prototype. Den bruger demonstrationsdata og foretager ingen modelkald, GitHub-ændringer, deploys eller køb.

## Åbn prototypen

Kør nedenstående i projektmappen, og åbn derefter `http://127.0.0.1:4173`.

```bash
node server.mjs
```

Serveren giver UI'et en lokal, skrivebeskyttet Codex-manager. Den kræver, at Codex allerede er logget ind på Mac'en. Den bruger den eksisterende ChatGPT/Codex-login, har kun ét aktivt job ad gangen, har en tidsgrænse på to minutter og kan ikke skrive filer, deploye eller bruge API-nøgler.

## Det er bygget nu

- Et levende, Game Dev Tycoon-inspireret kontor på desktop og mobil.
- Fem medarbejderroller med rigtige opgavekort og materialer.
- Managerens fritekstfelt til nye idéer og feedback, koblet til en lokal Codex-manager når serveren kører.
- En kort indbakke med beslutninger, der venter på Mads.
- Projekter og status på tværs af holdet.
- Møder, fokus-tilstand, medarbejderpaneler og responsiv mobilnavigation.

## Næste produktlag

1. Gem projekter, beslutninger og Mads-præferencer rigtigt.
2. Lad manageren oprette konkrete opgaver og indsamle artefakter.
3. Kobl Claude Code og Gemini CLI på som særskilte, eksplicit godkendte medarbejdere.
4. Kobl GitHub-branches, tests, previews og senere Render/Xcode på gennem eksplicitte tilladelser.
