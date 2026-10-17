"use client";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Database,
  FileCheck2,
  FileUp,
  LayoutGrid,
  ListFilter,
  LoaderCircle,
  Menu,
  Monitor,
  MoreHorizontal,
  Radar,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import {
  assessment,
  aud,
  download,
  margin,
  relative,
  scenario,
  specLine,
} from "@/lib/format";
import type { Filter, Job, Listing, View, Workspace } from "@/lib/types";
import Modal from "./modal";
import LaptopArt from "./laptop-art";
import Evidence, { Badge } from "./evidence";
import { CorrectionForm, Help, ImportForm, SettingsForm } from "./forms";

type Panel = "settings" | "import" | "import-sales" | "help" | null;
const navigation: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "scout", label: "Deal scout", icon: Radar },
  { view: "saved", label: "Saved listings", icon: Bookmark },
  { view: "sales", label: "Sales library", icon: Database },
  { view: "activity", label: "Scan activity", icon: Activity },
];
const viewCopy: Record<
  View,
  { title: string; sub: string; table: string; note: string }
> = {
  scout: {
    title: "Find the good ones.",
    sub: "Less noise. Clearer margins. All the evidence.",
    table: "Your deal feed",
    note: "Screened locally. Ready for a closer look.",
  },
  saved: {
    title: "A shortlist worth keeping.",
    sub: "Your promising finds, with all their evidence in one place.",
    table: "Saved listings",
    note: "Pick up where your research left off.",
  },
  sales: {
    title: "Better data. Better decisions.",
    sub: "The completed sales behind your resale estimates.",
    table: "Your sales library",
    note: "Exact configurations. Traceable sources.",
  },
  activity: {
    title: "Every scan, accounted for.",
    sub: "A clear record of discovery, analysis, and what needs attention.",
    table: "Scan activity",
    note: "Your analysis history stays on this machine.",
  },
};

