"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  FileJson,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import type {
  Listing,
  Mutation,
  Settings,
  Workspace,
  Watchlist,
  Category,
} from "@/lib/types";
import SearchLocationFields from "./search-location";
import type { SearchLocation, MarketplaceSource } from "@/lib/types";
import { parseImport } from "@/lib/import";
import { download } from "@/lib/format";

function Field({
  label,
  name,
  value,
  type = "number",
  optional = false,
  help,
  wide = false,
  step = ".01",
}: {
  label: string;
  name: string;
  value?: string | number | null;
  type?: string;
  optional?: boolean;
  help?: string;
  wide?: boolean;
  step?: string;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <input
        name={name}
        aria-label={label}
        type={type}
        defaultValue={value ?? ""}
        required={!optional}
        {...(type === "number" ? { min: 0, step } : { maxLength: 150 })}
      />
      {help && <small>{help}</small>}
    </label>
  );
}
function FormError({ error }: { error: string }) {
  return error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null;
}
function FormFooter({ children, note }: { children: ReactNode; note: string }) {
  return (
    <div className="form-footer">
      <small>
        <ShieldCheck size={15} />
        {note}
      </small>
      {children}
    </div>
  );
}

export function SettingsForm({
  settings: s,
  mutate,
  pending,
  onClose,
  watchlist,
  csrfToken,
  facebookConfigured,
}: {
  csrfToken: string;
  facebookConfigured: boolean;
  watchlist?: Watchlist;
  settings: Settings;
  mutate: Mutation;
  pending: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [sources, setSources] = useState<MarketplaceSource[]>(
    watchlist?.sources || ["ebay"],
  );
  const [location, setLocation] = useState<SearchLocation | null>(
    watchlist?.location || null,
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const values = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [
        k,
        ["query", "fee_base", "name", "category"].includes(k)
          ? v
          : v === ""
            ? null
            : Number(v),
      ]),
    );
    try {
      await mutate(
        "watchlists/save",
        {
          ...values,
          sources,
          location,
          id: watchlist?.id,
          enabled: form.enabled === "on",
          name: String(form.name || form.query),
        },
        "Your settings are saved. Margins have been recalculated.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="form-intro">
        Make the shortlist work for your business. Every estimate uses these
        assumptions; defaults are examples, not current eBay fees.
      </p>
      <fieldset disabled={pending}>
        <h3 className="form-section">
          01 <span>Your watchlist</span>
        </h3>
        <div className="form-grid">
          <Field
            label="Display name (optional)"
            name="name"
            value={watchlist?.name || ""}
            type="text"
            optional
            wide
          />
          <label className="field wide">
            <span>Product category</span>
            <select
              aria-label="Product category"
              name="category"
              defaultValue={watchlist?.category || "other"}
            >
              {[
                "laptop",
                "camera",
                "phone",
                "tablet",
                "console",
                "gpu",
                "other",
              ].map((c) => (
                <option key={c} value={c}>
                  {c === "other"
                    ? "Other tech"
                    : c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Search query"
            name="query"
            value={s.query}
            type="text"
            wide
          />
          <Field
            label="Maximum asking price (AUD)"
            name="max_price"
            value={s.max_price}
          />
          <Field
            label="Minimum margin (AUD)"
            name="min_margin"
            value={s.min_margin}
          />
        </div>
        <SearchLocationFields
          sources={sources}
          setSources={setSources}
          location={location}
          setLocation={setLocation}
          csrfToken={csrfToken}
          facebookConfigured={facebookConfigured}
        />
        {sources.includes("facebook") && (
          <div className="form-grid nearby-costs">
            <Field
              label="Pickup radius (km)"
              name="radius_km"
              value={watchlist?.radius_km ?? 25}
              step="1"
              help="1–500 km from your selected center."
            />
            <Field
              label="Pickup / travel allowance (AUD)"
              name="pickup_cost"
              value={watchlist?.pickup_cost}
              optional
              help="Leave unknown to require review. Enter 0 only when collection has no cost."
            />
          </div>
        )}
        <h3 className="form-section">
          02 <span>Fees & fulfilment</span>
        </h3>
        <div className="form-grid">
          <Field label="Selling fee (%)" name="fee_rate" value={s.fee_rate} />
          <Field label="Fixed fee (AUD)" name="fixed_fee" value={s.fixed_fee} />
          <label className="field wide">
            <span>Percentage fee applies to</span>
            <select name="fee_base" defaultValue={s.fee_base}>
              <option value="receipts">Item price + buyer-paid shipping</option>
              <option value="item">Item price only</option>
            </select>
          </label>
          <Field label="Packaging (AUD)" name="packaging" value={s.packaging} />
          <Field
            label="Repairs per product (AUD)"
            name="repairs"
            value={s.repairs}
          />
          <Field
            label="Outbound postage (AUD)"
            name="outbound_shipping"
            value={s.outbound_shipping}
          />
          <Field
            label="Postage charged to buyer (AUD)"
            name="resale_shipping"
            value={s.resale_shipping}
          />
          <Field
            label="Risk allowance (AUD)"
            name="risk_allowance"
            value={s.risk_allowance}
          />
          <Field label="Owner labour (AUD)" name="labour" value={s.labour} />
        </div>
        <h3 className="form-section">
          03 <span>Resale evidence</span>
        </h3>
        <div className="form-grid">
          <Field
            label="Comparison window (days)"
            name="recency_days"
            value={s.recency_days}
            step="1"
          />
          <Field
            label="Your resale assumption (AUD)"
            name="assumed_resale"
            value={s.assumed_resale}
            optional
            help="Optional fallback for insufficient sales data. It never earns an evidence-backed opportunity badge."
          />
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={watchlist?.enabled ?? true}
          />
          Include in Scan all
        </label>
        <FormError error={error} />
        {watchlist && (
          <button
            type="button"
            className="text-button archive-search"
            onClick={async () => {
              try {
                await mutate("watchlists/archive", { id: watchlist.id });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Archive search
          </button>
        )}
        <FormFooter note="Each search has its own costs and budget. AUD.">
          <button className="button primary" type="submit">
            {pending ? "Saving…" : "Save search"}
            <Check size={16} />
          </button>
        </FormFooter>
      </fieldset>
    </form>
  );
}

export function ImportForm({
  initialKind = "listings",
  mutate,
  pending,
  onComplete,
  watchlists,
  selectedWatchlist,
}: {
  watchlists: Watchlist[];
  selectedWatchlist?: number;
  initialKind?: "listings" | "comparisons";
  mutate: Mutation;
  pending: boolean;
  onComplete: (kind: "listings" | "comparisons") => void;
}) {
  const [kind, setKind] = useState(initialKind),
    [text, setText] = useState(""),
    [error, setError] = useState("");
  const [searchId, setSearchId] = useState(
    String(selectedWatchlist || watchlists.find((w) => w.enabled)?.id || ""),
  );
  let preview = "Choose a file or paste data below.";
  if (text.trim()) {
    try {
      preview = `${parseImport(text, kind).length} records ready to validate`;
    } catch {
      preview = "Check the data format before importing.";
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const rows = parseImport(text, kind);
      await mutate(`import/${kind}`, {
        [kind]: rows,
        ...(kind === "listings" ? { watchlist_ids: [Number(searchId)] } : {}),
      });
      onComplete(kind);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function template() {
    try {
      const r = await fetch(`/api/templates/${kind}`);
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      download(data, `flipcheck-${kind}-template.json`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="form-intro">
        Your source data, your machine. Listings are read by local Gemma 4. Sold
        comparisons need actual transaction prices and traceable references.
      </p>
      <fieldset disabled={pending}>
        <div className="segmented import-segments">
          <button
            type="button"
            className={kind === "listings" ? "selected" : ""}
            onClick={() => {
              setKind("listings");
              setText("");
              setError("");
            }}
          >
            Marketplace listings
          </button>
          <button
            type="button"
            className={kind === "comparisons" ? "selected" : ""}
            onClick={() => {
              setKind("comparisons");
              setText("");
              setError("");
            }}
          >
            Sold comparisons
          </button>
        </div>
        {kind === "listings" && (
          <label className="field import-search">
            <span>Associate listings with search</span>
            <select
              aria-label="Associate listings with search"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose an enabled search
              </option>
              {watchlists
                .filter((w) => w.enabled)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="upload-zone">
          <span className="upload-icon">
            <UploadCloud size={25} />
          </span>
          <strong>Bring your source data</strong>
          <span>
            JSON or CSV · up to{" "}
            {kind === "listings" ? "50 listings" : "1,000 sales"} · max 2 MB
          </span>
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            aria-label="Choose import file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2_000_000) {
                setError("File must be smaller than 2 MB.");
                return;
              }
              setText(await file.text());
              setError("");
            }}
          />
        </label>
        <label className="field paste-field">
          <span>Or paste JSON / CSV</span>
          <textarea
            className="code-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={
              kind === "listings"
                ? '{ "listings": [ … ] }'
                : '{ "comparisons": [ … ] }'
            }
          />
        </label>
        <div className="import-preview">
          <span>
            <FileJson size={14} />
            {preview}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => void template()}
          >
            <ArrowDownToLine size={14} />
            Download template
          </button>
        </div>
        <FormError error={error} />
        <FormFooter
          note={
            kind === "listings"
              ? "Use original seller text. Unknown stays unknown."
              : "Use genuine sales. Verification is asserted by you."
          }
        >
          <button className="button primary" type="submit">
            {pending
              ? "Importing…"
              : kind === "listings"
                ? "Import & analyse"
                : "Import sales"}
            <ArrowUpRight size={16} />
          </button>
        </FormFooter>
      </fieldset>
    </form>
  );
}

export function CorrectionForm({
  item,
  mutate,
  pending,
  onComplete,
}: {
  item: Listing;
  mutate: Mutation;
  pending: boolean;
  onComplete: () => void;
}) {
  const [error, setError] = useState("");
  const [category, setCategory] = useState<Category>(
    item.extraction.category || "other",
  );
  const f = item.extraction.facts;
  const profile: Record<Category, string[]> = {
    laptop: ["generation", "variant", "cpu", "ram_gb", "storage_gb", "gpu"],
    camera: ["bundle", "lens"],
    phone: ["storage_gb", "lock_status"],
    tablet: ["storage_gb", "lock_status"],
    console: ["edition", "bundle", "storage_gb"],
    gpu: ["vram_gb", "variant"],
    other: ["variant"],
  };
  const fields = ["brand", "model", "condition", ...profile[category]];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const values = Object.fromEntries(
      fields.map((key) => [
        key,
        form[key] === ""
          ? null
          : ["ram_gb", "storage_gb", "vram_gb"].includes(key)
            ? Number(form[key])
            : String(form[key]),
      ]),
    );
    const parts = Object.entries(values)
      .filter(([, v]) => v !== null)
      .map(
        ([k, v]) =>
          `${k}: ${v}${k === "ram_gb" ? "GB RAM" : k === "storage_gb" ? "GB SSD" : k === "vram_gb" ? "GB VRAM" : ""}`,
      );
    const note = `User confirmed: ${parts.join("; ")}. ${form.note}`;
    const extraction = {
      category,
      classification: form.classification,
      reason: "Human confirmed details; see correction note.",
      ...Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          { value, evidence: value === null ? null : note },
        ]),
      ),
    };
    try {
      await mutate("correct", {
        id: item.id,
        note,
        extraction,
        ...(item.marketplace === "facebook"
          ? {}
          : {
              inbound_shipping:
                form.inbound_shipping === ""
                  ? null
                  : Number(form.inbound_shipping),
            }),
      });
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="form-intro">
        Record only details you verified. Blank fields stay unknown and can
        prevent a resale estimate. Original faults still require review.
      </p>
      <fieldset disabled={pending}>
        <div className="form-grid">
          <label className="field">
            <span>Product category</span>
            <select
              aria-label="Product category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {Object.keys(profile).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Classification</span>
            <select
              name="classification"
              defaultValue={
                item.extraction.classification === "complete_product"
                  ? "complete_product"
                  : "uncertain"
              }
            >
              {[
                "complete_product",
                "accessory",
                "parts_or_faulty",
                "unrelated",
                "uncertain",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {fields.map((key) =>
            key === "condition" ? (
              <label className="field" key={key}>
                <span>Condition</span>
                <select name={key} defaultValue={f.condition ?? ""}>
                  <option value="">Unknown</option>
                  <option>good</option>
                  <option>fair</option>
                  <option>excellent</option>
                </select>
              </label>
            ) : key === "bundle" ? (
              <label className="field" key={key}>
                <span>Bundle configuration</span>
                <select name={key} defaultValue={f.bundle ?? ""}>
                  <option value="">Unknown</option>
                  {[
                    "body_only",
                    "kit",
                    "console_only",
                    "standard",
                    "bundle",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ) : (
              <Field
                key={key}
                label={key.replaceAll("_", " ")}
                name={key}
                value={f[key as keyof typeof f]}
                type={
                  ["ram_gb", "storage_gb", "vram_gb"].includes(key)
                    ? "number"
                    : "text"
                }
                optional
                step="1"
              />
            ),
          )}
          {item.marketplace !== "facebook" && (
            <Field
              label="Inbound shipping (AUD)"
              name="inbound_shipping"
              value={item.inbound_shipping}
              optional
            />
          )}
          <label className="field wide">
            <span>How did you confirm these details?</span>
            <textarea
              name="note"
              required
              minLength={5}
              maxLength={1200}
              rows={3}
            />
          </label>
        </div>
        <FormError error={error} />
        <FormFooter note="Human-confirmed evidence, saved locally.">
          <button className="button primary" type="submit">
            {pending ? "Saving…" : "Save correction"}
            <Check size={16} />
          </button>
        </FormFooter>
      </fieldset>
    </form>
  );
}

export function Help({ data }: { data: Workspace | null }) {
  return (
    <div className="help-content">
      <div className="help-highlight">
        <ShieldCheck size={26} />
        <h3>Evidence before estimates.</h3>
        <p>
          A useful shortlist gives you reasons to investigate, not a promise of
          profit.
        </p>
      </div>
      <h3>Local AI, across your product searches</h3>
      <p>
        Gemma 4 reads text for laptops, cameras, phones, tablets, consoles and
        GPUs. It copies supporting excerpts and leaves unsupported facts
        unknown. Model output never certifies physical condition.
      </p>
      <h3>Comparable sales, explicit costs</h3>
      <p>
        At least five recent exact-configuration sales are required for a
        comparison estimate. The lower quartile drives the conservative margin.
        Fees, shipping, repairs, packaging, risk, and labour are editable.
        Defaults are illustrative, not current platform rates.
      </p>
      <h3>No sales data? Show the assumption.</h3>
      <p>
        You can supply your own resale assumption in settings. It is labelled
        and cannot earn an evidence-backed opportunity badge. Import completed
        sales to build your evidence library.
      </p>
      <h3>What stays local</h3>
      <p>
        Extraction, imports, margins, and decisions stay on your machine by
        default. Live discovery sends your search query to SerpApi and needs
        internet. No cloud inference fallback or telemetry is included.
      </p>
      <h3>Multiple searches, real results</h3>
      <p>
        Add up to ten product searches, each with its own budget and costs. Scan
        all enabled searches together. No listings or sold prices are preloaded;
        provider failures never substitute fabricated results.
      </p>
      <div className="connection-summary">
        <span>
          Model <strong>{data?.health.model || "Checking…"}</strong>
        </span>
        <span>
          Live search{" "}
          <strong>
            {data?.health.serpapi_configured ? "Configured" : "Key required"}
          </strong>
        </span>
      </div>
    </div>
  );
}
