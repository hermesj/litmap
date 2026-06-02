/* Engine — interactive Leaflet map for literary geography, driven entirely by
   config.json + data/*.geojson (no project-specific literals here). The
   reference project it currently serves is "Mapping Joyce". See ARCHITECTURE.md.

   A work is a list of colour-coded `groups` (stories / episodes / chapters);
   every GeoJSON feature carries a `story` property naming its group. */

(function () {
  "use strict";

  // Populated from config.json at startup.
  var CFG, WORKS, UI, REGION;
  var params = new URLSearchParams(location.search);
  var lang = "en";   // set from config.site.defaultLang once loaded
  var work;          // set from ?work= or config.site.defaultWork once loaded

  var map, layers = {}, bounds = {}, placesByGroup = {};

  function groupsOf() { return WORKS[work].groups; }
  function groupFor(story) {
    return groupsOf().find(function (g) { return g.key === story; });
  }
  function colorFor(story) { var g = groupFor(story); return g ? g.color : "#777"; }
  function titleFor(story) { var g = groupFor(story); return g ? (lang === "de" ? g.de : g.key) : story; }

  function esc(s) {
    return (s || "").replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function popupHtml(p) {
    var t = UI[lang];
    var h = '<div class="pop-name">' + esc(p.name);
    if (p.kind === "route") h += ' <span style="font-weight:400;color:#9a8a7a">(' + t.route + ")</span>";
    h += "</div>";
    var sub = titleFor(p.story);
    // geocode_source.py emits the group number as `group`; the older
    // geocode_ulysses.py used `episode`. Accept either for the group prefix.
    var epNum = (p.group != null) ? p.group : p.episode;
    var gp = WORKS[work].groupPrefix;          // e.g. {en:"Episode"} or null
    if (gp && epNum != null) sub = gp[lang] + " " + epNum + " · " + sub;
    h += '<div class="pop-story">' + esc(sub);
    if (p.time) h += ' <span class="pop-time">' + esc(p.time) + "</span>";
    h += "</div>";
    if (p.character) h += '<div class="pop-char">' + esc(p.character) + "</div>";
    if (p.gloss) h += '<div class="pop-gloss">' + esc(p.gloss) + "</div>";
    if (p.quote) {
      h += '<div class="pop-quote">' + esc(p.quote);
      if (p.page) h += '<span class="pop-page">' + t.page + " " + p.page + "</span>";
      else if (p.ref) h += '<span class="pop-page">' + esc(p.ref) + "</span>";
      h += "</div>";
    }
    return h;
  }

  // Opening-view extent: a feature is "in region" if it falls inside the
  // config bounding box [S, W, N, E]. Far-off references stay on the map but
  // do not pull the initial fitBounds outward.
  function inRegion(lat, lon) {
    return lat > REGION[0] && lat < REGION[2] && lon > REGION[1] && lon < REGION[3];
  }

  function clearLayers() {
    Object.keys(layers).forEach(function (k) {
      if (map.hasLayer(layers[k])) map.removeLayer(layers[k]);
    });
    layers = {}; bounds = {};
  }

  // Cap a popup to the map pane's pixel height (minus room for the tip,
  // wrapper chrome and autoPan padding). The pane sits below the header, so a
  // popup no taller than this can never be clipped behind it; anything longer
  // gets Leaflet's scrollbar. Pane height is independent of zoom — only the
  // viewport size matters — so this is stable except across window resizes.
  function popupMaxHeight() {
    return Math.max(120, (map ? map.getSize().y : 600) - 64);
  }

  function loadWork() {
    clearLayers();
    groupsOf().forEach(function (g) { layers[g.key] = L.layerGroup().addTo(map); });

    placesByGroup = {};
    groupsOf().forEach(function (g) { placesByGroup[g.key] = []; });

    fetch(WORKS[work].data)
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        var all = L.latLngBounds([]), region = L.latLngBounds([]);
        geo.features.forEach(function (f) {
          var p = f.properties, grp = layers[p.story];
          if (!grp) return;
          var layer;
          if (f.geometry.type === "Point") {
            var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
            layer = L.circleMarker(ll, { radius: 6, weight: 1.5, color: "#fff",
              fillColor: colorFor(p.story), fillOpacity: 0.9 });
            all.extend(ll); if (inRegion(ll[0], ll[1])) region.extend(ll);
            (bounds[p.story] = bounds[p.story] || L.latLngBounds([])).extend(ll);
          } else if (f.geometry.type === "LineString") {
            var lls = f.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
            layer = L.polyline(lls, { color: colorFor(p.story), weight: 3, opacity: 0.65, dashArray: "5,5" });
            lls.forEach(function (ll) {
              all.extend(ll); if (inRegion(ll[0], ll[1])) region.extend(ll);
              (bounds[p.story] = bounds[p.story] || L.latLngBounds([])).extend(ll);
            });
          }
          if (layer) {
            // maxHeight (sized to the map pane) lets Leaflet add a scrollbar
            // when a long quote would otherwise overflow; autoPan then nudges
            // the popup fully into view below the header.
            layer.bindPopup(popupHtml(p), { maxWidth: 300, maxHeight: popupMaxHeight() });
            layer.addTo(grp);
            (placesByGroup[p.story] || (placesByGroup[p.story] = [])).push({
              name: p.name,
              kind: p.kind || (f.geometry.type === "LineString" ? "route" : "place"),
              layer: layer
            });
          }
        });
        if (region.isValid()) map.fitBounds(region.pad(0.05));
        else if (all.isValid()) map.fitBounds(all.pad(0.05));
        buildSidebar();
      })
      .catch(function (e) {
        document.getElementById("story-list").innerHTML =
          '<p style="padding:1em;font-size:0.85rem">Could not load data: ' + e + "</p>";
      });
  }

  // Pan/zoom to a single place and open its popup, making sure its group
  // layer is switched on first.
  function focusPlace(groupKey, entry, item) {
    if (!map.hasLayer(layers[groupKey])) {
      layers[groupKey].addTo(map);
      if (item) item.classList.remove("off");
    }
    // Open the popup only once the camera has settled: opening mid-flight lets
    // the in-progress flyTo re-centre the marker and override the popup's
    // autoPan, which is what pushed tall popups up behind the header.
    var opened = false;
    function open() { if (!opened) { opened = true; entry.layer.openPopup(); } }
    map.once("moveend", function () { setTimeout(open, 60); });
    setTimeout(open, 1100); // fallback if the view doesn't actually move
    if (entry.kind === "route" && entry.layer.getBounds) {
      map.flyToBounds(entry.layer.getBounds().pad(0.3));
    } else if (entry.layer.getLatLng) {
      map.flyTo(entry.layer.getLatLng(), 16);
    } else {
      open();
    }
  }

  function buildSidebar() {
    var t = UI[lang];
    var box = document.getElementById("story-list");
    box.innerHTML = "";
    var numbered = WORKS[work].numberedGroups;
    groupsOf().forEach(function (g, idx) {
      var entries = placesByGroup[g.key] || [];
      var label = lang === "de" ? g.de : g.key;
      if (numbered) label = (idx + 1) + ". " + label;

      // ── the group row (click = expand/collapse; swatch = layer on/off) ──
      var item = document.createElement("div");
      item.className = "story-item";
      item.innerHTML =
        '<span class="caret">▸</span>' +
        '<span class="swatch" style="background:' + g.color + '" title="' + t.toggleLayer + '"></span>' +
        '<span class="story-name">' + esc(label) + "</span>" +
        '<span class="count">' + entries.length + "</span>";

      // ── the collapsible list of this group's places ──
      var sub = document.createElement("div");
      sub.className = "place-list";
      sub.hidden = true;
      entries.forEach(function (e) {
        var pi = document.createElement("div");
        pi.className = "place-item";
        pi.innerHTML = esc(e.name) +
          (e.kind === "route" ? ' <span class="pl-route">' + t.route + "</span>" : "");
        pi.addEventListener("click", function (ev) {
          ev.stopPropagation();
          focusPlace(g.key, e, item);
        });
        sub.appendChild(pi);
      });

      item.addEventListener("click", function () {
        var opening = sub.hidden;
        sub.hidden = !opening;
        item.classList.toggle("expanded", opening);
        if (opening && !map.hasLayer(layers[g.key])) {
          layers[g.key].addTo(map);
          item.classList.remove("off");
        }
      });

      item.querySelector(".swatch").addEventListener("click", function (ev) {
        ev.stopPropagation();
        var turnOn = !map.hasLayer(layers[g.key]);
        if (turnOn) layers[g.key].addTo(map); else map.removeLayer(layers[g.key]);
        item.classList.toggle("off", !turnOn);
      });

      box.appendChild(item);
      box.appendChild(sub);
    });
  }

  function setVisible(show) {
    document.querySelectorAll(".story-item").forEach(function (item, i) {
      var key = groupsOf()[i].key;
      item.classList.toggle("off", !show);
      if (show) layers[key].addTo(map); else map.removeLayer(layers[key]);
    });
  }

  function applyLang() {
    var t = UI[lang];
    document.documentElement.lang = lang;
    var w = WORKS[work];
    var tagEl = document.getElementById("tagline");
    if (w.experimental) {
      tagEl.innerHTML = esc(w.tagline[lang]) + ' <span class="exp-note">— ' + esc(t.expNote) + "</span>";
    } else {
      tagEl.textContent = w.tagline[lang];
    }
    document.getElementById("btnShowAll").textContent = t.showAll;
    document.getElementById("btnHideAll").textContent = t.hideAll;
    document.getElementById("credit").innerHTML = w.credit[lang];
    var bd = document.getElementById("btnDe"), be = document.getElementById("btnEn");
    if (bd) bd.className = lang === "de" ? "active" : "";
    if (be) be.className = lang === "en" ? "active" : "";
    Object.keys(WORKS).forEach(function (key) {
      var el = document.getElementById("work-" + key);
      if (!el) return;
      el.className = work === key ? "active" : "";
      el.innerHTML = esc(WORKS[key].label[lang]) +
        (WORKS[key].experimental ? ' <sup class="exp" title="' + esc(t.expNote) + '">' + esc(t.exp) + "</sup>" : "");
    });
  }

  // Language and work switches reload with query params so popups and the
  // legend rebuild cleanly in one place.
  window.switchLang = function (l) {
    if (l === lang) return;
    params.set("lang", l); location.search = params.toString();
  };
  window.switchWork = function (w) {
    if (w === work || !WORKS[w]) return;
    params.set("work", w); location.search = params.toString();
  };

  // Build the work tabs from config (applyLang fills their text + active state).
  function buildWorkTabs() {
    var box = document.getElementById("work-switch");
    if (!box) return;
    box.innerHTML = "";
    Object.keys(WORKS).forEach(function (key) {
      var a = document.createElement("a");
      a.id = "work-" + key;
      a.addEventListener("click", function () { switchWork(key); });
      box.appendChild(a);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    fetch("config.json")
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        CFG = cfg; WORKS = cfg.works; UI = cfg.ui; REGION = cfg.view.regionBBox;
        lang = cfg.site.defaultLang || "en";
        work = WORKS[params.get("work")] ? params.get("work") : cfg.site.defaultWork;

        document.title = cfg.site.title;
        var st = document.getElementById("site-title");
        if (st) st.textContent = cfg.site.title;
        buildWorkTabs();

        map = L.map("map", { zoomControl: true }).setView(cfg.view.center, cfg.view.zoom);
        L.tileLayer(cfg.basemap.url, {
          maxZoom: cfg.basemap.maxZoom, attribution: cfg.basemap.attribution
        }).addTo(map);

        // Central popup sizing + placement, for every open path (sidebar click
        // or a direct marker click). Cap the height to the map pane (so a long
        // quote scrolls instead of overflowing) and converge autoPan over a few
        // settle steps so the popup ends up fully inside the pane, below the
        // header — a single autoPan pass undershoots for tall popups.
        map.on("popupopen", function (e) {
          var p = e.popup;
          p.options.maxHeight = popupMaxHeight();
          p.update();
          [60, 320, 650].forEach(function (d) {
            setTimeout(function () { if (p.isOpen && p.isOpen() && p._adjustPan) p._adjustPan(); }, d);
          });
        });

        // Re-fit an open popup when the window (and thus the map pane) is resized.
        map.on("resize", function () {
          var p = map._popup;
          if (p && p.isOpen()) { p.options.maxHeight = popupMaxHeight(); p.update(); if (p._adjustPan) p._adjustPan(); }
        });

        applyLang();
        loadWork();
        document.getElementById("btnShowAll").addEventListener("click", function () { setVisible(true); });
        document.getElementById("btnHideAll").addEventListener("click", function () { setVisible(false); });
      })
      .catch(function (e) {
        document.getElementById("story-list").innerHTML =
          '<p style="padding:1em;font-size:0.85rem">Could not load config.json: ' + e + "</p>";
      });
  });
})();
