# Architecture & Blueprint

This project is being shaped into a **reusable, config- and data-driven engine
for literary-geography maps** — take one or more texts, curate their places /
routes / characters, and present them on an interactive OpenStreetMap-based map
with layers, popups, trajectories and a text-processing (NER/verification)
pipeline. *mappingJoyce* is the reference example.

The litmus test for the blueprint: **you can stand up a new project (a
different author/city) by editing `config.json` and adding data — without
touching engine code.**

## Module boundaries

| Layer | What it is | Project-specific? |
|-------|------------|-------------------|
| **engine/** | Leaflet rendering, accordion sidebar, layer/work toggle, popups, trajectories | No — generic |
| **config.json** | declares works, groups, colours, i18n strings, default view + region, basemap, attribution, popup fields, layer dimensions | **Yes** |
| **data/** | GeoJSON (rendered) + `*-source.json` (hand-editable) per work | **Yes** |
| **pipeline/** | geocode + routing (OSRM/BRouter), KML export, uMap round-trip | No — generic, parametrised |
| **text/** | episode/section splitter (markers/regex/incipits), NER annotate + candidates | splitter config is project-specific; NER is generic |

Today everything works, but the engine (`engine.js`) still hardcodes the
Joyce-specific parts (the `WORKS`/`*_GROUPS` tables, taglines, the Dublin
bounding box, the "Episode N ·" prefix, the basemap + attribution). Phase B
moves those into `config.json`.

## Generic components (what the engine/template must provide)

**A — Content model**
- A **public-domain text base with place-NER**, whose entities are curated
  (semi-automatic).
- **Hierarchical text units**: work → section/chapter (variable depth; for
  Joyce: works with their own view, chapters/episodes within).
- **Places with a category/tier** (key / waypoint / mention) and **routes**,
  both **attributed to characters** (the basis for movement profiles).
- *(optional)* **time stamps** (temporal structure); an **uncertainty / fictional
  flag** for approximate or invented places.

**B — Pipeline**
- **NER/annotation** (language-specific model) + **verification against the
  text** (does the place/quote really occur there?).
- **Geocoding** (gazetteer + focus bounding box) and **routing** in several
  modes (driving / foot / rail / manual).
- **Round-trip editing**: export → uMap → re-import (fix geometry losslessly).

**C — Presentation**
- **Basemap** (modern *or historical*) + attribution.
- **Layers & toggles**: by section/chapter **and** by character **and**
  optionally by tier.
- **Trajectories** (character movement profiles from ordered places/routes).
- **Info popups**: place, citation/chapter, person(s), quote and/or note —
  scrollable.
- **Base zoom / focus area** + handling of **far-off ("elsewhere")** mentions.
- *(optional)* multilingual UI, place search/index, time filter/timeline.

**D — Cross-cutting**
- **Per-layer rights model** (code MIT · text PD only · geodata licensed
  per work) · geodata **provenance** · **zero-build / static**.

### Project-specific axes (not in every project)

| Axis | Variant A | Variant B |
|------|-----------|-----------|
| Works per project | one | several (Joyce: 3) |
| Time structure | single day, clock-precise (Ulysses) | years / diffuse (few times) |
| Route density | itinerary-heavy | static (few routes) |
| Basemap | modern tiles | historical (1904 / Victorian) |
| Language/script | EN | RU/other → own NER model + transliteration |
| Scale | one city | several cities / country |
| UI | monolingual | multilingual |

### Portability (other authors)

Two gates: (1) **text rights** — author d. + 70 yrs (EU) or published before
1929 (US); (2) **real, identifiable topography + character movement.** Gate 1
applies only to the **text/NER layer** — the *map* can be built from one's own
factual place data even for in-copyright works (facts aren't copyrightable);
only the full-text/NER corpus is gated.

- **Dickens / London** — top fit. Public domain (d. 1870), intensely
  topographic, clear itineraries; several novels = several "works". Caveat:
  Victorian city → historical basemap desirable; some composite/fictionalised
  places.
- **Dostoevsky / Petersburg** — very good, work-dependent. *Crime and
  Punishment* is near-ideal (real streets, abbreviated by Dostoevsky but
  scholarly-decoded; Raskolnikov's walks famously mapped). Caveats: Russian
  text → **ru-NER** + transliteration; use a PD translation (Garnett); some
  works use invented places (*Brothers Karamazov* → fictional town = poorly
  mappable).
- **Other strong candidates:** Woolf, *Mrs Dalloway* (London, single day like
  Ulysses, PD); Schnitzler/Vienna (PD); Zola/Paris (PD); Bely/Petersburg (PD).
  *Rights caveat:* Döblin, *Berlin Alexanderplatz* (very topographic, but EU
  public domain only in 2028).
- **Poor fit:** invented/diffuse settings, non-topographic works.

**Bottom line:** the template carries wherever a work has **real urban
geography + character movement** and a **public-domain text**. Dickens (London)
and Dostoevsky's *Crime and Punishment* (Petersburg) are both excellent second
examples — Dickens the smoothest (English, one city), Dostoevsky with the extra
step of Russian NER.

## `config.json` schema (target)

```jsonc
{
  "site":    { "title": "Mapping Joyce", "defaultWork": "dubliners",
               "languages": ["en"], "defaultLang": "en" },
  "basemap": { "url": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
               "maxZoom": 19, "attribution": "© OpenStreetMap contributors © CARTO" },
  "view":    { "center": [53.3478, -6.2597], "zoom": 13,
               "regionBBox": [53.0, -6.75, 53.7, -6.0] },   // [S,W,N,E] = opening extent
  "popup":   { "fields": ["episodePrefix", "time", "character", "gloss", "quote"] },
  "works": {
    "dubliners": {
      "label": { "en": "Dubliners", "de": "Dubliner" },
      "tagline": { "en": "The places of Joyce's Dubliners, mapped." },
      "data": "data/dubliners.geojson",
      "experimental": false,
      "credit": "Geodata derived from the Mapping Dubliners Project … (CC BY-NC 4.0)",
      "groupKey": "story",            // feature property used to group/colour
      "groupPrefix": null,            // e.g. {"en":"Episode"} renders "Episode 3 · …"
      "layerDimensions": ["group"],   // ["group","character","tier"] → toggleable views
      "groups": [
        { "key": "The Sisters", "label": { "de": "Die Schwestern" }, "color": "#b5651d" }
        /* … */
      ]
    }
    /* ulysses: groupPrefix {"en":"Episode"}, experimental true,
       layerDimensions ["group","character"] … */
  }
}
```

## Data schema

**Rendered GeoJSON** — each `Feature.properties`:

| key | meaning |
|-----|---------|
| `work` | which work (matches a key in `config.works`) |
| `group` / `story` | group number + title (episode/chapter/story) |
| `name` | place / route label |
| `kind` | `place` \| `route` |
| `character` | mover(s), comma-separated (for trajectories) |
| `tier` | `key` \| `waypoint` \| `other` (planned) |
| `time`, `gloss`, `quote`, `ref` | popup content |
| geometry | `Point` (place) or `LineString` (route) |

**Editable source** (`*-source.json`) — `groups`/`episodes`/`chapters` list +
`places` + optional `routes` (with `from`/`to` + cached `coords`, `mode`).
`pipeline/geocode_source.py` turns source → GeoJSON.

## Rights model (per layer — important for a public template)

- **Engine + pipeline code**: MIT (project default).
- **Source texts** (`text/raw/`): public domain only; document
  provenance in a `NOTICE.md` (see Ulysses 1922).
- **Geodata**: licence is per-work, declared in `config.works.*.credit` and a
  data `NOTICE`. Examples here: Dubliners = CC BY-NC 4.0 (derived from Mulliken);
  Ulysses/Portrait = original, CC BY-NC 4.0. **No copyrighted critical editions**
  (e.g. Gabler); cite their line numbers only.

## Start a new project (target workflow)

1. Use the GitHub **template** → new repo.
2. Edit `config.json`: site title, basemap, `view`/`regionBBox`, define `works`
   + `groups` (labels/colours).
3. Add data: write `data/<work>-source.json`, run
   `pipeline/geocode_source.py` → `<work>.geojson`.
4. (Optional) text pipeline: drop a public-domain text in `text/raw/`, configure
   the splitter, run NER `annotate.py` + `candidates.py` to find/verify places.
5. Push → GitHub Pages. Done, no engine edits.

## Roadmap

- **A. Spec** *(this document)* — define the engine/config/data contract. ✅
- **B. Config-driven engine** — extract all Joyce-specific literals from
  `engine.js` into `config.json`; Joyce keeps working at every step.
- **C. Template-ise** — split `engine/` ↔ `example-joyce/` ↔ `template/` +
  `docs/`; per-layer licences; validate with a tiny second example; publish as a
  GitHub template repository.
