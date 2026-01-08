(function(){ console.log("lexicon.js loaded"); })();
(function() {
  // -----------------------------
  // helpers
  // -----------------------------
  function normalizeGender(g) {
    if (!g) return "";
    let s = String(g).trim();
    s = s.replace(/masc/ig, "m").replace(/fem/ig, "f").replace(/neut/ig, "n");
    s = s.replace(/^m\.$/i, "m").replace(/^f\.$/i, "f").replace(/^n\.$/i, "n");
    if (["m","f","n"].includes(s.toLowerCase())) return s.toLowerCase() + ".";
    return s.endsWith(".") ? s : (s + ".");
  }

  function getAny(obj, keys, dflt="") {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
        const v = obj[k];
        if (v !== null && v !== undefined && v !== "") return v;
      }
    }
    return dflt;
  }

  function chapterOf(e) {
    let raw = getAny(e, ["chapter","ch","section"], "");
    if (!raw) return "";
    let s = String(raw).trim();
    const low = s.toLowerCase();
    if (low.startsWith("chapter") || low.startsWith("ch")) {
      const parts = s.split(/\s+/);
      s = parts[parts.length - 1] || s;
    }
    for (const sep of ["_",".","-"," "]) {
      if (s.includes(sep)) {
        const left = s.split(sep)[0].trim();
        if (left) return left;
      }
    }
    return s;
  }

  function fmtWordLine(e) {
    const lemma = getAny(e, ["lemma","headword","word"], "(missing lemma)");
    const gender = normalizeGender(getAny(e, ["gender"], ""));
    const glossRaw = getAny(e, ["gloss","meaning"], "");
    const gloss = glossRaw ? ("‘" + glossRaw + "’") : "";
    return (lemma + " – " + (gender ? (gender + " ") : "") + gloss).trim();
  }

  function normPos(p) {
    const s = String(p || "").trim().toLowerCase();
    if (!s) return "other";
    if (s === "adj") return "adjective";
    return s;
  }

  function posLabel(p) {
    const s = normPos(p);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function el(tag, attrs={}, ...children) {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const ch of children) node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    return node;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  // -----------------------------
  // paradigm rendering
  // -----------------------------

  // “Typical IE distribution” (generic default):
  // strong in NOM/VOC/ACC of SG & DU, plus NOM/VOC of PL; weak elsewhere.
  // You can refine per paradigm later, but this gets you real tables now.
  function stemForSlot(entry, slot) {
    const strong = getAny(entry, ["strong_stem"], "");
    const weak   = getAny(entry, ["weak_stem"], "") || strong;

    if (!strong && !weak) return "";

    const strongSlots = new Set([
      "nom_sg","voc_sg","acc_sg",
      "nom_du","voc_du","acc_du",
      "nom_pl","voc_pl"
    ]);

    return strongSlots.has(slot) ? strong : weak;
  }

  function joinForm(stem, ending) {
    // Strip the common "stem-" convention in your lexicon JSON
    let s = (stem ?? "").toString().trim();
    s = s.replace(/-+$/g, ""); // remove trailing hyphen(s)

    if (ending == null) return s ? s : "—";
    let e = (ending ?? "").toString().trim();

    if (!s && !e) return "—";
    if (e === "—") return "—";
    if (!e || e === "∅") return s;

    // Many paradigms store endings with a leading hyphen like "-os"
    e = e.replace(/^-+/g, "");

    // Handle alternations like "∅ / s"
    if (e.includes(" / ")) {
      const parts = e.split(" / ").map(p => p.trim().replace(/^-+/g, ""));
      return parts.map(p => (p === "∅" || p === "" ? s : (s + p))).join(" / ");
    }

    return s + e;
  }

  function renderParadigmTable(entry, pObj) {
    if (!pObj || !pObj.endings) {
      return "<em>No paradigm data available for this entry.</em>";
    }

    const CASES = [
      ["nom","Nominative"],
      ["voc","Vocative"],
      ["acc","Accusative"],
      ["inst","Instrumental"],
      ["dat","Dative"],
      ["abl","Ablative"],
      ["gen","Genitive"],
      ["loc","Locative"],
    ];
    const NUMS = [
      ["sg","Singular"],
      ["du","Dual"],
      ["pl","Plural"],
    ];

    const endings = pObj.endings || {};
    const overrides = (entry.overrides && typeof entry.overrides === "object" && !Array.isArray(entry.overrides))
      ? entry.overrides
      : {};

    function normSlotKey(k) {
      return String(k ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/-+/g, "_");
    }

    function getOverrideForm(slot) {
      // support exact and normalized keys, plus a few alternate property names
      const raw = String(slot ?? "");
      const norm = normSlotKey(raw);

      const pools = [
        overrides,
        entry.paradigm_overrides,
        entry.forms,
      ];

      for (const pool of pools) {
        if (!pool || typeof pool !== "object") continue;

        // exact
        if (Object.prototype.hasOwnProperty.call(pool, raw)) {
          const v = pool[raw];
          if (v != null && String(v).trim() !== "") return v;
        }
        // normalized
        if (norm && Object.prototype.hasOwnProperty.call(pool, norm)) {
          const v = pool[norm];
          if (v != null && String(v).trim() !== "") return v;
        }
      }
      return null;
    }

    let html = "";
    html += "<table class='lex-paradigm-table'>";
    html += "<thead><tr><th>Case</th>";
    for (const [nk, nlab] of NUMS) html += "<th>" + escapeHtml(nlab) + "</th>";
    html += "</tr></thead>";
    html += "<tbody>";

    for (const [ck, clab] of CASES) {
      html += "<tr>";
      html += "<th>" + escapeHtml(clab) + "</th>";
      for (let i = 0; i < NUMS.length; i++) {
        const nk = NUMS[i][0];
        const slot = ck + "_" + nk;

        // 1) override (if present)
        let form = getOverrideForm(slot);

        // 2) fallback: stem + ending
        if (form == null || String(form).trim() === "") {
          const end = Object.prototype.hasOwnProperty.call(endings, slot) ? endings[slot] : "—";
          const stem = stemForSlot(entry, slot);
          form = joinForm(stem, end);
        }

        // Add extra horizontal space between number columns: SG|DU and DU|PL
        const padL = (i === 1 || i === 2) ? "0.75em" : "0";
        const padR = (i === 0 || i === 1) ? "1.25em" : "0";
        html += "<td style='padding-left:" + padL + "; padding-right:" + padR + ";'>" + escapeHtml(form) + "</td>";
      }
      html += "</tr>";
    }

    html += "</tbody></table>";
    return html;
  }

  // Provide the hook your existing click-handler already checks for.
  // renderParadigmForLexiconEntry(entryObj, containerDiv)
  window.renderParadigmForLexiconEntry = function(entry, container) {
    const pid = getAny(entry, ["paradigm"], "");
    const pObj = (window.PARADIGMS && pid) ? window.PARADIGMS[pid] : null;

    // Optional audio
    const audioBase = "assets/audio/";    // <- change if you want
    const audioExt  = ".mp3";            // <- or ".wav"
    const audioId = getAny(entry, ["id"], "");
    const audioPath = `assets/audio/${entry.id}.mp3`;

    let top = "";
    if (audioPath) {
      top += `<div style="margin:.25rem 0 .5rem 0;">
        <audio controls preload="none" src="${audioPath}"></audio>
      </div>`;
    }

    container.innerHTML = top + renderParadigmTable(entry, pObj);
  };

  // -----------------------------
  // fallback KV (kept as backup)
  // -----------------------------
  function renderFallbackParadigmHTML(e) {
    const keys = ["paradigm","stem_type","strong_stem","weak_stem","stem","thematic","PB"];
    const rows = [];
    for (const k of keys) {
      const v = e[k];
      if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
        rows.push([k, String(v)]);
      }
    }
    const overrides = e.overrides;
    if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
      const ks = Object.keys(overrides).sort();
      if (ks.length) {
        const parts = ks.map(kk => kk + "=" + overrides[kk]);
        rows.push(["overrides", parts.join(", ")]);
      }
    }
    if (!rows.length) return "<em>No paradigm data available for this entry.</em>";
    const trs = rows.map(([k,v]) =>
      "<tr><th style='text-align:left; padding-right:.75rem;'>" + escapeHtml(k) + "</th><td>" + escapeHtml(v) + "</td></tr>"
    ).join("");
    return "<table class='lex-kv'><tbody>" + trs + "</tbody></table>";
  }

  function renderList(targetUl, rows) {
    targetUl.innerHTML = "";
    for (const r of rows) {
      const li = el("li", {class:"lex-item"});
      const wordBtn = el("button", {class:"lex-word", type:"button"}, r.line);
      const paradigm = el("div", {class:"lex-paradigm", "data-open":"false"});
      paradigm.innerHTML = r.paradigm_html;

      wordBtn.addEventListener("click", () => {
        const open = paradigm.getAttribute("data-open") === "true";
        paradigm.setAttribute("data-open", open ? "false" : "true");

        if (!open && !paradigm.dataset.rendered && typeof window.renderParadigmForLexiconEntry === "function") {
          try {
            paradigm.innerHTML = "";
            window.renderParadigmForLexiconEntry(r.raw, paradigm);
            paradigm.dataset.rendered = "true";
          } catch (err) {
            console.error("renderParadigmForLexiconEntry failed:", err);
            paradigm.innerHTML = r.paradigm_html;
          }
        }
      });

      li.appendChild(wordBtn);
      li.appendChild(paradigm);
      targetUl.appendChild(li);
    }
  }

