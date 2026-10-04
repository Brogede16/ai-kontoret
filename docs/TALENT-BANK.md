# Talentbanken

Talentbanken er AI-kontorets katalog af allerede godkendte **roller**. Manageren kan bemande et projekt med dem, når rollen giver en bedre, konkret aflevering. Det er ikke et katalog over aktive abonnementer, modeller eller automatiske rettigheder.

## Sådan fungerer en ansættelse

En ansættelse betyder, at manageren:

1. sætter rollen på et bestemt projekt
2. giver den en afgrænset opgave og et forventet artefakt
3. angiver, hvem der skal bruge afleveringen bagefter

En ansættelse betyder **ikke**, at systemet installerer en CLI, logger ind på en konto, køber kvote eller giver fil-, GitHub-, Render-, Xcode- eller deployadgang. Indtil en særskilt worker-forbindelse er godkendt, kan rollerne planlægge og være klar — ikke foregive at udføre eksternt arbejde.

## Kerneteamet

| Rolle | Leverer typisk | Sender videre til |
| --- | --- | --- |
| Manageren | Arbejdsspor, beslutninger, bemanding | Hele holdet og Mads |
| Designeren | Kodbar UI-retning, komponent- og acceptnoter | Udvikleren |
| Researcheren | Kilder, fakta og research-note | Designer, tekstforfatter eller manager |
| Udvikleren | Kode, test og preview | Revieweren |
| Revieweren | Konkrete fund og acceptcheck | Manageren og udvikleren |

## Specialister manageren kan hente ind

### Spildesigneren

- **Kompetencer:** core loop, progression, systemer og en spilbar vertikal slice.
- **Artefakt:** et systembrief med testbare regler og tydelige åbne valg.
- **Samarbejder med:** designer og udvikler.
- **Bruges når:** gameplay eller struktur er en central del af produktet — ikke bare fordi projektet kaldes et spil.

### Grafikeren

- **Kompetencer:** art direction, UI-illustration, asset-briefs og visuelle referencer.
- **Artefakt:** et afgrænset visuelt brief med referencer og kriterier for et reelt preview eller asset.
- **Samarbejder med:** designeren og en senere godkendt billed-worker.
- **Grænse:** rollen må ikke foregive, at et billede eller asset er lavet, før det er leveret som et faktisk artefakt.

### Tekstforfatteren

- **Kompetencer:** UX-mikrocopy, produktfortælling, tone-of-voice og tekstvarianter.
- **Artefakt:** tekstforslag med målgruppe, skærmkontekst og anbefaling.
- **Samarbejder med:** designer, marketer og udvikler.
- **Bruges når:** ord og tone ændrer brugeroplevelsen eller produktets retning.

### Marketingpersonen

- **Kompetencer:** målgruppe, positionering, værditilbud og launch-hypoteser.
- **Artefakt:** et positioneringsnotat med antagelser, hvad der bør testes, og hvad der stadig er uafklaret.
- **Samarbejder med:** manager, researcher og tekstforfatter.
- **Hårde grænser:** ingen annoncer, køb, kampagner eller publicering.

### Trendspejderen

- **Kompetencer:** nye modeller og værktøjer, prompt-mønstre, vibecoding-workflows og kildekritik.
- **Artefakt:** et radar-punkt med kilde, hvorfor det er relevant for kontoret, og et konkret forsøg — eller en forsøgsrapport: før/efter og en anbefaling (brug, tilpas, forkast).
- **Samarbejder med:** manager, udvikler og reviewer.
- **Bruges når:** et nyt værktøj eller mønster kan gøre holdets arbejde bedre eller billigere, og det kan prøves af på et rigtigt projekt.
- **Grænse:** henter ikke selv fra nettet, før en worker med netadgang er godkendt. Hype uden forsøg er ikke en aflevering.

## Kompetencepakker er ikke træning

En kompetencepakke beskriver briefskabelon, tjekliste, artefaktformat og samarbejdsgrænser. Den gør teamets arbejde mere konsistent, men den gør ikke en underliggende model permanent bedre eller erstatter dokumentation i projektet.

Når teamet senere faktisk har leveret arbejde, kan manageren foreslå en forbedring af en kompetencepakke. Den skal fremgå som en konkret, redigerbar ændring med begrundelse — aldrig som usynlig “selvtræning”.
