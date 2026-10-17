"use strict";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const currency = (n, digits = 0) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
        .format(n)
        .replace("$", "A$");
const amount = (n) =>
  n == null ? "—" : `${n < 0 ? "−" : "+"}${currency(Math.abs(n), 2)}`;
const relative = (s) => {
  if (!s) return "Not scanned";
  const mins = Math.floor((Date.now() - new Date(s)) / 60000);
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : new Date(s).toLocaleDateString("en-AU");
};
const iconPaths = {
  radar:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v9l6-6"/><circle cx="12" cy="12" r="1"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  sliders:
    '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2M12 16h.01"/>',
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  download: '<path d="M12 3v13m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  shield:
    '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M7 17 17 7H7m10 0v10"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="m15 4 5 5-11 11-6 1 1-6zM12 7l5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  box: '<path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11"/>',
};
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.file}</svg>`;
}
function hydrate(root = document) {
  $$("[data-icon]", root).forEach(
    (el) => (el.innerHTML = icon(el.dataset.icon)),
  );
}
let state = null,
  view = "scout",
  filter = "all",
  term = "",
  sort = "margin",
  polling = null,
  toastTimer = null,
  importKind = "listings",
  busy = false;

function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 6500);
}
async function api(path, data) {
  const res = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-FlipCheck-Token": state?.csrf_token || "",
          },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await res.json();
  if (!res.ok)
    throw Error(
      body.error || "The local service could not complete this action.",
    );
  return body;
}
async function refresh() {
  try {
    state = await api("/api/state");
    $("#error-banner").classList.add("hidden");
    render();
    if (state.job?.status === "running") {
      if (!polling) polling = setInterval(refresh, 1700);
    } else if (polling) {
      clearInterval(polling);
      polling = null;
    }
  } catch (e) {
    $("#error-banner").textContent =
      `Local connection unavailable. ${e.message} Start the app with “python3 -m flipcheck”, then refresh.`;
    $("#error-banner").classList.remove("hidden");
  }
}
async function action(path, data = {}, message) {
  if (busy) return;
  busy = true;
  try {
    const result = await api(path, data);
    if (message !== false) toast(message || result.message || "Saved.");
    await refresh();
    return result;
  } catch (e) {
    toast(e.message, true);
    throw e;
  } finally {
    busy = false;
  }
}
function modal(title, body, eyebrow = "FLIPCHECK") {
  const d = $("#modal");
  $("#modal-title").textContent = title;
  $("#modal-eyebrow").textContent = eyebrow;
  $("#modal-body").innerHTML = body;
  hydrate(d);
  if (!d.open) d.showModal();
}
function field(label, name, value, opts = {}) {
  return `<label class="field ${opts.wide ? "wide" : ""}"><span>${esc(label)}</span><input name="${esc(name)}" type="${opts.type || "number"}" value="${esc(value ?? "")}" ${opts.type === "text" ? 'maxlength="150"' : 'min="0" step="0.01"'} ${opts.optional ? "" : "required"}>${opts.help ? `<small>${esc(opts.help)}</small>` : ""}</label>`;
}
function mainScenario(item) {
  const s = item.valuation.scenarios;
  return s.low || s.assumed || null;
}
function badge(item) {
  let status = item.extraction.status;
  if (status === "rejected")
    return '<span class="status-badge excluded"><i></i>Excluded</span>';
  if (status === "needs_review" || item.inbound_shipping == null)
    return '<span class="status-badge review"><i></i>Needs review</span>';
  if (item.valuation.opportunity)
    return `<span class="status-badge"><i></i>${item.synthetic ? "Demo opportunity" : "Inspect opportunity"}</span>`;
  if (item.valuation.method === "user_assumption")
    return '<span class="status-badge neutral">Your assumption</span>';
  if (item.valuation.method === "unavailable")
    return '<span class="status-badge review"><i></i>Needs sales data</span>';
  return '<span class="status-badge neutral">Below target</span>';
}
function deviceArt(item) {
  const rejected = item.extraction.classification === "accessory",
    faulty = item.extraction.classification === "parts_or_faulty";
  return `<div class="device-art ${rejected ? "accessory" : faulty ? "faulty" : ""}" aria-hidden="true">${rejected ? '<svg viewBox="0 0 90 65"><rect x="17" y="10" width="56" height="36" rx="2" fill="#3a4334" stroke="#637252"/><rect x="20" y="13" width="50" height="30" fill="#20281c"/><path d="M43 46v8M34 55h22" stroke="#718363" stroke-width="3"/><path d="m34 24 5 5 10-11" stroke="#70895a" fill="none"/></svg>' : `<svg viewBox="0 0 90 65"><defs><linearGradient id="screen-${item.id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${faulty ? "#634638" : "#5e7649"}"/><stop offset="1" stop-color="#202b1b"/></linearGradient></defs><path d="M18 10h53a3 3 0 0 1 3 3v34H15V13a3 3 0 0 1 3-3" fill="#121910" stroke="#748465"/><path d="M19 14h51v29H19z" fill="url(#screen-${item.id})"/><path d="m19 43 51-29M19 14l51 29" stroke="#87916a" opacity=".15"/><path d="m15 47-8 7q-1 3 4 3h67q5 0 4-3l-8-7z" fill="#394631" stroke="#758367"/><path d="M21 48h45l4 4H17z" fill="#222c1c"/><path d="M36 54h17" stroke="#7e8b6d"/><circle cx="45" cy="49" r="1" fill="#c15b45"/>${faulty ? '<path d="m44 17-5 10 9 5-6 9" stroke="#b9a287" fill="none"/>' : ""}</svg>`}</div>`;
}

function render() {
  const demo = state.mode === "demo",
    running = state.job?.status === "running";
  $("#model-sidebar").textContent = `${state.health.model} · Ollama`;
  $("#connection").className =
    `connection${state.health.available ? "" : " offline"}`;
  $("#connection").innerHTML =
    `<i></i>${state.health.available ? "Local model connected" : "Local model unavailable"}`;
  $("#saved-count").textContent = state.listings.filter(
    (x) => x.decision === "saved",
  ).length;
  $("#budget-label").textContent = currency(state.settings.max_price);
  $("#margin-label").textContent = currency(state.settings.min_margin) + "+";
  $("#watchlist-title").innerHTML =
    `${esc(state.settings.query)} <span>Gen 1–3 · eBay AU</span>`;
  const banner = $("#mode-banner");
  banner.className = `mode-banner${demo ? " demo" : ""}`;
  banner.innerHTML = demo
    ? `<div>${icon("box")}<div><strong>Synthetic demo workspace</strong><span>Example listings and sales. No actual deals, live search, or model inference.</span></div></div><button class="text-button" data-action="local">Switch to my workspace →</button>`
    : `<div>${icon("shield")}<div><strong>Your local workspace</strong><span>Gemma 4 analyses on this machine. Live searches are sent to SerpApi.</span></div></div><button class="text-button" data-action="demo">Explore synthetic demo →</button>`;
  $("#scan-button").disabled = running;
  $("#scan-button").innerHTML = running
    ? '<span class="spinner"></span>Analysing…'
    : `${icon("radar")}Scan eBay<span class="button-arrow">↗</span>`;
  const c = state.counts;
  const stats = [
    ["Listings screened", c.scanned, "Current workspace", "radar", ""],
    [
      "Worth a closer look",
      c.opportunities,
      demo ? "Synthetic examples only" : "Conservative margin meets target",
      "arrow",
      "accent",
    ],
    ["Needs your review", c.review, "Missing facts or shipping", "eye", ""],
    [
      "Noise filtered out",
      c.excluded,
      "Faulty, accessories & out of scope",
      "shield",
      "",
    ],
  ];
  $("#stats").innerHTML = stats
    .map(
      ([label, value, note, ico, cls]) =>
        `<article class="stat ${cls}"><div class="stat-top"><span>${label}</span>${icon(ico)}</div><div class="stat-value">${value.toString().padStart(2, "0")}</div><div class="stat-bottom">${cls ? '<span class="tiny-dot"></span>' : ""}${note}</div></article>`,
    )
    .join("");
  renderJob();
  renderContent();
  $$("[data-view]").forEach((x) =>
    x.classList.toggle("active", x.dataset.view === view),
  );
  $$("[data-filter]").forEach((x) => {
    x.classList.toggle("active", x.dataset.filter === filter);
    x.setAttribute("aria-pressed", String(x.dataset.filter === filter));
  });
}
function renderJob() {
  const job = state.job,
    el = $("#job-banner");
  if (!job) {
    el.classList.add("hidden");
    return;
  }
  el.className = `job-banner${job.status === "failed" ? " failed" : ""}`;
  const running = job.status === "running";
  el.innerHTML = `<div class="job-top">${running ? '<span class="spinner"></span>' : icon(job.status === "failed" ? "help" : "check")}<strong>${esc(job.message)}</strong></div><small>${job.kind === "live" ? "eBay AU → local Gemma 4" : job.kind === "analyse" ? "Local model analysis" : "Local import → Gemma 4"} · ${running ? "In progress" : `${job.elapsed_seconds}s · ${relative(job.finished_at)}`}</small>${running ? `<progress class="scan-progress" ${job.total ? `value="${job.processed}" max="${job.total}"` : ""} aria-label="Scan progress"></progress>` : ""}${job.errors?.length || job.skipped?.length ? `<details><summary>View errors and skipped results (${job.errors.length + job.skipped.length})</summary><ul>${job.errors.map((x) => `<li>${esc(x)}</li>`).join("")}${job.skipped.map((x) => `<li>${esc(x.title)} — ${esc(x.reason)}</li>`).join("")}</ul></details>` : ""}`;
}
function renderContent() {
  const names = {
    scout: [
      "Deal scout",
      "Find your next good flip",
      "A sharper shortlist. The evidence to back it up.",
      "The shortlist",
      "Screened locally. Ready for a closer look.",
    ],
    saved: [
      "Saved listings",
      "Good finds, kept close",
      "Your saved listings, with their evidence and assumptions.",
      "Saved listings",
      "Pick up where your research left off.",
    ],
    sales: [
      "Sales library",
      "Better evidence. Better estimates",
      "Your reference library of completed sales.",
      "Sold comparisons",
      "Exact configurations. Traceable sources.",
    ],
    activity: [
      "Scan activity",
      "Every scan, accounted for",
      "A local record of discovery, analysis, and provider errors.",
      "Recent activity",
      "Completed and partial scans stay in your local database.",
    ],
  };
  const n = names[view];
  $("#breadcrumb").textContent = n[0];
  $("#page-title").innerHTML = esc(n[1]) + "<span>.</span>";
  $("#page-subtitle").textContent = n[2];
  $("#feed-title").innerHTML = `${n[3]} <span id="listing-count">0</span>`;
  $("#feed-description").textContent = n[4];
  $("#feed-toolbar").classList.toggle(
    "hidden",
    view === "sales" || view === "activity",
  );
  if (view === "sales") {
    renderSales();
    return;
  }
  if (view === "activity") {
    renderActivity();
    return;
  }
  let items = state.listings.filter(
    (x) => view !== "saved" || x.decision === "saved",
  );
  items = items.filter(
    (x) =>
      filter === "all" ||
      (filter === "opportunities" && x.valuation.opportunity) ||
      (filter === "review" &&
        x.extraction.status !== "rejected" &&
        (x.extraction.status === "needs_review" ||
          x.inbound_shipping == null)) ||
      (filter === "excluded" && x.extraction.status === "rejected"),
  );
  if (term)
    items = items.filter((x) =>
      (x.title + " " + x.description).toLowerCase().includes(term),
    );
  items.sort((a, b) =>
    sort === "price"
      ? a.asking_price - b.asking_price
      : sort === "recent"
        ? b.id - a.id
        : (mainScenario(b)?.margin ?? -1e12) -
          (mainScenario(a)?.margin ?? -1e12),
  );
  $("#listing-count").textContent = items.length;
  if (!items.length) {
    const fresh = !state.listings.length && view === "scout";
    $("#content").innerHTML =
      `<div class="empty"><div class="empty-icon">${icon(view === "saved" ? "bookmark" : "radar")}</div><h3>${fresh ? "Your next good find starts here" : view === "saved" ? "Keep the promising ones close" : "No listings match this view"}</h3><p>${fresh ? "Import marketplace listings for local Gemma 4 analysis, or explore a synthetic example to see the full workflow." : view === "saved" ? "Save a listing with the bookmark button. Its specifications, comparison sales, and cost breakdown will be here when you return." : "Try another filter or search. New imports and scans appear here as they are analysed."}</p>${fresh ? '<button class="button primary" data-action="demo">Explore synthetic demo →</button><button class="button secondary" data-action="import">Import my listings</button>' : view === "saved" ? '<button class="button secondary" data-view="scout">Back to deal scout</button>' : '<button class="button secondary" data-action="reset-filters">Clear filters</button>'}</div>`;
    return;
  }
  $("#content").innerHTML =
    `<div class="table-scroll"><table class="deal-table"><thead><tr><th>LAPTOP & SPECIFICATIONS</th><th>ASKING PRICE</th><th>RESALE RANGE</th><th>EST. MARGIN</th><th>ASSESSMENT</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${items.map(row).join("")}</tbody></table></div><div class="table-note"><span>${icon("shield")}${state.mode === "demo" ? "Synthetic examples · not real market opportunities" : "Estimates from available evidence · inspect before buying"}</span><span>AUD · ${items.length} listing${items.length === 1 ? "" : "s"}</span></div>`;
}
function row(x) {
  const f = x.extraction.facts || {},
    v = x.valuation,
    scenario = mainScenario(x);
  const model = f.model
    ? `${f.model}${f.generation ? " · Gen " + f.generation : ""}`
    : x.title;
  const specs =
    [
      f.cpu,
      f.ram_gb ? f.ram_gb + "GB" : null,
      f.storage_gb ? f.storage_gb + "GB SSD" : null,
    ]
      .filter(Boolean)
      .join(" / ") || "Specifications need confirmation";
  const range = v.range;
  const resale =
    range?.low != null
      ? `${currency(range.low)}–${currency(range.high)}`
      : range?.assumed != null
        ? currency(range.assumed)
        : "—";
  return `<tr class="${x.decision === "dismissed" ? "dismissed" : ""}"><td><div class="item-cell">${deviceArt(x)}<div><button class="item-name" data-detail="${x.id}" title="${esc(x.title)}">${esc(model)}</button><div class="spec-line">${esc(specs)}</div><div class="item-source"><span class="source-square"></span>${x.synthetic ? "SYNTHETIC FIXTURE" : "eBay AU · " + relative(x.last_seen)}</div></div></div></td><td><span class="price">${currency(x.asking_price)}</span><span class="subtext ${x.inbound_shipping == null ? "amber" : ""}">${x.inbound_shipping == null ? "Shipping unknown" : x.inbound_shipping === 0 ? "Free postage" : "+ " + currency(x.inbound_shipping) + " postage"}</span></td><td><span class="price">${resale}</span><span class="subtext">${range?.assumed != null ? "Your resale assumption" : v.count >= 5 ? `${v.count} ${x.synthetic ? "synthetic" : "verified"} sales` : `${v.count}/5 sales required`}</span></td><td>${scenario ? `<span class="profit ${scenario.margin < 0 ? "negative" : ""}">${amount(scenario.margin)}</span><div class="roi">${scenario.roi == null ? "ROI unavailable" : scenario.roi.toFixed(1) + "% est. ROI"}</div>` : '<span class="price">—</span><span class="subtext">Not estimated</span>'}</td><td>${badge(x)}</td><td><div class="row-actions"><button class="icon-button" data-detail="${x.id}" title="Inspect evidence" aria-label="Inspect evidence for ${esc(model)}">${icon("arrow")}</button><button class="icon-button ${x.decision === "saved" ? "is-saved" : ""}" data-save="${x.id}" title="${x.decision === "saved" ? "Unsave" : "Save"} listing" aria-label="${x.decision === "saved" ? "Unsave" : "Save"} ${esc(model)}" aria-pressed="${x.decision === "saved"}">${icon("bookmark")}</button></div></td></tr>`;
}
function renderSales() {
  $("#listing-count").textContent = state.comparisons.length;
  if (!state.comparisons.length) {
    $("#content").innerHTML =
      `<div class="empty"><div class="empty-icon">${icon("layers")}</div><h3>Good estimates start with real sales</h3><p>Import your completed sales with exact specifications and source references. Asking prices are never used as sold comparisons.</p><button class="button primary" data-action="import-sales">Import sold comparisons</button></div>`;
    return;
  }
  $("#content").innerHTML =
    `<div class="table-scroll"><table class="deal-table"><thead><tr><th>CONFIGURATION</th><th>SOLD PRICE</th><th>SOLD / COLLECTED</th><th>SOURCE REFERENCE</th></tr></thead><tbody>${state.comparisons.map((c) => `<tr><td><strong>${esc(c.model)} · Gen ${c.generation}</strong><span class="subtext">${esc(c.cpu)} / ${c.ram_gb}GB / ${c.storage_gb}GB / ${esc(c.condition)}</span></td><td><span class="price">${currency(c.sold_price)}</span><span class="subtext">Item only · ${currency(c.shipping)} shipping</span></td><td>${esc(c.sold_at)}<span class="subtext">Collected ${esc(c.collected_at)}</span></td><td>${esc(c.source)}<span class="subtext">${esc(c.reference)}</span></td></tr>`).join("")}</tbody></table></div><div class="table-note"><span>${state.mode === "demo" ? "All rows are synthetic. No actual transactions." : "User-supplied sales: verification is asserted by the importer, not independently audited."}</span><button class="text-button" data-action="import-sales">Import more →</button></div>`;
}
function renderActivity() {
  $("#listing-count").textContent = state.scans.length;
  if (!state.scans.length) {
    $("#content").innerHTML =
      `<div class="empty"><div class="empty-icon">${icon("activity")}</div><h3>A clear record of every scan</h3><p>Import a batch or scan eBay to start a local analysis run. Synthetic demo replay does not count as live analysis.</p><button class="button secondary" data-action="import">Import listings</button></div>`;
    return;
  }
  $("#content").innerHTML = state.scans
    .map(
      (j) =>
        `<article class="activity-item"><div><h3>${j.kind === "live" ? "Live eBay discovery" : j.kind === "analyse" ? "Local re-analysis" : "Listing import"} · ${esc(j.status)}</h3><p>${esc(j.message)}</p><small>${j.processed} analysed · ${j.elapsed_seconds}s · ${relative(j.finished_at)}</small>${j.errors.length || j.skipped.length ? `<details><summary>${j.errors.length + j.skipped.length} errors / skipped results</summary><p>${j.errors.map(esc).join("<br>")}${j.skipped.map((x) => esc(x.title) + " — " + esc(x.reason)).join("<br>")}</p></details>` : ""}</div><span class="status-badge ${j.status === "failed" ? "excluded" : j.status === "partial" ? "review" : "neutral"}">${esc(j.status)}</span></article>`,
    )
    .join("");
}

function showSettings() {
  const s = state.settings;
  modal(
    "Make the numbers yours",
    `<p class="dialog-description">One focused watchlist. Explicit assumptions. Settings recalculate every listing in this workspace. Fee defaults are illustrative, not current eBay rates.</p><form id="settings-form"><div class="form-section">Watchlist</div><div class="form-grid">${field("Search query", "query", s.query, { type: "text", wide: true })}${field("Maximum purchase price (AUD)", "max_price", s.max_price)}${field("Minimum estimated margin (AUD)", "min_margin", s.min_margin)}</div><div class="form-section">Selling fees & logistics</div><div class="form-grid">${field("Fee rate (%)", "fee_rate", s.fee_rate)}${field("Fixed selling fee (AUD)", "fixed_fee", s.fixed_fee)}<label class="field wide"><span>Percentage fee applies to</span><select name="fee_base"><option value="receipts" ${s.fee_base === "receipts" ? "selected" : ""}>Item price + shipping charged to buyer</option><option value="item" ${s.fee_base === "item" ? "selected" : ""}>Item price only</option></select></label>${field("Packaging (AUD)", "packaging", s.packaging)}${field("Repairs per item (AUD)", "repairs", s.repairs)}${field("Outbound shipping cost (AUD)", "outbound_shipping", s.outbound_shipping)}${field("Shipping charged to buyer (AUD)", "resale_shipping", s.resale_shipping)}${field("Risk allowance (AUD)", "risk_allowance", s.risk_allowance)}${field("Owner labour allowance (AUD)", "labour", s.labour)}</div><div class="form-section">Comparison data & fallback</div><div class="form-grid">${field("Comparison window (days)", "recency_days", s.recency_days)}${field("Your assumed resale price (AUD)", "assumed_resale", s.assumed_resale, { optional: true, help: "Optional fallback when fewer than 5 exact comparisons exist. This never earns an evidence-backed opportunity badge." })}</div><div id="form-error" class="dialog-error hidden" role="alert"></div><div class="dialog-footer"><small>All amounts in AUD. Changes are saved only to this machine.</small><button class="button primary" type="submit">Save & recalculate ${icon("check")}</button></div></form>`,
    "WATCHLIST & COSTS",
  );
  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    for (const key of Object.keys(data))
      if (!["query", "fee_base"].includes(key))
        data[key] = data[key] === "" ? null : Number(data[key]);
    try {
      await action(
        "/api/settings",
        data,
        "Settings saved. Estimates recalculated.",
      );
      $("#modal").close();
    } catch (err) {
      showFormError(err);
    }
  });
}
function showFormError(e) {
  const el = $("#form-error");
  if (el) {
    el.textContent = e.message;
    el.classList.remove("hidden");
  }
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.length) throw Error("Invalid CSV quote.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2) throw Error("CSV needs a header and at least one row.");
  const headers = rows.shift().map((x) => x.trim());
  if (new Set(headers).size !== headers.length)
    throw Error("CSV headers must be unique.");
  const nums = new Set([
    "asking_price",
    "inbound_shipping",
    "generation",
    "ram_gb",
    "storage_gb",
    "sold_price",
    "shipping",
  ]);
  const bools = new Set(["verified", "actual_price_known", "has_variations"]);
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw Error(`CSV row ${i + 2} has the wrong column count.`);
    return Object.fromEntries(
      headers.map((h, j) => {
        let value = r[j].trim();
        if (nums.has(h)) value = value === "" ? null : Number(value);
        if (bools.has(h)) {
          if (!["true", "false", ""].includes(value.toLowerCase()))
            throw Error(`${h} must be true or false.`);
          value = value.toLowerCase() === "true";
        }
        return [h, value];
      }),
    );
  });
}
function showImport(kind = "listings") {
  importKind = kind;
  modal(
    "Bring your own evidence",
    `<p class="dialog-description">Import JSON or CSV. Listings are analysed with your local Gemma 4 model. Sold comparisons must come from completed transactions with actual prices and source references.</p><div class="import-switch"><button class="button ${kind === "listings" ? "selected" : "secondary"}" data-import-kind="listings">${icon("radar")}Marketplace listings</button><button class="button ${kind === "comparisons" ? "selected" : "secondary"}" data-import-kind="comparisons">${icon("layers")}Sold comparisons</button></div><label class="drop-zone"><strong>Choose a JSON or CSV file</strong><span>${kind === "listings" ? "Up to 50 listings per batch · local AI analysis" : "Up to 1,000 sales · exact configuration matching"} · max 2 MB</span><input id="import-file" type="file" accept=".json,.csv,application/json,text/csv"></label><textarea class="import-textarea" id="import-text" aria-label="Paste import JSON or CSV" placeholder='Or paste ${kind === "listings" ? "listing" : "sold comparison"} JSON / CSV here…'></textarea><div class="import-bottom"><span id="import-preview">No data selected</span><button class="text-button" data-action="template">Download ${kind === "listings" ? "listing" : "sales"} template ↗</button></div><div id="form-error" class="dialog-error hidden" role="alert"></div><div class="dialog-footer"><small>${kind === "listings" ? "Use original seller text. Unknown shipping is allowed but prevents margin calculation." : "Verification is your assertion. Synthetic examples belong only in the demo workspace."}</small><button class="button primary" data-action="submit-import">${kind === "listings" ? "Import & analyse locally" : "Import sold comparisons"} ${icon("arrow")}</button></div>`,
    "LOCAL DATA IMPORT",
  );
  $("#import-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2000000) {
      showFormError(Error("Choose a file smaller than 2 MB."));
      return;
    }
    $("#import-text").value = await f.text();
    updateImportPreview();
  });
  $("#import-text").addEventListener("input", updateImportPreview);
}
function importRows() {
  const text = $("#import-text").value.trim();
  if (!text) throw Error("Choose a file or paste import data.");
  if (new TextEncoder().encode(text).length > 2000000)
    throw Error("Import must be smaller than 2 MB.");
  if (text[0] === "[" || text[0] === "{") {
    const value = JSON.parse(text);
    const rows = Array.isArray(value) ? value : value[importKind];
    if (!Array.isArray(rows))
      throw Error(
        `JSON must be an array or an object containing “${importKind}”.`,
      );
    return rows;
  }
  return parseCSV(text);
}
function updateImportPreview() {
  try {
    const rows = importRows();
    $("#import-preview").textContent =
      `${rows.length} records ready to validate`;
    $("#form-error").classList.add("hidden");
  } catch (e) {
    $("#import-preview").textContent = e.message;
  }
}
function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function showDetail(id) {
  const x = state.listings.find((i) => i.id === Number(id));
  if (!x) return;
  const f = x.extraction.facts || {},
    v = x.valuation,
    scenario = mainScenario(x);
  const title = f.model
    ? `${f.model}${f.generation ? " · Gen " + f.generation : ""}`
    : x.title;
  const labels = {
    model: "Model",
    generation: "Generation",
    variant: "Platform",
    cpu: "Processor",
    ram_gb: "RAM (GB)",
    storage_gb: "SSD (GB)",
    condition: "Condition",
  };
  $("#drawer-body").innerHTML =
    `<div class="detail-head">${deviceArt(x)}<div><h3>${esc(title)}</h3><p>${esc(f.cpu || "Processor unconfirmed")} · ${x.synthetic ? "Synthetic example" : "eBay Australia"}</p>${badge(x)}</div></div>${x.synthetic ? '<p class="detail-note amber">Synthetic fixture. Prices and comparison sales are examples, not actual transactions. Replay is not a live Gemma result.</p>' : ""}<p class="detail-description">${esc(x.title)}\n\n${esc(x.description)}</p><div class="detail-actions">${x.url ? `<a class="button primary" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Open original listing ${icon("arrow")}</a>` : ""}<button class="button secondary" data-save="${x.id}">${icon("bookmark")}${x.decision === "saved" ? "Unsave listing" : "Save listing"}</button><button class="button secondary" data-correct="${x.id}">${icon("edit")}Correct</button></div><div class="detail-summary"><strong>${v.method === "user_assumption" ? "Your resale assumption" : v.method === "unavailable" ? "No supported estimate" : "Estimated margin scenarios"}</strong><p>${esc(v.reason)}</p>${
      Object.keys(v.scenarios).length
        ? `<div class="scenario-grid">${Object.entries(v.scenarios)
            .map(
              ([key, s]) =>
                `<div class="scenario ${key}"><span>${key === "assumed" ? "ASSUMED" : key.toUpperCase()}</span><strong>${s ? amount(s.margin) : "—"}</strong><small>${currency(v.range[key])} resale</small></div>`,
            )
            .join("")}</div>`
        : ""
    }</div><div class="detail-section"><h4>Extracted facts <span>${esc(x.extraction.engine || "Not analysed")}</span></h4>${Object.entries(
      labels,
    )
      .map(
        ([key, label]) =>
          `<div class="fact-row"><span>${label}</span><strong>${esc(f[key] ?? "Unknown")}</strong>${x.extraction.evidence?.[key] ? `<q>${esc(x.extraction.evidence[key])}</q>` : "<span>No supporting evidence</span>"}</div>`,
      )
      .join(
        "",
      )}<p class="detail-note">${esc(x.extraction.reason)}${x.extraction.errors?.length ? "<br>" + x.extraction.errors.map(esc).join("<br>") : ""}</p>${x.location_basis ? `<p class="detail-note">Location evidence: ${esc(x.location_basis)}</p>` : ""}${x.correction ? `<p class="detail-note amber">Human correction: ${esc(x.correction)}</p>` : ""}${x.extraction.stats ? `<p class="subtext">Local inference: ${x.extraction.stats.elapsed_seconds}s · ${x.extraction.stats.eval_count ?? "?"} output tokens${x.extraction.cached ? " · cached" : ""}</p>` : ""}<button class="text-button" data-analyse="${x.id}">${icon("radar")}Analyse again with ${esc(state.health.model)} →</button></div><div class="detail-section"><h4>Every cost, accounted for <span>${esc(v.costs.fee_rate)}% + ${currency(v.costs.fixed_fee, 2)} configured fees</span></h4>${[
      ["Purchase price", x.asking_price],
      ["Inbound postage", x.inbound_shipping],
      ["Repairs", v.costs.repairs],
      ["Packaging", v.costs.packaging],
      ["Outbound postage", v.costs.outbound_shipping],
      ["Buyer-paid postage (income)", v.costs.resale_shipping],
      ["Risk allowance", v.costs.risk_allowance],
      ["Owner labour allowance", v.costs.labour],
      ["Selling fees (conservative / assumed)", scenario?.fees],
    ]
      .map(
        ([label, num]) =>
          `<div class="cost-row"><span>${label}</span><strong>${num == null ? "Unknown" : currency(num, 2)}</strong></div>`,
      )
      .join(
        "",
      )}<div class="cost-row total"><span>Conservative / assumed margin</span><strong>${scenario ? amount(scenario.margin) : "Not estimated"}</strong></div><p class="subtext">Pre-tax. Fee base: ${v.costs.fee_base === "receipts" ? "item + buyer-paid shipping" : "item only"}. Values are editable assumptions.</p><button class="text-button" data-action="settings">Edit cost assumptions →</button></div><div class="detail-section"><h4>Comparable sales <span>${v.count} exact matches · ${v.costs.recency_days}-day window</span></h4>${v.comparisons.length ? v.comparisons.map((c) => `<div class="comparison-row"><div><strong>${esc(c.reference)}</strong><span>${esc(c.sold_at)} · ${esc(c.condition)} · ${esc(c.source)}</span></div><strong>${currency(c.sold_price)}</strong></div>`).join("") : '<p class="detail-note">No exact, recent sold comparisons. Import completed sales from the Sales library, or enter your own resale assumption in costs.</p>'}<p class="subtext">Quartiles describe the comparison sample, not a calibrated prediction interval. ${x.synthetic ? "Synthetic comparisons are excluded from real listings." : "Sales verification is asserted by the importer."}</p></div><div class="detail-section"><h4>Price observations <span>Availability not verified</span></h4>${x.observations.map((o) => `<div class="cost-row"><span>${new Date(o.observed_at).toLocaleString("en-AU")}</span><strong>${currency(o.asking_price)} + ${o.shipping == null ? "unknown shipping" : currency(o.shipping)}</strong></div>`).join("")}</div><div class="dialog-footer"><small>Physical condition and seller claims require inspection.</small><button class="button secondary" data-dismiss="${x.id}">${icon("trash")}${x.decision === "dismissed" ? "Restore listing" : "Dismiss listing"}</button></div>`;
  hydrate($("#drawer"));
  if (!$("#drawer").open) $("#drawer").showModal();
}
function showCorrection(id) {
  const item = state.listings.find((x) => x.id === Number(id));
  const f = item.extraction.facts || {};
  $("#drawer").close();
  modal(
    "Record what you confirmed",
    `<p class="dialog-description">Use this after checking the original listing or speaking with the seller. Your confirmation is stored as human evidence, separately from Gemma output. Original fault and conflict signals still require review.</p><form id="correction-form"><div class="form-grid">${field("Generation (1–3)", "generation", f.generation)}<label class="field"><span>Platform</span><select name="variant" required><option value="" disabled ${!f.variant ? "selected" : ""}>Select platform</option><option value="Intel" ${f.variant === "Intel" ? "selected" : ""}>Intel</option><option value="AMD" ${f.variant === "AMD" ? "selected" : ""}>AMD</option></select></label>${field("Exact CPU identifier", "cpu", f.cpu, { type: "text", wide: true })}${field("RAM (GB)", "ram_gb", f.ram_gb)}${field("SSD (GB)", "storage_gb", f.storage_gb)}<label class="field"><span>Seller-stated condition</span><select name="condition" required><option value="" disabled ${!f.condition ? "selected" : ""}>Confirm condition</option><option value="good" ${f.condition === "good" ? "selected" : ""}>Good</option><option value="excellent" ${f.condition === "excellent" ? "selected" : ""}>Excellent</option><option value="fair" ${f.condition === "fair" ? "selected" : ""}>Fair</option></select></label>${field("Confirmed inbound shipping (AUD)", "inbound_shipping", item.inbound_shipping, { optional: true })}<label class="field wide"><span>How did you confirm these details?</span><textarea name="note" minlength="5" maxlength="1500" required placeholder="e.g. Seller confirmed the configuration and postage in a message."></textarea></label></div><div id="form-error" class="dialog-error hidden" role="alert"></div><div class="dialog-footer"><small>Only confirm details you have checked. No condition is physically verified by FlipCheck.</small><button class="button primary" type="submit">Save correction</button></div></form>`,
    "HUMAN REVIEW",
  );
  $("#correction-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const facts = {
      model: "ThinkPad T14",
      generation: Number(values.generation),
      variant: values.variant,
      cpu: values.cpu,
      ram_gb: Number(values.ram_gb),
      storage_gb: Number(values.storage_gb),
      condition: values.condition,
    };
    const note = `User confirmed: ThinkPad T14; Gen ${facts.generation}; ${facts.variant}; ${facts.cpu}; ${facts.ram_gb}GB RAM; ${facts.storage_gb}GB SSD; ${facts.condition} condition. ${values.note}`;
    const extraction = {
      classification: "complete_laptop",
      reason: "Human confirmed details; see correction note.",
      ...Object.fromEntries(
        Object.entries(facts).map(([k, value]) => [
          k,
          { value, evidence: note },
        ]),
      ),
    };
    try {
      await action("/api/correct", {
        id: item.id,
        note,
        extraction,
        inbound_shipping:
          values.inbound_shipping === ""
            ? null
            : Number(values.inbound_shipping),
      });
      $("#modal").close();
      showDetail(item.id);
    } catch (e) {
      showFormError(e);
    }
  });
}
function showHelp() {
  modal(
    "Evidence before estimates",
    `<div class="prose"><h3>A useful shortlist, with honest limits.</h3><p>FlipCheck focuses on Lenovo ThinkPad T14 Gen 1–3 laptops in Australia. Gemma 4 reads listing text locally through Ollama. Unsupported facts stay unknown.</p><h3>How a listing gets an estimate</h3><p>At least five recent sold comparisons must match the exact configuration and condition. The lower quartile is used for the conservative margin. Without enough sales, you can supply a resale assumption; it never earns an evidence-backed opportunity badge.</p><h3>Your costs are part of the answer</h3><p>Fees, postage, repairs, packaging, labour, and risk allowance are explicit. Defaults are examples, not current platform rates. Unknown inbound shipping prevents margin calculation.</p><h3>What stays local</h3><p>Listing analysis, imports, margins, and decisions stay on this machine. Live searches send your query to SerpApi and require internet. There is no cloud inference fallback or telemetry.</p><h3>A demo is a demo</h3><p>The synthetic workspace contains hand-authored examples and simulated sales. “Analyse again” runs your actual local model. Neither mode guarantees availability, condition, or profit.</p><p>Start: <code>python3 -m flipcheck</code><br>Model: <code>${esc(state.health.model)}</code><br>SerpApi: <strong>${state.health.serpapi_configured ? "configured" : "not configured"}</strong><br>Source: <a href="https://github.com/quangvinhlee/FlipCheck" target="_blank" rel="noopener noreferrer">quangvinhlee/FlipCheck ↗</a></p></div>`,
    "HOW IT WORKS",
  );
}

async function dispatch(target) {
  if (target.dataset.view) {
    view = target.dataset.view;
    filter = "all";
    render();
    return;
  }
  if (target.dataset.filter) {
    filter = target.dataset.filter;
    render();
    return;
  }
  if (target.dataset.detail) {
    showDetail(target.dataset.detail);
    return;
  }
  if (target.dataset.save) {
    const id = Number(target.dataset.save),
      x = state.listings.find((x) => x.id === id);
    await action(
      "/api/decision",
      { id, decision: x.decision === "saved" ? "new" : "saved" },
      x.decision === "saved" ? "Listing unsaved." : "Listing saved locally.",
    );
    if ($("#drawer").open) showDetail(id);
    return;
  }
  if (target.dataset.correct) {
    showCorrection(target.dataset.correct);
    return;
  }
  if (target.dataset.dismiss) {
    const id = Number(target.dataset.dismiss),
      x = state.listings.find((x) => x.id === id);
    await action("/api/decision", {
      id,
      decision: x.decision === "dismissed" ? "new" : "dismissed",
    });
    $("#drawer").close();
    return;
  }
  if (target.dataset.analyse) {
    await action("/api/analyse", { id: Number(target.dataset.analyse) });
    $("#drawer").close();
    return;
  }
  if (target.dataset.importKind) {
    showImport(target.dataset.importKind);
    return;
  }
  const name = target.dataset.action;
  switch (name) {
    case "close-modal":
      $("#modal").close();
      break;
    case "close-drawer":
      $("#drawer").close();
      break;
    case "settings":
      if ($("#drawer").open) $("#drawer").close();
      showSettings();
      break;
    case "help":
      showHelp();
      break;
    case "demo":
      await action("/api/demo", {});
      view = "scout";
      filter = "all";
      render();
      break;
    case "local":
      await action(
        "/api/mode",
        { mode: "local" },
        "Opened your local workspace.",
      );
      break;
    case "scan":
      if (!state.health.serpapi_configured) {
        toast(
          "Add SERPAPI_KEY to your local .env and restart, or import listings.",
          true,
        );
        return;
      }
      if (!state.health.available) {
        toast(
          "Start Ollama with the configured Gemma 4 model before scanning.",
          true,
        );
        return;
      }
      await action(
        "/api/scan",
        {},
        "Live discovery started. Results will appear as Gemma analyses them.",
      );
      view = "scout";
      render();
      break;
    case "import":
      showImport();
      break;
    case "import-sales":
      showImport("comparisons");
      break;
    case "submit-import":
      try {
        const rows = importRows();
        await action(`/api/import/${importKind}`, { [importKind]: rows });
        $("#modal").close();
        view = importKind === "listings" ? "scout" : "sales";
        filter = "all";
        render();
      } catch (e) {
        showFormError(e);
      }
      break;
    case "template":
      download(
        await api(`/api/templates/${importKind}`),
        `flipcheck-${importKind}-template.json`,
      );
      break;
    case "export":
      download(
        await api("/api/export"),
        `flipcheck-${state.mode}-${new Date().toISOString().slice(0, 10)}.json`,
      );
      toast("Workspace exported. Keep your private sales records secure.");
      break;
    case "reset-filters":
      term = "";
      filter = "all";
      $("#search").value = "";
      render();
      break;
  }
}
document.addEventListener("click", (e) => {
  const target = e.target.closest(
    "[data-action],[data-view],[data-filter],[data-detail],[data-save],[data-correct],[data-dismiss],[data-analyse],[data-import-kind]",
  );
  if (!target) return;
  dispatch(target).catch(() => {});
});
$("#search").addEventListener("input", (e) => {
  term = e.target.value.toLowerCase();
  if (state) renderContent();
});
$("#sort").addEventListener("change", (e) => {
  sort = e.target.value;
  renderContent();
});
for (const d of $$(".modal,.drawer"))
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
hydrate();
refresh();
