# Modernariato • Ricerca Designer (PWA)

App web statica (pronta per Vercel) per:
- Cercare **designer italiani** con immagini, periodi, movimenti, occupazioni (dati live da **Wikidata**).
- Vedere **biografia** (da **Wikipedia**) e **opere note** con immagini (da **Wikidata/Wikimedia**).
- Fare **ricerca da foto** (aHash + distanza di Hamming, lato client).
- Salvare **Preferiti** (localStorage).
- **PWA**: installabile su Android/iOS/desktop, offline per le risorse base.

## Come pubblicarla (GitHub + Vercel)

1. **Crea un repo GitHub** (oppure usa quello in cui avevi caricato la demo).
2. Carica **tutti i file** di questa cartella nella root del repo:
   - `index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js`, `vercel.json`, `icon-192.png`, `icon-512.png`.
3. Su **Vercel** → **New Project** → scegli il repo → Framework: **Other** → lascia vuoti Build/Output → **Deploy**.
4. Apri l'URL (es. `https://modernariato-db.vercel.app`) → Menu (⋮) → **Aggiungi a schermata Home** (Android) / **Condividi → Aggiungi a Home** (iOS).

> Se aggiorni i file, Vercel ridistribuisce in automatico al push su GitHub.

## Ricerca da foto (demo) e modalità “Pro”

- La demo usa **aHash** (8x8) + **Hamming** per confrontare la tua foto con **le immagini dei designer** (fino a 300). È **veloce** e tutto **client-side**, ma non “magica”.
- Per un riconoscimento serio (oggetti, lampade, sedie), collega un modello **CLIP/ViT/Google Vision**:
  - **Vercel Edge Function / API Route** che chiama OpenAI/Google/Replicate → ritorna i top match (ti preparo io la route se vuoi).
  - Oppure **solo client** con Replicate (serve chiave/API proxy).

## Dati live (niente DB da gestire)

- Lista designer: query SPARQL a `query.wikidata.org` filtrando cittadinanza **Italia (Q38)** e occupazioni **industrial/product/furniture designer**.
- Biografia: riassunto REST di Wikipedia (it > en fallback).
- Opere: `P170` (creator) con `P18` (immagine) e `P571` (anno).

## Preferiti

- Clicca ⭐ nelle schede. I preferiti sono salvati su **localStorage** del browser.
- “Preferiti” nel menu per vedere/gestire la lista. “Svuota” per cancellare tutto.

## Personalizzazioni utili

- Filtri aggiuntivi (marchi, materiali, modelli) → aggiungi controlli UI e una nuova query SPARQL.
- Dati curati: crea `data.json` con schede editoriali (il codice è già pronto a mostrare tag/immagini extra).
- SEO: aggiungi `sitemap.xml` e pagine statiche per i designer più cercati.

## Limitazioni note

- “Tutti ma proprio tutti” i designer/oggetti richiedono **curatela** e **crawling** extra. Questa app prende **molto** da Wikidata, ma non tutto è completo.
- Alcune immagini non permettono `crossOrigin=anonymous` → hash non calcolabile: vengono saltate automaticamente.

Buon lavoro! ✨
