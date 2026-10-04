# Arbejdsaftale

## Hvad en opgave skal indeholde

- **Mål:** Hvad skal være bedre eller færdigt?
- **Kontekst:** Hvilket projekt, hvilke filer, billeder eller tidligere beslutninger gælder?
- **Accept:** Hvad kan bekræfte, at opgaven lykkedes?
- **Frihed:** Hvad må medarbejderen selv vælge, og hvad skal tilbage til Mads?

## Eskalering til Mads

Spørg Mads, når en beslutning er:

- et spørgsmål om smag eller produktretning med stor effekt
- dyr, irreversibel eller offentlig
- afhængig af manglende adgang eller materiale
- i konflikt med et andet, vigtigt forslag

Vælg selv og dokumentér det, når det er et reversibelt rutinevalg. Manageren samler beslutninger, så Mads ikke får en strøm af små afbrydelser.

## Aflevering

En medarbejder afleverer en artefakt, ikke bare en påstand. Eksempler: en research-note med kilder, et UI-preview, en GitHub-branch, testresultater eller et review med konkrete fund.

Hver aflevering skal kort forklare:

1. hvad der ændrede sig
2. hvorfor det blev valgt
3. hvordan det er tjekket
4. hvad der eventuelt venter på Mads

## GitHub som fælles værksted

GitHub er sandhedskilden for kode, issues, pull requests, checks, projektbeslutninger og dokumentation. En lokal Mac-worker må gøre ting, som kræver Mads' Mac — eksempelvis Xcode-builds — men skal aflevere resultatet tilbage til GitHub.

## Arbejdsrytme og koordinering

- Hold aktivt arbejde lille: ét hovedspor pr. projekt og højst to uafhængige støtte-spor.
- En parallel opgave skal have en konkret aflevering og en skrevet afhængighed. Hvis designet ændrer kodearbejdet, skal udvikleren afvente den beslutning eller kun bygge et uafhængigt skelet.
- Manageren samler kun til møde, når der er et reelt konfliktpunkt, en afhængighed eller en beslutning til Mads. Et møde er ikke status-animation.
- En aflevering flytter ikke automatisk næste led i gang. Den bliver klar til review eller Mads' beslutning, medmindre den konkrete workflow-kontrakt allerede er godkendt.
- Manageren må bemande et projekt fra talentbanken efter behov. Den må ikke selv installere en ny CLI, forbinde en konto, ændre en abonnementsplan eller udvide en medarbejders værktøjsrettigheder.

## Direktion og team-afgørelser

Alle beslutninger skal mærkes som enten `direktion`, `team` eller `hardt_stop`, med anbefaling, trade-off og timing. Teamet kan dokumentere et reversibelt teamvalg; kun Mads kan afgøre direktions- og hårde stop.

## Direkte arbejde på main

Mads har godkendt direkte arbejde på `main` for dette projekt. Kør stadig syntaks- og relevante tests før push, beskriv ændringen tydeligt i committen, og skub aldrig automatisk til deploy, merge af andres ændringer, køb eller publicering.