export default function Dashboard() {
  const { data, error, pending, toast, notify, mutate, refresh } =
    useWorkspace();
  const [view, setView] = useState<View>("scout"),
    [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("margin"),
    [layout, setLayout] = useState<"table" | "grid">("table");
  const [panel, setPanel] = useState<Panel>(null),
    [selected, setSelected] = useState<number | null>(null),
    [correction, setCorrection] = useState<number | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const copy = viewCopy[view],
    running = data?.job?.status === "running",
    locked = !!pending || running;
  const selectedItem = data?.listings.find((x) => x.id === selected),
    correctionItem = data?.listings.find((x) => x.id === correction);
  const items = useMemo(() => {
    if (!data) return [];
    return data.listings
      .filter((x) => view !== "saved" || x.decision === "saved")
      .filter(
        (x) =>
          filter === "all" ||
          (filter === "opportunities" && x.valuation.opportunity) ||
          (filter === "excluded" && x.extraction.status === "rejected") ||
          (filter === "review" &&
            x.extraction.status !== "rejected" &&
            (x.extraction.status === "needs_review" ||
              x.inbound_shipping == null)),
      )
      .filter((x) =>
        `${x.title} ${x.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "price"
          ? a.asking_price - b.asking_price
          : sort === "recent"
            ? b.id - a.id
            : (scenario(b)?.margin ?? -1e12) - (scenario(a)?.margin ?? -1e12),
      );
  }, [data, filter, query, sort, view]);
  const navigate = (next: View) => {
    setView(next);
    setFilter("all");
    setQuery("");
    setMobileNav(false);
  };
  const save = (item: Listing) =>
    void mutate(
      "decision",
      { id: item.id, decision: item.decision === "saved" ? "new" : "saved" },
      item.decision === "saved"
        ? "Listing removed from saved."
        : "Good find. Saved to your shortlist.",
    ).catch(() => {});
  const demo = () =>
    void mutate("demo")
      .then(() => navigate("scout"))
      .catch(() => {});
  const scan = () => {
    if (!data?.health.serpapi_configured) {
      notify(
        "Add SERPAPI_KEY to your local .env and restart the Python service, or import listings.",
        true,
      );
      return;
    }
    if (!data.health.available) {
      notify(
        "Start Ollama with your configured Gemma 4 model before scanning.",
        true,
      );
      return;
    }
    void mutate(
      "scan",
      {},
      "Scanning eBay Australia. Gemma will analyse each result locally.",
    )
      .then(() => navigate("scout"))
      .catch(() => {});
  };
  async function exportWorkspace() {
    try {
      const r = await fetch("/api/export");
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      download(
        result,
        `flipcheck-${data?.mode}-${new Date().toISOString().slice(0, 10)}.json`,
      );
      notify("Workspace exported. Your private records are included.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`sidebar ${mobileNav ? "open" : ""}`}
        aria-label="Workspace navigation"
      >
        <a href="/" className="brand">
          <span className="brand-symbol">
            <Check size={21} strokeWidth={3} />
          </span>
          flipcheck<span className="brand-period">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">F</span>
          <div>
            <strong>Personal workspace</strong>
            <span>Australia · AUD</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map(({ view: next, label, icon: Icon }) => (
            <button
              key={next}
              className={`nav-link ${view === next ? "active" : ""}`}
              aria-current={view === next ? "page" : undefined}
              onClick={() => navigate(next)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {next === "saved" ? (
                <span className="nav-count">
                  {data?.listings.filter((x) => x.decision === "saved")
                    .length || 0}
                </span>
              ) : (
                next === "scout" && <span className="active-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-promise">
            <span className="promise-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>Your edge stays yours.</strong>
            <p>
              Local intelligence.
              <br />A workspace you control.
            </p>
            <span>
              <i />
              {data?.health.available ? "Gemma 4 connected" : "Local analysis"}
            </span>
          </div>
          <button className="nav-link" onClick={() => setPanel("settings")}>
            <SlidersHorizontal size={18} />
            <span>Watchlist & costs</span>
          </button>
          <button className="nav-link" onClick={() => setPanel("help")}>
            <CircleHelp size={18} />
            <span>How it works</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="profile-avatar">FC</span>
            <div>
              <strong>Your sourcing desk</strong>
              <span>Local edition</span>
            </div>
            <span className="version-badge">v0.2</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.view === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-pill ${data?.health.available ? "" : "offline"}`}
            >
              <i />
              {data?.health.available
                ? "Local AI connected"
                : data
                  ? "Local AI unavailable"
                  : "Connecting locally"}
            </span>
            <button
              className="icon-button help-button"
              aria-label="About FlipCheck"
              onClick={() => setPanel("help")}
            >
              <CircleHelp size={19} />
            </button>
            <span className="top-avatar">FC</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                YOUR SOURCING DESK
              </div>
              <h1>{copy.title}</h1>
              <p>{copy.sub}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                disabled={!data || locked}
                onClick={() => setPanel("import")}
              >
                <FileUp size={16} />
                Import data
              </button>
              <button
                className="button primary"
                disabled={!data || locked}
                onClick={scan}
              >
                {running ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Radar size={17} />
                )}
                {running ? "Analysing…" : "Scan eBay"}
                <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={18} />
              <span>{error}</span>
              <button onClick={() => void refresh()} className="text-button">
                Retry
              </button>
            </div>
          )}
          {!data ? (
            <Loading />
          ) : (
            <>
              <div
                className={`workspace-banner ${data.mode === "demo" ? "demo" : ""}`}
              >
                <div className="workspace-banner-copy">
                  {data.mode === "demo" ? (
                    <Box size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                  <strong>
                    {data.mode === "demo"
                      ? "Demo workspace"
                      : "Your local workspace"}
                  </strong>
                  <span>
                    {data.mode === "demo"
                      ? "Synthetic listings and sales. A look at the workflow, not real deals."
                      : "Analysis stays on this machine. Live searches are sent to SerpApi."}
                  </span>
                </div>
                <button
                  className="text-button"
                  disabled={locked}
                  onClick={
                    data.mode === "demo"
                      ? () =>
                          void mutate(
                            "mode",
                            { mode: "local" },
                            "Opened your own workspace.",
                          ).catch(() => {})
                      : demo
                  }
                >
                  {data.mode === "demo"
                    ? "Switch to my workspace"
                    : "Explore synthetic demo"}
                  <ArrowRight size={14} />
                </button>
              </div>
              <section className="watchlist-card" aria-label="Active watchlist">
                <div className="watchlist-main">
                  <span className="watchlist-icon">
                    <Radar size={23} />
                  </span>
                  <div>
                    <span className="eyebrow">YOUR ACTIVE WATCHLIST</span>
                    <h2>
                      {data.settings.query}
                      <span>Gen 1–3</span>
                    </h2>
                    <p>
                      <span className="country-marker">AU</span>eBay Australia
                      <span className="bullet">·</span>Fixed price
                      <span className="bullet">·</span>Domestic
                    </p>
                  </div>
                </div>
                <div className="watchlist-numbers">
                  <div>
                    <span>Buy under</span>
                    <strong>{aud(data.settings.max_price)}</strong>
                  </div>
                  <div>
                    <span>Target margin</span>
                    <strong className="green-text">
                      {aud(data.settings.min_margin)}
                      <span>+</span>
                    </strong>
                  </div>
                  <button
                    className="button quiet"
                    disabled={locked}
                    onClick={() => setPanel("settings")}
                  >
                    <SlidersHorizontal size={15} />
                    <span>Edit watchlist</span>
                  </button>
                </div>
                <div className="watchlist-decoration" aria-hidden="true">
                  <Radar size={125} strokeWidth={0.5} />
                </div>
              </section>
              {data.job &&
                (data.mode === "local" || data.job.kind === "analyse") && (
                  <JobBanner job={data.job} />
                )}
              <section className="stats-grid" aria-label="Workspace summary">
                <Stat
                  icon={Monitor}
                  label="Listings screened"
                  value={data.counts.scanned}
                  note="In this workspace"
                />
                <Stat
                  icon={ArrowUpRight}
                  label="Worth a closer look"
                  value={data.counts.opportunities}
                  note={
                    data.mode === "demo"
                      ? "Synthetic examples only"
                      : "Conservative margin meets target"
                  }
                  accent
                />
                <Stat
                  icon={FileCheck2}
                  label="Needs your review"
                  value={data.counts.review}
                  note="Details or shipping to confirm"
                />
                <Stat
                  icon={ShieldCheck}
                  label="Noise filtered out"
                  value={data.counts.excluded}
                  note="Faulty, accessories & out of scope"
                />
              </section>
              <section className="feed-panel">
                <div className="feed-heading">
                  <div>
                    <h2>
                      {copy.table}
                      <span>
                        {view === "sales"
                          ? data.comparisons.length
                          : view === "activity"
                            ? data.scans.length
                            : items.length}
                      </span>
                    </h2>
                    <p>{copy.note}</p>
                  </div>
                  <div className="feed-heading-actions">
                    <button
                      className="text-button subdued"
                      aria-label="Export workspace"
                      onClick={() => void exportWorkspace()}
                    >
                      <ArrowDownToLine size={15} />
                      <span>Export</span>
                    </button>
                    {(view === "scout" || view === "saved") && (
                      <div
                        className="layout-toggle"
                        role="group"
                        aria-label="Listing layout"
                      >
                        <button
                          className={layout === "table" ? "selected" : ""}
                          onClick={() => setLayout("table")}
                          aria-label="Table view"
                          aria-pressed={layout === "table"}
                        >
                          <ListFilter size={16} />
                        </button>
                        <button
                          className={layout === "grid" ? "selected" : ""}
                          onClick={() => setLayout("grid")}
                          aria-label="Card view"
                          aria-pressed={layout === "grid"}
                        >
                          <LayoutGrid size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {(view === "scout" || view === "saved") && (
                  <div className="feed-toolbar">
                    <div
                      className="filter-tabs"
                      role="group"
                      aria-label="Filter listings"
                    >
                      {(
                        [
                          ["all", "All listings"],
                          ["opportunities", "Opportunities"],
                          ["review", "Needs review"],
                          ["excluded", "Excluded"],
                        ] as [Filter, string][]
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setFilter(key)}
                          className={filter === key ? "selected" : ""}
                          aria-pressed={filter === key}
                        >
                          {label}
                          {key === "opportunities" && (
                            <span>{data.counts.opportunities}</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="feed-controls">
                      <label className="search-field">
                        <Search size={15} />
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search listings…"
                          aria-label="Search listings"
                        />
                      </label>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        aria-label="Sort listings"
                      >
                        <option value="margin">Highest margin</option>
                        <option value="price">Lowest price</option>
                        <option value="recent">Newest first</option>
                      </select>
                    </div>
                  </div>
                )}
                {view === "sales" ? (
                  <Sales
                    data={data}
                    onImport={() => setPanel("import-sales")}
                  />
                ) : view === "activity" ? (
                  <ScanHistory
                    scans={data.scans}
                    onImport={() => setPanel("import")}
                  />
                ) : items.length ? (
                  layout === "table" ? (
                    <div className="table-scroll">
                      <table className="deal-table">
                        <thead>
                          <tr>
                            <th>LAPTOP & SPECIFICATIONS</th>
                            <th>ASKING PRICE</th>
                            <th>RESALE ESTIMATE</th>
                            <th>
                              EST. MARGIN
                              <ArrowDown size={11} />
                            </th>
                            <th>ASSESSMENT</th>
                            <th>
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <DealRow
                              key={item.id}
                              item={item}
                              pending={!!pending}
                              onOpen={() => setSelected(item.id)}
                              onSave={() => save(item)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="deal-grid">
                      {items.map((item) => (
                        <DealCard
                          key={item.id}
                          item={item}
                          pending={!!pending}
                          onOpen={() => setSelected(item.id)}
                          onSave={() => save(item)}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <Empty
                    view={view}
                    fresh={!data.listings.length}
                    onDemo={demo}
                    onImport={() => setPanel("import")}
                    onReset={() => {
                      navigate("scout");
                      setFilter("all");
                      setQuery("");
                    }}
                  />
                )}
                <div className="feed-footer">
                  <span>
                    <ShieldCheck size={14} />
                    {data.mode === "demo"
                      ? "Synthetic examples. No actual transactions or profits."
                      : "Evidence-backed estimates. Always inspect before buying."}
                  </span>
                  <span>
                    <i />
                    AUD<span className="bullet">·</span>Local workspace
                  </span>
                </div>
              </section>
              <div className="bottom-note">
                <span>
                  <span className="little-brand">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  Less guesswork. More good decisions.
                </span>
                <span>
                  Pre-tax estimates. Labour included only if configured.
                  <button onClick={() => setPanel("help")}>
                    How it works
                    <ArrowUpRight size={12} />
                  </button>
                </span>
              </div>
            </>
          )}
        </main>
      </div>
      {panel && (
        <Modal
          title={
            panel === "settings"
              ? "Make the numbers yours."
              : panel === "help"
                ? "A clearer buying decision."
                : "Bring your own evidence."
          }
          eyebrow={
            panel === "settings"
              ? "WATCHLIST & COSTS"
              : panel === "help"
                ? "HOW FLIPCHECK WORKS"
                : "LOCAL DATA IMPORT"
          }
          onClose={() => setPanel(null)}
        >
          {panel === "settings" && data ? (
            <SettingsForm
              settings={data.settings}
              mutate={mutate}
              pending={!!pending}
              onClose={() => setPanel(null)}
            />
          ) : panel === "help" ? (
            <Help data={data} />
          ) : (
            <ImportForm
              initialKind={
                panel === "import-sales" ? "comparisons" : "listings"
              }
              mutate={mutate}
              pending={!!pending}
              onComplete={(kind) => {
                setPanel(null);
                navigate(kind === "listings" ? "scout" : "sales");
              }}
            />
          )}
        </Modal>
      )}
      {selectedItem && (
        <Modal
          title="Listing evidence"
          eyebrow="A CLOSER LOOK"
          drawer
          onClose={() => setSelected(null)}
        >
          <Evidence
            item={selectedItem}
            mutate={mutate}
            pending={!!pending || !!running}
            onClose={() => setSelected(null)}
            onCorrect={() => {
              setSelected(null);
              setCorrection(selectedItem.id);
            }}
          />
        </Modal>
      )}
      {correctionItem && (
        <Modal
          title="Record what you confirmed."
          eyebrow="HUMAN REVIEW"
          onClose={() => setCorrection(null)}
        >
          <CorrectionForm
            item={correctionItem}
            mutate={mutate}
            pending={!!pending}
            onComplete={() => {
              setCorrection(null);
              setSelected(correctionItem.id);
            }}
          />
        </Modal>
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={`stat-card ${accent ? "accent" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <strong className="stat-number">
        {value.toString().padStart(2, "0")}
      </strong>
      <div className="stat-note">
        {accent && <span className="stat-dot" />}
        {note}
      </div>
      {accent && (
        <span className="stat-flourish" aria-hidden="true">
          <ArrowUpRight size={75} strokeWidth={0.8} />
        </span>
      )}
    </article>
  );
}
function DealRow({
  item: x,
  pending,
  onOpen,
  onSave,
}: {
  item: Listing;
  pending: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const f = x.extraction.facts,
    v = x.valuation,
    s = scenario(x);
  const a = assessment(x);
  return (
    <tr className={x.decision === "dismissed" ? "dismissed" : ""}>
      <td>
        <div className="listing-product">
          <LaptopArt
            variant={
              x.extraction.classification === "accessory"
                ? "accessory"
                : x.extraction.classification === "parts_or_faulty"
                  ? "faulty"
                  : "normal"
            }
          />
          <div className="listing-text">
            <button className="listing-name" onClick={onOpen} title={x.title}>
              {f.model
                ? `${f.model}${f.generation ? ` · Gen ${f.generation}` : ""}`
                : x.title}
            </button>
            <p>{specLine(x)}</p>
            <span className="listing-source">
              <span className="source-dot" />
              {x.synthetic
                ? "Synthetic example"
                : `eBay AU · ${relative(x.last_seen)}`}
            </span>
          </div>
        </div>
      </td>
      <td>
        <strong className="table-amount">{aud(x.asking_price)}</strong>
        <span
          className={`cell-note ${x.inbound_shipping == null ? "warning-text" : ""}`}
        >
          {x.inbound_shipping == null
            ? "Shipping unknown"
            : x.inbound_shipping === 0
              ? "Free postage"
              : `+ ${aud(x.inbound_shipping)} postage`}
        </span>
      </td>
      <td>
        {v.range?.low != null ? (
          <>
            <strong className="table-amount resale">
              {aud(v.range.low)}
              <span>–</span>
              {aud(v.range.high)}
            </strong>
            <span className="cell-note">
              {v.count} {x.synthetic ? "synthetic" : "verified"} sales
            </span>
          </>
        ) : v.range?.assumed != null ? (
          <>
            <strong className="table-amount">{aud(v.range.assumed)}</strong>
            <span className="cell-note">Your resale assumption</span>
          </>
        ) : (
          <>
            <span className="unavailable">—</span>
            <span className="cell-note">{v.count}/5 sales required</span>
          </>
        )}
      </td>
      <td>
        {s ? (
          <>
            <strong
              className={`margin-amount ${s.margin < 0 ? "negative" : ""}`}
            >
              {margin(s.margin)}
            </strong>
            <span className="cell-note">
              {s.roi == null
                ? "ROI unavailable"
                : `${s.roi.toFixed(1)}% est. ROI`}
            </span>
          </>
        ) : (
          <>
            <span className="unavailable">—</span>
            <span className="cell-note">Not estimated</span>
          </>
        )}
      </td>
      <td>
        <Badge item={x} />
        <span className="assessment-note">{a.short}</span>
      </td>
      <td>
        <div className="row-actions">
          <button
            className={`icon-button save-action ${x.decision === "saved" ? "is-saved" : ""}`}
            aria-label={`${x.decision === "saved" ? "Unsave" : "Save"} ${f.model || x.title}`}
            aria-pressed={x.decision === "saved"}
            onClick={onSave}
            disabled={pending}
          >
            <Bookmark
              size={17}
              fill={x.decision === "saved" ? "currentColor" : "none"}
            />
          </button>
          <button
            className="icon-button open-action"
            onClick={onOpen}
            aria-label={`Inspect evidence for ${f.model || x.title}`}
          >
            <ArrowUpRight size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}
function DealCard({
  item: x,
  pending,
  onOpen,
  onSave,
}: {
  item: Listing;
  pending: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const f = x.extraction.facts,
    s = scenario(x);
  return (
    <article
      className={`deal-card ${x.decision === "dismissed" ? "dismissed" : ""}`}
    >
      <div className="deal-card-art">
        <span className="deal-card-source">
          {x.synthetic ? "SYNTHETIC EXAMPLE" : "EBAY AUSTRALIA"}
        </span>
        <button
          className={`icon-button ${x.decision === "saved" ? "is-saved" : ""}`}
          onClick={onSave}
          disabled={pending}
          aria-label={`${x.decision === "saved" ? "Unsave" : "Save"} ${f.model || x.title}`}
        >
          <Bookmark
            size={18}
            fill={x.decision === "saved" ? "currentColor" : "none"}
          />
        </button>
        <LaptopArt
          large
          variant={
            x.extraction.classification === "accessory"
              ? "accessory"
              : x.extraction.classification === "parts_or_faulty"
                ? "faulty"
                : "normal"
          }
        />
      </div>
      <div className="deal-card-body">
        <Badge item={x} />
        <button className="listing-name" onClick={onOpen}>
          {f.model
            ? `${f.model}${f.generation ? ` · Gen ${f.generation}` : ""}`
            : x.title}
        </button>
        <p>{specLine(x)}</p>
        <div className="deal-card-numbers">
          <div>
            <span>Asking price</span>
            <strong>{aud(x.asking_price)}</strong>
          </div>
          <div>
            <span>Est. margin</span>
            <strong className={s && s.margin >= 0 ? "green-text" : ""}>
              {s ? margin(s.margin) : "—"}
            </strong>
          </div>
        </div>
        <button className="card-open" onClick={onOpen}>
          Inspect the evidence
          <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}
function Empty({
  view,
  fresh,
  onDemo,
  onImport,
  onReset,
}: {
  view: View;
  fresh: boolean;
  onDemo: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-art">
        <LaptopArt large />
        <span className="empty-floating">
          <Search size={24} />
        </span>
      </div>
      <span className="eyebrow">
        {fresh && view === "scout"
          ? "YOUR NEXT FIND STARTS HERE"
          : "A LITTLE ROOM FOR GOOD FINDS"}
      </span>
      <h3>
        {fresh && view === "scout"
          ? "Let’s find something worth a look."
          : view === "saved"
            ? "Keep the promising ones close."
            : "Nothing matches this view yet."}
      </h3>
      <p>
        {fresh && view === "scout"
          ? "Import a few listings or try a live search. Gemma reads the details, filters the noise, and keeps the evidence beside every estimate."
          : view === "saved"
            ? "Bookmark a promising listing from the deal feed. Its specs, costs, and comparison sales will be here when you return."
            : "Try a different filter or clear your search to see more of your shortlist."}
      </p>
      <div>
        {fresh && view === "scout" ? (
          <>
            <button className="button primary" onClick={onDemo}>
              Explore synthetic demo
              <ArrowRight size={16} />
            </button>
            <button className="button secondary" onClick={onImport}>
              Import my listings
              <FileUp size={15} />
            </button>
          </>
        ) : (
          <button className="button secondary" onClick={onReset}>
            {view === "saved" ? "Back to deal scout" : "Clear filters"}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      <span className="empty-footnote">
        <ShieldCheck size={14} />
        Local analysis. No automatic messages or purchases.
      </span>
    </div>
  );
}
function Sales({ data, onImport }: { data: Workspace; onImport: () => void }) {
  if (!data.comparisons.length)
    return (
      <div className="library-empty">
        <span className="empty-icon">
          <Database size={28} />
        </span>
        <h3>Good estimates start with real sales.</h3>
        <p>
          Build your reference library with completed transactions. Exact
          specifications and traceable sources make your estimates more useful.
        </p>
        <button className="button primary" onClick={onImport}>
          Import sold comparisons
          <FileUp size={16} />
        </button>
        <span className="micro-copy">
          Asking prices are never treated as completed sales.
        </span>
      </div>
    );
  return (
    <>
      <div className="table-scroll">
        <table className="sales-table">
          <thead>
            <tr>
              <th>LAPTOP CONFIGURATION</th>
              <th>SOLD PRICE</th>
              <th>SOLD DATE</th>
              <th>CONDITION</th>
              <th>SOURCE REFERENCE</th>
            </tr>
          </thead>
          <tbody>
            {data.comparisons.map((c) => (
              <tr key={`${c.source}-${c.external_id}`}>
                <td>
                  <strong>
                    {c.model} · Gen {c.generation}
                  </strong>
                  <span className="cell-note">
                    {c.cpu} · {c.ram_gb}GB RAM · {c.storage_gb}GB SSD
                  </span>
                </td>
                <td>
                  <strong className="table-amount">{aud(c.sold_price)}</strong>
                  <span className="cell-note">
                    + {aud(c.shipping)} shipping
                  </span>
                </td>
                <td>
                  {c.sold_at}
                  <span className="cell-note">Collected {c.collected_at}</span>
                </td>
                <td>
                  <span className="condition-pill">{c.condition}</span>
                </td>
                <td>
                  <span className="source-ref">{c.reference}</span>
                  <span className="cell-note">{c.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="library-action">
        <p>
          {data.mode === "demo"
            ? "These are simulated sales, isolated from your real workspace."
            : "Sales verification is asserted by you, not independently audited."}
        </p>
        <button className="text-button" onClick={onImport}>
          Import sales
          <ArrowUpRight size={15} />
        </button>
      </div>
    </>
  );
}
function JobBanner({ job }: { job: Job }) {
  const running = job.status === "running";
  return (
    <div
      className={`job-banner ${job.status === "failed" ? "failed" : ""}`}
      role="status"
    >
      <div className="job-main">
        {running ? (
          <LoaderCircle size={20} className="spin" />
        ) : job.status === "failed" ? (
          <CircleHelp size={20} />
        ) : (
          <Check size={20} />
        )}
        <div>
          <strong>{job.message}</strong>
          <span>
            {job.kind === "live"
              ? "eBay AU → local Gemma 4"
              : "Local Gemma 4 analysis"}{" "}
            ·{" "}
            {running
              ? "In progress"
              : `${job.elapsed_seconds}s · ${relative(job.finished_at)}`}
          </span>
        </div>
        {running && (
          <span className="job-count">
            {job.processed}/{job.total || "…"}
          </span>
        )}
      </div>
      {running && (
        <progress
          max={job.total || undefined}
          value={job.total ? job.processed : undefined}
          aria-label="Scan progress"
        />
      )}
      {job.errors.length + job.skipped.length > 0 && (
        <details>
          <summary>
            View {job.errors.length + job.skipped.length} errors / skipped
            results
          </summary>
          <ul>
            {job.errors.map((e, i) => (
              <li key={`e${i}`}>{e}</li>
            ))}
            {job.skipped.map((s, i) => (
              <li key={`s${i}`}>
                {s.title} — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
function ScanHistory({
  scans,
  onImport,
}: {
  scans: Job[];
  onImport: () => void;
}) {
  if (!scans.length)
    return (
      <div className="library-empty">
        <span className="empty-icon">
          <Activity size={28} />
        </span>
        <h3>A clear record of every scan.</h3>
        <p>
          Your imports and live scans appear here, including partial results and
          errors. Demo replay doesn’t count as live analysis.
        </p>
        <button className="button secondary" onClick={onImport}>
          Import listings
          <FileUp size={15} />
        </button>
      </div>
    );
  return (
    <div className="scan-history">
      {scans.map((job, i) => (
        <article key={i}>
          <span
            className={`history-icon ${job.status === "failed" ? "failed" : ""}`}
          >
            {job.kind === "live" ? (
              <Radar size={21} />
            ) : (
              <FileCheck2 size={21} />
            )}
          </span>
          <div>
            <h3>
              {job.kind === "live"
                ? "eBay Australia scan"
                : job.kind === "analyse"
                  ? "Local re-analysis"
                  : "Listing import"}
              <span
                className={`badge ${job.status === "failed" ? "red" : job.status === "partial" ? "amber" : "green"}`}
              >
                {job.status}
              </span>
            </h3>
            <p>{job.message}</p>
            <span className="history-meta">
              <Clock3 size={13} />
              {relative(job.finished_at)}
              <span>·</span>
              {job.elapsed_seconds}s<span>·</span>
              {job.processed} analysed<span>·</span>
              {job.requests} search requests
            </span>
            {job.errors.length + job.skipped.length > 0 && (
              <details>
                <summary>View errors and skipped results</summary>
                <ul>
                  {job.errors.map((e, j) => (
                    <li key={j}>{e}</li>
                  ))}
                  {job.skipped.map((s, j) => (
                    <li key={`s${j}`}>
                      {s.title} — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading-workspace" role="status">
      <LoaderCircle className="spin" size={26} />
      <h2>Opening your sourcing desk</h2>
      <p>Connecting to your local analysis service…</p>
    </div>
  );
}
