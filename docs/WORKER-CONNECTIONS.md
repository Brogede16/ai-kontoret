# Worker-forbindelser

Dette dokument beskriver grænsen mellem AI-kontorets roller og de lokale programmer, som på sigt kan udføre en opgave. Det er en designkontrakt — ikke en installationsguide eller en tilladelse til at forbinde noget automatisk.

## Nuværende tilstand

| Forbindelse | Status | Hvad den faktisk må nu |
| --- | --- | --- |
| Codex | Konfigureret lokalt | Manageren kan lave et struktureret, læsebegrænset oplæg gennem den eksisterende lokale Codex-login. |
| Claude Code | Ikke forbundet | Ingenting. Ingen login, kommando eller rettighed er sat op i kontoret. |
| Gemini CLI | Ikke forbundet | Ingenting. Den konkrete Google-login og CLI-adgang er ikke valideret i kontoret. |

Codex-manageren bruger den lokale `codex exec`-vej i read-only-sandbox. En eventuel senere app-server-integration kan bruge den officielle [Codex app-server-dokumentation](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), men skal være en separat ændring med eksplicit scope.

Claude Code og Gemini CLI har begge dokumenterede non-interaktive/strukturerede tilstande, som kan bruges senere: [Claude Code CLI](https://code.claude.com/docs/en/cli-usage) og [Gemini CLI headless mode](https://geminicli.com/docs/cli/headless/). Det beviser kun, at en integration er teknisk mulig — ikke at Mads' nuværende planer giver en bestemt kvote eller rettighed. Særligt Google AI Plus skal afprøves på den konkrete konto, før den indgår i en worker-plan.

## En worker må først blive forbundet, når disse ting er skrevet ned

1. **Rolle og aflevering:** Hvilken rolle skal den drive, og hvilket artefakt skal den aflevere?
2. **Lokal login:** Hvilken allerede betalt konto bruges? Ingen nøgle eller token gemmes i repository eller browseren.
3. **Værktøjsscope:** Må den kun læse, eller må den skrive i en bestemt projektmappe? GitHub, Xcode, Render og browserautomatisering er hver sin tilladelse.
4. **Kommando-kontrakt:** Inputformat, struktureret output, timeout, afbrydelse og håndtering af tilladelsesspørgsmål.
5. **Økonomi og kvote:** Hvilket abonnement eller API-loft gælder? Hvad sker der, når grænsen nås? Der må aldrig købes ekstra automatisk.
6. **Aflevering:** Hvor bliver kode, preview, research eller review gemt, og hvad er det næste menneskelige eller automatiske check?

## Trinvist scope

| Niveau | Tilladelse | Eksempel |
| --- | --- | --- |
| 0 | Rådgiver | Manageren strukturerer en opgave; ingen ekstern worker startes. |
| 1 | Afgrænset læsning | En worker læser et lokalt brief eller et bestemt GitHub-udsnit og afleverer en note. |
| 2 | Afgrænset skrivearbejde | En worker skriver kun i en bestemt lokal arbejdsmappe eller branch og afleverer diff, tests og preview. |
| 3 | Kontrolleret integration | GitHub PR, Xcode-build eller Render-preview gennem eksplicitte kommandoer og godkendelse. |

Ingen worker springer niveauer over. Deploy, merge, publicering og køb er fortsat hårde stop, også på niveau 3.

## Lokale referencebilleder

Kontoret kan gemme PNG, JPEG, WebP eller GIF op til 2 MB som lokale projektartefakter. De ligger uden for Git i `data/uploads/` og vises kun i biblioteket. Managerens kontekst får kun at vide, at et billede er registreret; billedebytes eller synsfortolkning sendes ikke til den.

At lade en worker se ét billede er en niveau-1-tilladelse: den skal være knyttet til en bestemt opgave, en bestemt forbindelse og en tydelig aflevering. Det bliver ikke slået til af en upload alene.

## Hvorfor forbindelser vises i produktet

Kontorets “Forbindelser”-oversigt må kun vise faktisk konfigurerede lokale forbindelser, deres scope og deres begrænsninger. Den må aldrig gøre et grønt ikon til en påstand om, at en model kan læse filer, bruge en konto eller arbejde i baggrunden, før den capability er testet og godkendt.