// assets/js/lexicon.js
(function () {
  const LEXICON_URL = "assets/data/lexicon.json";
  const PARADIGMS_URL = "assets/data/paradigms.json";
  const AUDIO_DIR = "assets/audio";

  const STRONG_SLOTS_DEFAULT = new Set([
    "nom_sg","voc_sg","acc_sg",
    "nom_du","voc_du","acc_du",
    "nom_pl","voc_pl","acc_pl"
  ]);

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const ch of kids) n.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    return n;
  }

  function joinForm(stem, ending) {
    if (!stem || !String(stem).trim()) return "—";
    if (ending == null) return "—";
    let e = String(ending).trim();
    if (!e || e === "—") return "—";

    // Many paradigms store endings like "-os". We never want to display the hyphen.
    e = e.replace(/^-+/, "");

    if (e.includes(" / ")) {
      const parts = e.split(" / ").map(s => s.trim().replace(/^-+/, ""));
      return parts.map(p => (p === "∅" ? stem : stem + p)).join(" / ");
    }
    if (e === "∅") return stem;
    return stem + e;
  }

  function stemForSlot(entry, slot) {
    const strong = entry.strong_stem || entry.stem || "";
    const weak = entry.weak_stem || strong || "";
    return STRONG_SLOTS_DEFAULT.has(slot) ? strong : weak;
  }

  function renderParadigmTable(entry, paradigmsById) {
    const pid = entry.paradigm;
    if (!pid || !paradigmsById[pid]) {
      return el("p", { class: "lex-note", text: "No paradigm available for this entry." });
    }

    const p = paradigmsById[pid];
    const endings = p.endings || {};
    const cases = p.cases || ["nom","voc","acc","inst","dat","abl","gen","loc"];
    const numbers = p.numbers || ["sg","du","pl"];

    const caseLabels = {
      nom:"Nominative", voc:"Vocative", acc:"Accusative", inst:"Instrumental",
      dat:"Dative", abl:"Ablative", gen:"Genitive", loc:"Locative"
    };
    const numLabels = { sg:"Singular", du:"Dual", pl:"Plural" };

    const overrides = (entry.overrides && typeof entry.overrides === "object") ? entry.overrides : {};

    const table = el("table", { class: "lex-paradigm-table" });
    const thead = el("thead");
    const hr = el("tr");
    hr.appendChild(el("th", { text: "Case" }));
    for (const n of numbers) hr.appendChild(el("th", { text: numLabels[n] || n }));
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const c of cases) {
      const tr = el("tr");
      tr.appendChild(el("th", { text: caseLabels[c] || c }));

      for (const n of numbers) {
        const slot = `${c}_${n}`;

        let form = overrides[slot];
        if (form == null || String(form).trim() === "") {
          const stem = stemForSlot(entry, slot);
          const ending = endings[slot] ?? "—";
          form = joinForm(stem, ending);
        }

        tr.appendChild(el("td", { text: form }));
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return table;
  }

  function makeAudioWidget(entryId) {
    if (!entryId) return null;

    const exts = ["mp3","ogg","wav","m4a"];
    const sources = exts.map(ext => `${AUDIO_DIR}/${entryId}.${ext}`);

    const wrap = el("div", { class: "lex-audio" });
    const audio = el("audio", { controls: "", preload: "none" });
    const src = el("source", { src: sources[0] });
    audio.appendChild(src);

    let i = 0;
    audio.addEventListener("error", () => {
      i += 1;
      if (i >= sources.length) {
        wrap.remove();
        return;
      }
      src.setAttribute("src", sources[i]);
      audio.load();
    });

    wrap.appendChild(audio);
    return wrap;
  }

  function renderList(ul, entries, paradigmsById) {
    ul.innerHTML = "";
    for (const entry of entries) {
      const li = el("li", { class: "lex-item" });

      const head = el("div", { class: "lex-head" });
      const btn = el("button", { class: "lex-word", type: "button", text: entry._line });
      head.appendChild(btn);

      const audio = makeAudioWidget(entry.id);
      if (audio) head.appendChild(audio);

      li.appendChild(head);

      const pane = el("div", { class: "lex-paradigm", "data-open": "false" });
      li.appendChild(pane);

      btn.addEventListener("click", () => {
        const open = pane.getAttribute("data-open") === "true";
        pane.setAttribute("data-open", open ? "false" : "true");

        if (!open && !pane.dataset.rendered) {
          pane.innerHTML = "";
          pane.appendChild(renderParadigmTable(entry, paradigmsById));
          pane.dataset.rendered = "true";
        }
      });

      ul.appendChild(li);
    }
  }

  async function boot() {
    const [lexResp, parResp] = await Promise.all([
      fetch(LEXICON_URL, { cache: "no-store" }),
      fetch(PARADIGMS_URL, { cache: "no-store" })
    ]);

    const lex = await lexResp.json();
    const paradigms = await parResp.json();

    // Example: render everything into #lexList (you create this container in lexicon.qmd)
    const ul = document.getElementById("lexList");
    if (!ul) return;

    const entries = lex.map(e => ({
      ...e,
      _line: `${e.lemma} – ${e.gender || ""} ‘${e.gloss || ""}’`.replace(/\s+/g, " ").trim()
    }));

    renderList(ul, entries, paradigms);
  }

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch(err => console.error("Lexicon boot failed:", err));
  });
})();


  function setActiveTab(which) {
    const tabAll = document.getElementById("tab-all");
    const tabCh  = document.getElementById("tab-ch");
    const panAll = document.getElementById("panel-all");
    const panCh  = document.getElementById("panel-ch");

    const isAll = which === "all";
    tabAll.setAttribute("aria-selected", isAll ? "true" : "false");
    tabCh.setAttribute("aria-selected",  isAll ? "false" : "true");
    panAll.setAttribute("data-active",   isAll ? "true" : "false");
    panCh.setAttribute("data-active",    isAll ? "false" : "true");
  }

  function initTabs() {
    document.getElementById("tab-all").addEventListener("click", () => setActiveTab("all"));
    document.getElementById("tab-ch").addEventListener("click",  () => setActiveTab("ch"));
  }

  // -----------------------------
  // main
  // -----------------------------
  async function boot() {
    initTabs();

    let lex = [];
    let paradigms = {};

    try {
      const [lexResp, parResp] = await Promise.all([
        fetch("assets/data/lexicon.json", {cache:"no-store"}),
        fetch("assets/data/paradigms.json", {cache:"no-store"})
      ]);
      if (!lexResp.ok) throw new Error("lexicon fetch failed: " + lexResp.status);
      if (!parResp.ok) throw new Error("paradigms fetch failed: " + parResp.status);

      lex = await lexResp.json();
      paradigms = await parResp.json();
      window.PARADIGMS = paradigms;
    } catch (err) {
      console.error(err);
      const container = document.getElementById("lexAllContainer");
      container.innerHTML = "<p><strong>Error:</strong> could not load <code>data/lexicon.json</code> and/or <code>data/paradigms.json</code>.</p>";
      return;
    }

    const items = lex.map(e => {
      const pid = getAny(e, ["paradigm"], "");
      const pObj = pid ? paradigms[pid] : null;

      // Pre-fill with fallback; real table will render on first click via renderParadigmForLexiconEntry.
      // (You *can* pre-render here if you want, but lazy rendering keeps the page snappy.)
      return {
        id: getAny(e, ["id"], ""),
        chapter: chapterOf(e),
        pos: getAny(e, ["pos"], ""),
        line: fmtWordLine(e),
        paradigm_html: pObj ? "<em>Click the word to show the paradigm.</em>" : renderFallbackParadigmHTML(e),
        raw: e
      };
    });

    // All words: group by POS
    const allContainer = document.getElementById("lexAllContainer");
    const groups = new Map();
    for (const it of items) {
      const k = normPos(it.pos);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }

    const preferred = ["noun","verb","adjective","other"];
    const keys = Array.from(groups.keys());
    keys.sort((a,b) => {
      const ia = preferred.indexOf(a);
      const ib = preferred.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });

    allContainer.innerHTML = "";
    for (const k of keys) {
      const section = el("section", {class:"lex-pos-section"});
      section.appendChild(el("h2", {class:"lex-pos-title", text: posLabel(k)}));
      const ul = el("ul", {class:"lex-list"});
      const rows = groups.get(k).slice().sort((a,b) => (a.line || "").localeCompare(b.line || ""));
      renderList(ul, rows);
      section.appendChild(ul);
      allContainer.appendChild(section);
    }

    // By chapter: dropdown + list
    const chapters = Array.from(new Set(items.map(it => it.chapter).filter(Boolean)))
      .sort((a,b) => (String(a).length - String(b).length) || String(a).localeCompare(String(b)));

    const sel = document.getElementById("lexChapter");
    const ulCh = document.getElementById("lexListCh");

    sel.innerHTML = "";
    sel.appendChild(el("option", {value:""}, "All chapters"));
    for (const ch of chapters) sel.appendChild(el("option", {value: String(ch)}, "Chapter " + ch));

    const drawCh = () => {
      const ch = sel.value;
      let rows = items;
      if (ch) rows = rows.filter(r => String(r.chapter || "") === String(ch));
      rows = rows.slice().sort((a,b) => (a.line || "").localeCompare(b.line || ""));
      renderList(ulCh, rows);
    };

    sel.addEventListener("change", drawCh);
    drawCh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

