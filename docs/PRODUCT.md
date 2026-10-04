# Produktretning: Mads' AI-kontor

## Løftet

Mads skal kunne give en idé, et billede eller en kort feedback til manageren og se et lille AI-hold undersøge, designe, bygge, reviewe og præsentere arbejdet. Han kan tjekke ind fra computer eller mobil i løbet af dagen og træffe de beslutninger, hvor hans smag eller autoritet faktisk er nødvendig.

Det skal føles som et kreativt studio med medarbejdere — ikke som et fleragent-script med logs.

## Kerneoplevelse

1. Mads skriver eller indtaler en idé til manageren og kan vedhæfte referencebilleder/filer.
2. Manageren samler en afgrænset opgavepakke og tildeler relevante roller.
3. Medarbejdere leverer konkrete artefakter: research-noter, UI-forslag, preview, kodebranch, tests eller review.
4. Manageren filtrerer og samler modstridende forslag, før Mads bliver forstyrret.
5. Mads giver feedback direkte i kontoret; holdet itererer og gemmer en forklarlig beslutning.

## Chef-laget: beslutninger uden støj

Mads er den øverste beslutningstager, ikke en passiv modtager af agent-output. Manageren skal derfor præsentere et lille antal beslutninger med anbefaling, konsekvens og passende hastighed.

- **Direktionsbeslutning:** Retning, produkt-smag, væsentligt omfang, tværgående prioritet, penge, offentlighed eller noget svært at rulle tilbage. Den står øverst og forklarer: *hvad er valget, hvad anbefaler manageren, hvad taber/vinder vi, og hvorfor nu?*
- **Team-afgørelse:** Et afgrænset, reversibelt valg. Det er synligt i indbakken, men kan markeres som “kan vente”; manageren bør som udgangspunkt vælge selv og skrive det i historikken, hvis det ikke kræver Mads.
- **Hårdt stop:** Adgang, sikkerhed, økonomi, køb, merge, deploy og publicering kræver altid særskilt godkendelse.

En beslutning skal ikke kun være en knap. Den skal have en anbefaling, et trade-off, niveau og timing. Manageren må udfordre Mads' præferencer med et konkret argument, men må aldrig skjule det som en rutinebeslutning.

## Samtalehistorik er projektets hukommelse

Hvert projekt har en menneskelæselig historik af Mads' beskeder, managerens oplæg, beslutninger og reelle afleveringer. Den er ikke en rå model-log og indeholder aldrig skjult ræsonnement. Manageren får kun den korte, relevante projekthistorik som kontekst, så næste samtale kan fortsætte uden at gentage hele briefen.

## Et lean, realistisk teamflow

Kontoret skal optimere for gennemløbstid og tydelige afleveringer, ikke for at få mange medarbejdere til at se travle ud.

1. Manageren afgrænser mål, accept og beslutningsgrænser.
2. Research og design kan køre parallelt, når begge arbejder ud fra den samme stabile brief og afleverer uafhængige artefakter.
3. Udvikling starter først, når det berørte design- eller produktvalg er tilstrækkeligt låst. Den kan godt bygge teknisk skelet parallelt med research, men ikke lade som om visuel retning er afklaret.
4. Review starter ved en konkret aflevering: kode, preview, research-note eller designgennemgang — ikke bare fordi en rolle har “ventet længe”.
5. Manageren begrænser aktive spor. Ét hovedspor pr. projekt er standard; højst to støtte-spor må køre samtidigt, når deres input-output-kontrakt er skrevet ned.

Bilateralt arbejde er derfor eksplicit: designer → udvikler deler komponent- og acceptnoter; researcher → designer deler kildebelagt indhold; udvikler → reviewer deler branch, test og preview. Manageren samler først, når afhængighederne er klar.

## Sådan præsenteres design

Et designvalg skal vises som en **designgennemgang**, ikke som en uunderbygget tekstpåstand. Den består af mindst to retninger eller et tydeligt før/efter, den konkrete reference eller preview, vurderingskriterier, anbefaling og spørgsmålet til Mads. Den færdige version skal kunne pege på en kodet preview, et skærmbillede eller et eksplicit link; indtil da må kontoret kun vise briefen, ikke foregive at designet findes.

## Roller er ikke modeller

Manager, designer, researcher, udvikler, reviewer, spildesigner, grafiker, tekstforfatter og marketingperson er roller. De kan drives af samme model eller af forskellige udbydere, men kun når det giver bedre output. Underliggende modeller må aldrig bestemme produktets organisation.

Manageren må frit sammensætte et projektteam fra talentbanken og tilføje relevante roller, når opgaven fortjener det. En “ansættelse” betyder en projektrolle med en klar aflevering og en begrænset kompetencepakke — ikke automatisk installation af software, aktivering af en betalt model eller nye skrive-/deployrettigheder.

Kontoret viser separat, hvilke lokale worker-forbindelser der faktisk er konfigureret. Det gør det tydeligt, når en rolle er klar i organisationen, men endnu ikke kan udføre arbejde gennem Claude Code, Gemini CLI eller en anden underliggende worker.

## Mads-profilen

Tidligere valg er bløde præferencer med kontekst — ikke forbud. En medarbejder skal kunne sige: "Du fravalgte dette i projekt X, men her anbefaler jeg det af denne grund." Kun eksplicitte sikkerheds- og økonomiregler er hårde stopregler.

## Ikke i denne fase

- Automatisk deploy, merge, køb eller publicering.
- Påstået adgang til konti, filer eller værktøjer, som ikke er koblet rigtigt på.
- Falske "tankebobler" eller kunstigt travle medarbejdere.
- En tung, fotorealistisk 3D-simulation.
