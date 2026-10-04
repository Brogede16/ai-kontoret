# AI-kontoret: instrukser til medarbejdere og kodeagenter

Dette repository er den fælles, versionsstyrede sandhed for Mads' AI-kontor.

## Læs før du arbejder

1. `README.md` — hvordan prototypen køres.
2. `docs/PRODUCT.md` — produktets retning og oplevelse.
3. `docs/WORKING-AGREEMENT.md` — opgave-, sikkerheds- og afleveringsregler.
4. Den GitHub Issue eller pull request, du er blevet tildelt.

## Arbejdsprincipper

- Byg et kreativt, levende AI-kontor; ikke et anonymt admin-dashboard.
- Brugerfladen er på dansk, varm og Game Dev Tycoon-inspireret.
- Kontoret må kun vise virkelig arbejdsstatus, konkrete artefakter og beslutninger — aldrig opdigtede skjulte tanker.
- Manageren må kende Mads' præferencer, men skal kunne foreslå bedre undtagelser og forklare hvorfor.
- Mobilet er det samme kontor i responsivt format, ikke en reduceret chef-liste.

## Sikkerhedsgrænser

- Bevar `server.mjs` som lokal-only (`127.0.0.1`) indtil en bevidst sikkerhedsdesignbeslutning er taget.
- Den nuværende Codex-manager er læse- og rådgivningstilstand. Giv ikke fil-, GitHub-, Render-, Xcode- eller deployrettigheder uden en særskilt, godkendt opgave.
- Brug aldrig API-nøgler i repository, browserkode eller logs.
- Ingen automatisk køb, merge, produktionsdeploy eller publicering.
- Tilføj ikke tunge dependencies eller en ny cloud-tjeneste uden at forklare hvorfor i issue eller PR.

## Git-arbejde

- Mads har godkendt direkte arbejde på `main`. Flere agenter (Claude Code og ChatGPT/Codex) skriver i samme repository, så hent altid seneste `main` før du starter, og igen før du pusher.
- Hold hver commit lille og afgrænset, med en besked der forklarer hvad og hvorfor.
- Kør `node --check app.js`, `node --check server.mjs` og `node --test` før push. Push aldrig rødt.
- Brug en branch og pull request, når ændringen er stor, risikabel eller skal reviewes, før den lander.
- Overskriv aldrig en anden agents arbejde: ingen force-push på `main`. Løs konflikter med en merge.

## Når du er i tvivl

Skriv en kort anbefaling med alternativer og vent på Mads eller managerens beslutning. Gæt ikke på adgang, økonomi eller produktretning.
