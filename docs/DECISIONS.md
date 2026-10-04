# Produktbeslutninger: Mads' AI-kontor

Denne fil er den korte, menneskelæselige beslutningslog for produktets retning. Den supplerer GitHub Issues, commits og pull requests, så en ny kodeagent kan forstå *hvorfor* kontoret er bygget sådan.

## 001 · Hybrid kontrolrum og lokal worker

**Beslutning:** Kontoret skal på sigt være et hybridprodukt: et online/mobilt kontrolrum og en Mac hjemme, der kan udføre bevidst godkendt lokalt arbejde.

**Hvorfor:** Mads skal kunne starte, følge og godkende arbejde i løbet af arbejdsdagen, uden at give en cloud-tjeneste ubegrænset adgang til Mac, Xcode eller filer.

**Nu:** Prototypen er stadig kun lokal på `127.0.0.1`. Fjernadgang og worker-adgang er senere, separate sikkerhedsbeslutninger.

## 002 · Medarbejdere er roller, ikke leverandører

**Beslutning:** Manager, designer, researcher, udvikler, reviewer og senere grafiker er organisatoriske roller. ChatGPT/Codex, Claude Code og Gemini CLI kan drive dem, når det giver en fordel, men må ikke definere organisationen.

**Hvorfor:** Én model kan have flere roller, og den bedste model til en rolle kan ændre sig over tid.

## 003 · Manageren er Mads' nærmeste led

**Beslutning:** Mads skal tale tæt med manageren, mens manageren organiserer holdet, filtrerer støj og foreslår bemanding eller kompetencehuller.

**Hvorfor:** Målet er at føles som et kreativt team, ikke som Mads der manuelt kører hver underagent.

**Grænse:** Manageren må kende bløde præferencer og udfordre dem med begrundelse. Den må ikke gøre Mads' gamle fravalg til et automatisk forbud.

## 004 · Beslutninger i to niveauer

**Beslutning:** Indbakken opdeles i direktionsbeslutninger og team-afgørelser. Hårde stop er altid særskilt godkendelse.

**Hvorfor:** Mads skal se de vigtige valg hurtigt, men ikke miste overblikket over mindre beslutninger eller blive afbrudt af dem hele dagen.

## 005 · Lean arbejdsflow frem for agent-teater

**Beslutning:** Én hovedopgave pr. projekt og højst to uafhængige støtte-spor ad gangen. Research/design kan være parallelle; udvikling og review afhænger af konkrete artefakter og stabile grænseflader.

**Hvorfor:** Flere roller skaber kun værdi, når de kan aflevere ting til hinanden uden at skabe ny koordinationsgæld.

## 006 · Design vises som et review, ikke som tekst

**Beslutning:** Design skal præsenteres med retninger, kriterier, anbefaling og reelle previews/referencer. Direkte kodede previews er foretrukket; Figma er valgfrit.

**Hvorfor:** Mads arbejder bedst gennem konkrete sammenligninger og vil bygge flotte resultater i kode.

## 007 · GitHub er fælles hukommelse

**Beslutning:** Kode, checks, issues, dokumentation og produktvalg dokumenteres i GitHub. Lokal runtime-tilstand og potentielt private samtaler bliver lokalt, indtil en eksplicit delingsmodel er valgt.

**Hvorfor:** Andre AI-medarbejdere skal kunne overtage et afgrænset stykke arbejde uden at gætte produktretningen.

## 008 · Sikker og økonomisk autonomi

**Beslutning:** Ingen automatisk køb af kvote, API-forbrug uden synligt loft, merge, deploy, publicering, GitHub-skrivning, Render-ændring eller Xcode-build uden en konkret godkendelse.

**Hvorfor:** Kontoret skal spare Mads tid, ikke skabe en uoverskuelig sikkerheds- eller regningsrisiko.

## 009 · Et levende kontor på desktop og mobil

**Beslutning:** Brugeroplevelsen er et varmt, Game Dev Tycoon-inspireret kontor med en mobiltilpasset udgave af det samme kontor — ikke et reduceret chef-dashboard.

**Hvorfor:** Det visuelle lag skal give Mads intuitivt overblik over roller, beslutninger og reelle afleveringer. 3D og animation er en senere forbedring, ikke en forudsætning for produktværdi.

## 010 · Modeller og værktøjer vælges dynamisk

**Beslutning:** Kontoret skal løbende kunne vurdere, hvilke modeller og værktøjer der passer til hvilke roller, inklusive research, code review, direkte kodede UI-previews og senere grafik. Plugins eller connectorer bruges kun, når de forbedrer en konkret aflevering.

**Hvorfor:** Mads vil både kunne vibe-kode hurtigt og få modspil fra flere faglige vinkler. Det må ikke gøre teamet dyrere eller mere kompliceret uden dokumenteret gevinst.

## 011 · Møder er et værktøj, ikke en ritual

**Beslutning:** Manageren indkalder kun til møde ved reel afhængighed, konflikt eller beslutning. Et møde skal have et formål og en efterfølgende aflevering.

**Hvorfor:** Parallelitet og feedback er værdifulde; ritualiserede agent-samtaler uden nyt artefakt er ikke.

## 012 · Manageren bemander projekter frit inden for talentbanken

**Beslutning:** Manageren kan selv foreslå, tilføje og afvikle roller på et projekt, når det forbedrer den konkrete aflevering. Spildesigner, grafiker, tekstforfatter og marketingperson er projektroller, der kan hentes ind efter behov — de skal ikke være aktive på alle projekter.

**Hvorfor:** Det bevarer følelsen af et rigtigt, fleksibelt team, uden at Mads selv skal micromanage hver tildeling.

**Grænse:** Manageren må kun bemande blandt allerede godkendte kompetencepakker. Ny software, login, modeludbyder, betalt plan eller skriveadgang er stadig en beslutning til Mads.

## 013 · Roller og forbindelser vises hver for sig

**Beslutning:** Talentbanken viser de roller manageren kan bemande, mens en særskilt forbindelsesoversigt viser de lokale CLI- eller app-forbindelser, som faktisk er konfigureret og deres konkrete scope.

**Hvorfor:** En medarbejderrolle må ikke ligne en aktiv model, før login, rettigheder, kvote og output-kontrakt er afklaret. Det forebygger både falsk status og for brede tilladelser.

## Åbne beslutninger

- Hvilken worker skal først få eksplicit, begrænset adgang: GitHub, en lokal projektmappe eller research?
- Hvordan skal fil-upload og design-previews opbevares og deles sikkert?
- Hvornår giver fjernadgang værdi nok til at fortjene et særskilt sikkerhedsdesign?
- Hvilke roller skal have egne model-profiler, og hvilke kan starte på samme underliggende model?
