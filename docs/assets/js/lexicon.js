(function () {
  "use strict";
  console.log("lexicon.js loaded");

  // -----------------------------
  // config
  // -----------------------------
  const LEXICON_URL = "assets/data/lexicon.json";
  const PARADIGMS_URL = "assets/data/paradigms.json";
  const AUDIO_DIR = "assets/audio"; // expects `${AUDIO_DIR}/${entry.id}.mp3`

  // -----------------------------
  // DOM helpers
  // -----------------------------
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const ch of kids) n.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    return n;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getAny(obj, keys, dflt = "") {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
        const v = obj[k];
        if (v !== null && v !== undefined && String(v).trim() !== "") return v;
      }
    }
    return dflt;
  }

  function chapterOf(e) {
    let raw = getAny(e, ["chapter", "ch", "section"], "");
    if (!raw) return "";
    let s = String(raw).trim();
    const low = s.toLowerCase();
    if (low.startsWith("chapter") || low.startsWith("ch")) {
      const parts = s.split(/\s+/);
      s = parts[parts.length - 1] || s;
    }
    for (const sep of ["_", ".", "-", " "]) {
      if (s.includes(sep)) {
        const left = s.split(sep)[0].trim();
        if (left) return left;
      }
    }
    return s;
  }

  function normPos(p) {
    const s = String(p || "").trim().toLowerCase();
    if (!s) return "other";
    if (s === "adj") return "adjective";
    return s;
  }

  function posLabelSimple(entry) {
    return normPos(entry?.pos);
  }

  function genderWord(entry) {
    const g = String(entry?.gender || "").toLowerCase().replace(".", "").trim();
    if (!g) return "";
    if (g === "m" || g === "masc" || g === "masculine") return "masculine";
    if (g === "f" || g === "fem" || g === "feminine") return "feminine";
    if (g === "n" || g === "neut" || g === "neuter") return "neuter";
    return g;
  }

  function adjStemLabel(entry) {
    const st = String(entry?.stem_type || "").toLowerCase().trim();
    if (!st) return "";
    if (st === "thematic") return "thematic";
    if (st === "i" || st === "i_stem" || st === "istem") return "i-stem";
    if (st === "u" || st === "u_stem" || st === "ustem") return "u-stem";
    if (st === "consonant" || st === "cons" || st === "c_stem") return "consonant-stem";
    if (st === "nt" || st === "nt_stem") return "nt-stem";
    return st;
  }

  function lineForEntry(e) {
    const lemma = getAny(e, ["lemma", "headword", "word"], "(missing lemma)");
    const gloss = getAny(e, ["gloss", "meaning"], "");
    return gloss ? `${lemma} — ‘${gloss}’` : `${lemma}`;
  }

  function getExtendedMeaning(entry) {
    return getAny(entry, ["extended_meaning", "extended_gloss", "note", "notes"], "");
  }

  // -----------------------------
  // paradigm helpers
  // -----------------------------
  function normSlotKey(k) {
    return String(k ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_");
  }

  // adjective macro
  const ADJ_MACROS = {
    "them_adj":      { m: "o_stem_m",     n: "o_stem_n",     f: "ah2_stem_f" },
    "them_adj_oxy":  { m: "o_stem_m_oxy", n: "o_stem_n_oxy", f: "ah2_stem_f_oxy" },
    // add more later, e.g. i-stem adjectives:
    // "i_adj": { m:"i_stem_m", n:"i_stem_n", f:"i_stem_f" }
  };


  // default “typical IE” distribution
  const STRONG_SLOTS_DEFAULT = new Set([
    "nom_sg", "voc_sg", "acc_sg",
    "nom_du", "voc_du", "acc_du",
    "nom_pl", "voc_pl"
  ]);

  function stemForSlot(entry, slot, opts = null) {
    // opts.forceStem: if provided, use this stem for all slots (useful for adjective macros)
    if (opts && opts.forceStem != null) {
      return String(opts.forceStem || "").replace(/-+$/g, "");
    }

    let strong = getAny(entry, ["strong_stem", "stem"], "");
    let weak = getAny(entry, ["weak_stem"], "") || strong;

    // If stems are stored with trailing hyphen, strip it so we don't show "-" in cells.
    strong = String(strong || "").replace(/-+$/g, "");
    weak = String(weak || "").replace(/-+$/g, "");

    if (!strong && !weak) return "";
    return STRONG_SLOTS_DEFAULT.has(slot) ? strong : weak;
  }

  function joinForm(stem, ending) {
    const s = String(stem ?? "").replace(/-+$/g, "");
    if (ending == null) return s ? s : "—";
    let e = String(ending ?? "").trim();

    if (!s && !e) return "—";
    if (e === "—") return "—";
    if (!e || e === "∅") return s;

    // If endings are stored with a leading hyphen like "-os", strip it.
    e = e.replace(/^-+/, "");

    // Handle alternations like "∅ / s"
    if (e.includes(" / ")) {
      const parts = e.split(" / ").map(p => p.trim().replace(/^-+/, ""));
      return parts.map(p => (p === "∅" || p === "" ? s : (s + p))).join(" / ");
    }

    return s + e;
  }

  function getOverrideForm(entry, slot, genderTag = null) {
    const rawSlot = String(slot ?? "");
    const normSlot = normSlotKey(rawSlot);

    const pools = [
      entry?.overrides,
      entry?.paradigm_overrides,
      entry?.forms,
    ];

    const tryKeys = [];
    if (genderTag) {
      const g = String(genderTag).trim().toLowerCase();
      if (g) {
        tryKeys.push(`${g}_${rawSlot}`);
        if (normSlot) tryKeys.push(`${g}_${normSlot}`);
      }
    }
    tryKeys.push(rawSlot);
    if (normSlot) tryKeys.push(normSlot);

    for (const pool of pools) {
      if (!pool || typeof pool !== "object") continue;
      for (const k of tryKeys) {
        if (Object.prototype.hasOwnProperty.call(pool, k)) {
          const v = pool[k];
          if (v != null && String(v).trim() !== "") return v;
        }
      }
    }
    return null;
  }

  function renderParadigmTableHTML(entry, pObj, opts = null) {
    if (!pObj || !pObj.endings) return "<em>No paradigm data available for this entry.</em>";

    const CASES = [
      ["nom", "Nominative"],
      ["voc", "Vocative"],
      ["acc", "Accusative"],
      ["inst", "Instrumental"],
      ["dat", "Dative"],
      ["abl", "Ablative"],
      ["gen", "Genitive"],
      ["loc", "Locative"],
    ];
    const NUMS = [
      ["sg", "Singular"],
      ["du", "Dual"],
      ["pl", "Plural"],
    ];

    const endings = pObj.endings || {};

    let html = "";
    html += "<table class='lex-paradigm-table'>";
    html += "<thead><tr><th>Case</th>";
    for (const [, nlab] of NUMS) html += "<th>" + escapeHtml(nlab) + "</th>";
    html += "</tr></thead><tbody>";

    for (const [ck, clab] of CASES) {
      html += "<tr>";
      html += "<th>" + escapeHtml(clab) + "</th>";

      for (let i = 0; i < NUMS.length; i++) {
        const nk = NUMS[i][0];
        const slot = ck + "_" + nk;

        let form = getOverrideForm(entry, slot, opts && opts.genderTag ? opts.genderTag : null);

        if (form == null || String(form).trim() === "") {
          const end = Object.prototype.hasOwnProperty.call(endings, slot) ? endings[slot] : "—";
          const stem = stemForSlot(entry, slot, opts);
          form = joinForm(stem, end);
        }

        let style = "";
        if (i === 0) style = "padding-right:1.25em;";
        if (i === 1) style = "padding-left:0.75em; padding-right:1.25em;";
        if (i === 2) style = "padding-left:0.75em;";

        html += `<td style="${style}">${escapeHtml(form)}</td>`;
      }

      html += "</tr>";
    }

    html += "</tbody></table>";
    return html;
  }

  function stemForAdj(entry) {
    // For adjective macros, prefer a single stem across genders.
    // Priority: entry.stem -> entry.strong_stem -> entry.weak_stem -> lemma (last resort)
    const s = getAny(entry, ["stem", "strong_stem", "weak_stem"], "");
    const lemma = getAny(entry, ["lemma", "headword", "word"], "");
    return String(s || lemma || "").replace(/-+$/g, "");
  }

  function renderParadigmBlockHTML(entry, paradigms) {
    // ✅ hardcoded paradigms (pronouns, etc.)
    if (typeof isHardcodedEntry === "function" && isHardcodedEntry(entry)) {
      return renderHardcodedParadigm(entry, { showClitics: false });
    }

    const pid = getAny(entry, ["paradigm"], "");
    if (!pid) return "<em>No paradigm specified.</em>";

    // Adjective macro: render three noun paradigms (m/f/n)
    if (Object.prototype.hasOwnProperty.call(ADJ_MACROS, pid)) {
      const map = ADJ_MACROS[pid];
      const baseStem = stemForAdj(entry);

      const parts = [
        ["m", "Masculine", map.m],
        ["f", "Feminine",  map.f],
        ["n", "Neuter",    map.n],
      ];

      let html = "";
      for (const [g, label, subPid] of parts) {
        const pObj = (subPid && paradigms && Object.prototype.hasOwnProperty.call(paradigms, subPid)) ? paradigms[subPid] : null;
        html += `<div class="lex-adj-gender" style="font-weight:700; margin:.65rem 0 .25rem 0;">${escapeHtml(label)}</div>`;
        html += renderParadigmTableHTML(entry, pObj, { genderTag: g, forceStem: baseStem });
      }
      return html;
    }

    // Normal (noun/verb/etc.) paradigm
    const pObj = (pid && paradigms && Object.prototype.hasOwnProperty.call(paradigms, pid)) ? paradigms[pid] : null;
    return renderParadigmTableHTML(entry, pObj, null);
  }

function makeAudioAndPronHTML(entry) {
  const pron = getAny(entry, ["pronunciation", "pron"], "");
  const id = getAny(entry, ["id"], "");
  const audio = id
    ? `<audio class="lex-audio" controls preload="none" src="${AUDIO_DIR}/${escapeHtml(id)}.mp3"></audio>`
    : "";

  // pronunciation first, audio second
  if (pron && audio) {
    return `<span class="lex-pron" style="margin-right:.5rem;">${escapeHtml(pron)}</span>${audio}`;
  }
  if (pron) return `<span class="lex-pron">${escapeHtml(pron)}</span>`;
  if (audio) return audio;
  return "";
}


// -----------------------------
// hardcoded paradigms (pronouns, etc.)
// -----------------------------
function isHardcodedEntry(e) {
  return !!e && (e.paradigm === "hardcoded" || (e.forms && typeof e.forms === "object"));
}

const PRON_CASES = ["nom","voc","acc","inst","dat","abl","gen","loc"];
const PRON_NUMS  = ["sg","du","pl"];

function renderFormSlot(slot, showClitics=false) {
  if (!slot) return "—";

  // legacy fallback: allow a plain string
  if (typeof slot === "string") return slot;

  const tonic  = (slot.tonic  || []).filter(Boolean);
  const clitic = (slot.clitic || []).filter(Boolean);

  // main display: tonic if present, else clitic if present
  const main = tonic.length ? tonic.join(" / ")
            : (clitic.length ? clitic.join(" / ") : "—");

  if (!showClitics) return main;

  // If tonic is empty, don't duplicate "clitic" label
  if (!tonic.length) return main;

  if (!clitic.length) return main;
  return `${main} <span class="lex-clitic">(cl. ${clitic.join(" / ")})</span>`;
}

function renderHardcodedParadigm(entry, { showClitics=false } = {}) {
  const forms = entry.forms || {};
  let html = `<table>
    <thead><tr><th></th>${PRON_NUMS.map(n=>`<th>${n}</th>`).join("")}</tr></thead><tbody>`;

  for (const c of PRON_CASES) {
    html += `<tr><th>${c}</th>`;
    for (const n of PRON_NUMS) {
      const key = `${c}_${n}`;
      html += `<td>${renderFormSlot(forms[key], showClitics)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

  // -----------------------------
  // expanded entry renderer
  // -----------------------------
  function renderExpandedEntryHTML(entry, paradigms) {
    const lemma = getAny(entry, ["lemma", "headword", "word"], "(missing lemma)");
    const baseMeaning = getAny(entry, ["gloss", "meaning"], "");
    const extended = getExtendedMeaning(entry);

    const pos = posLabelSimple(entry);

    const metaParts = [];
    if (pos) metaParts.push(pos);

    if (pos === "noun") {
      const g = genderWord(entry);
      if (g) metaParts.push(g);
    } else if (pos === "adjective") {
      const st = adjStemLabel(entry);
      if (st) metaParts.push(st);
    }

    const audioPron = makeAudioAndPronHTML(entry);
    const metaLeft = metaParts.join(" | ");
    const metaLine = (metaLeft && audioPron)
      ? `${escapeHtml(metaLeft)} <span class="lex-sep">|</span> ${audioPron}`
      : (metaLeft ? escapeHtml(metaLeft) : audioPron);

    const tableHTML = renderParadigmBlockHTML(entry, paradigms);

    let html = "";
    html += `<div class="lex-entry-head">`;
    html += `<div class="lex-entry-title"><span class="lex-lemma">${escapeHtml(lemma)}</span>`;
    if (baseMeaning) html += ` <span class="lex-base">‘${escapeHtml(baseMeaning)}’</span>`;
    html += `</div>`;
    if (metaLine) html += `<div class="lex-entry-meta">${metaLine}</div>`;
    if (extended) html += `<div class="lex-entry-extended">${escapeHtml(extended)}</div>`;
    html += `</div>`;

    html += tableHTML;
    return html;
  }

  // -----------------------------
  // list renderer
  // -----------------------------
  function renderList(targetUl, rows, paradigms) {
    targetUl.innerHTML = "";
    for (const r of rows) {
      const li = el("li", { class: "lex-item" });
      const wordBtn = el("button", { class: "lex-word", type: "button", text: r.line });
      const pane = el("div", { class: "lex-paradigm", "data-open": "false" });
      pane.innerHTML = "<em>Click the word to show the entry.</em>";

      wordBtn.addEventListener("click", () => {
        const open = pane.getAttribute("data-open") === "true";
        pane.setAttribute("data-open", open ? "false" : "true");
        if (!open) pane.innerHTML = renderExpandedEntryHTML(r.raw, paradigms);
        else pane.innerHTML = "<em>Click the word to show the entry.</em>";
      });

      li.appendChild(wordBtn);
      li.appendChild(pane);
      targetUl.appendChild(li);
    }
  }

  function setActiveTab(which) {
    const tabAll = document.getElementById("tab-all");
    const tabCh = document.getElementById("tab-ch");
    const panAll = document.getElementById("panel-all");
    const panCh = document.getElementById("panel-ch");
    if (!tabAll || !tabCh || !panAll || !panCh) return;

    const isAll = which === "all";
    tabAll.setAttribute("aria-selected", isAll ? "true" : "false");
    tabCh.setAttribute("aria-selected", isAll ? "false" : "true");
    panAll.setAttribute("data-active", isAll ? "true" : "false");
    panCh.setAttribute("data-active", isAll ? "false" : "true");
  }

  function initTabs() {
    const tabAll = document.getElementById("tab-all");
    const tabCh = document.getElementById("tab-ch");
    if (!tabAll || !tabCh) return;
    tabAll.addEventListener("click", () => setActiveTab("all"));
    tabCh.addEventListener("click", () => setActiveTab("ch"));
  }

  // -----------------------------
  // boot
  // -----------------------------
  async function boot() {
    initTabs();

    let lex = [];
    let paradigms = {};

    try {
      const [lexResp, parResp] = await Promise.all([
        fetch(LEXICON_URL, { cache: "no-store" }),
        fetch(PARADIGMS_URL, { cache: "no-store" }),
      ]);
      if (!lexResp.ok) throw new Error("lexicon fetch failed: " + lexResp.status);
      if (!parResp.ok) throw new Error("paradigms fetch failed: " + parResp.status);

      lex = await lexResp.json();
      paradigms = await parResp.json();
      window.PARADIGMS = paradigms;
    } catch (err) {
      console.error(err);
      const container = document.getElementById("lexAllContainer") || document.body;
      container.innerHTML =
        "<p><strong>Error:</strong> could not load <code>assets/data/lexicon.json</code> and/or <code>assets/data/paradigms.json</code>.</p>";
      return;
    }

    const items = lex.map((e) => ({
      id: getAny(e, ["id"], ""),
      chapter: chapterOf(e),
      pos: normPos(getAny(e, ["pos"], "")),
      line: lineForEntry(e),
      raw: e,
    }));

    // All words: group by POS
    const allContainer = document.getElementById("lexAllContainer");
    if (allContainer) {
      const groups = new Map();
      for (const it of items) {
        const k = it.pos || "other";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      }

      const preferred = ["noun", "adjective", "pronoun", "verb", "other"];
      const keys = Array.from(groups.keys());
      keys.sort((a, b) => {
        const ia = preferred.indexOf(a);
        const ib = preferred.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        return a.localeCompare(b);
      });

      allContainer.innerHTML = "";
      for (const k of keys) {
        const section = el("section", { class: "lex-pos-section" });
        section.appendChild(el("h2", { class: "lex-pos-title", text: k.charAt(0).toUpperCase() + k.slice(1) }));
        const ul = el("ul", { class: "lex-list" });
        const rows = groups.get(k).slice().sort((a, b) => (a.line || "").localeCompare(b.line || ""));
        renderList(ul, rows, paradigms);
        section.appendChild(ul);
        allContainer.appendChild(section);
      }
    }

    // By chapter: dropdown + list
    const sel = document.getElementById("lexChapter");
    const ulCh = document.getElementById("lexListCh");
    if (sel && ulCh) {
      const chapters = Array.from(new Set(items.map((it) => it.chapter).filter(Boolean))).sort((a, b) => {
        return String(a).length - String(b).length || String(a).localeCompare(String(b));
      });

    sel.innerHTML = "";
    sel.appendChild(el("option", { value: "" }, "All chapters"));
    for (const ch of chapters)
      sel.appendChild(el("option", { value: String(ch) }, "Chapter " + ch));

    // default to Chapter 1 if it exists
    if (chapters.includes("1")) {
      sel.value = "1";
    }


    const drawCh = () => {
      const ch = sel.value;
    
      // filter to chapter
      let rows = items;
      if (ch) rows = rows.filter(r => String(r.chapter || "") === String(ch));
    
      // group by POS
      const groups = new Map();
      for (const r of rows) {
        const k = r.pos || "other";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
    
      const preferred = ["noun", "adjective", "pronoun", "verb", "other"];
      const keys = Array.from(groups.keys());
      keys.sort((a, b) => {
        const ia = preferred.indexOf(a);
        const ib = preferred.indexOf(b);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        return a.localeCompare(b);
      });
    
      // render sections into the chapter panel
      ulCh.innerHTML = "";                // <-- IMPORTANT: ulCh becomes a container
      for (const k of keys) {
        const section = el("section", { class: "lex-pos-section" });
        section.appendChild(el("h2", { class: "lex-pos-title", text: k.charAt(0).toUpperCase() + k.slice(1) }));
    
        const ul = el("ul", { class: "lex-list" });
        const groupRows = groups.get(k).slice().sort((a, b) => (a.line || "").localeCompare(b.line || ""));
        renderList(ul, groupRows, paradigms);
    
        section.appendChild(ul);
        ulCh.appendChild(section);
      }
    };


      sel.addEventListener("change", drawCh);
      drawCh();
      // DEFAULT VIEW: Chapter 1
      setActiveTab("ch");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
