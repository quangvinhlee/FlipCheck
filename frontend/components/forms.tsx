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
import type { Listing, Mutation, Settings, Workspace } from "@/lib/types";
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
}: {
  settings: Settings;
  mutate: Mutation;
  pending: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const values = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [
        k,
        ["query", "fee_base"].includes(k) ? v : v === "" ? null : Number(v),
      ]),
    );
    try {
      await mutate(
        "settings",
        values,
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
            label="Repairs per laptop (AUD)"
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
        <FormError error={error} />
        <FormFooter note="Saved on this machine. All amounts in AUD.">
          <button className="button primary" type="submit">
            {pending ? "Saving…" : "Save & recalculate"}
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
}: {
  initialKind?: "listings" | "comparisons";
  mutate: Mutation;
  pending: boolean;
  onComplete: (kind: "listings" | "comparisons") => void;
}) {
  const [kind, setKind] = useState(initialKind),
    [text, setText] = useState(""),
    [error, setError] = useState("");
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
      await mutate(`import/${kind}`, { [kind]: rows });
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
  const f = item.extraction.facts;
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const facts = {
      model: "ThinkPad T14",
      generation: Number(form.generation),
      variant: form.variant,
      cpu: form.cpu,
      ram_gb: Number(form.ram_gb),
      storage_gb: Number(form.storage_gb),
      condition: form.condition,
    };
    const note = `User confirmed: ThinkPad T14; Gen ${facts.generation}; ${facts.variant}; ${facts.cpu}; ${facts.ram_gb}GB RAM; ${facts.storage_gb}GB SSD; ${facts.condition} condition. ${form.note}`;
    const extraction = {
      classification: "complete_laptop",
      reason: "Human confirmed details; see correction note.",
      ...Object.fromEntries(
        Object.entries(facts).map(([key, value]) => [
          key,
          { value, evidence: note },
        ]),
      ),
    };
    try {
      await mutate("correct", {
        id: item.id,
        note,
        extraction,
        inbound_shipping:
          form.inbound_shipping === "" ? null : Number(form.inbound_shipping),
      });
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="form-intro">
        Record details you checked with the seller or original listing. Your
        confirmation is labelled as human evidence; original faults and
        conflicting specifications still require review.
      </p>
      <fieldset disabled={pending}>
        <div className="form-grid">
          <Field
            label="Generation (1–3)"
            name="generation"
            value={f.generation}
            step="1"
          />
          <label className="field">
            <span>Processor platform</span>
            <select name="variant" defaultValue={f.variant ?? ""} required>
              <option value="" disabled>
                Select platform
              </option>
              <option>Intel</option>
              <option>AMD</option>
            </select>
          </label>
          <Field
            label="Exact CPU identifier"
            name="cpu"
            value={f.cpu}
            type="text"
            wide
          />
          <Field label="Memory (GB)" name="ram_gb" value={f.ram_gb} step="1" />
          <Field
            label="SSD (GB)"
            name="storage_gb"
            value={f.storage_gb}
            step="1"
          />
          <label className="field">
            <span>Seller-stated condition</span>
            <select name="condition" defaultValue={f.condition ?? ""} required>
              <option value="" disabled>
                Select condition
              </option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="excellent">Excellent</option>
            </select>
          </label>
          <Field
            label="Inbound shipping (AUD)"
            name="inbound_shipping"
            value={item.inbound_shipping}
            optional
          />
          <label className="field wide">
            <span>How did you confirm these details?</span>
            <textarea
              name="note"
              required
              minLength={5}
              maxLength={1500}
              rows={3}
              placeholder="e.g. Seller confirmed the CPU and postage in a message."
            />
          </label>
        </div>
        <FormError error={error} />
        <FormFooter note="Only confirm details you checked.">
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
      <h3>Local AI, focused on one niche</h3>
      <p>
        Gemma 4 reads listing text for ThinkPad T14 Gen 1–3 laptops. It copies
        supporting excerpts and leaves unsupported facts unknown. Model output
        never certifies physical condition.
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
      <h3>A demo is a demo</h3>
      <p>
        Synthetic listings and sales are isolated from your real workspace.
        Replay is not a live model call. Use “Analyse again” in the evidence
        panel to run the local model.
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
