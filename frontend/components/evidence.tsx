"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  CircleHelp,
  Clock3,
  FileCheck2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Listing, Mutation, SpecKey, Watchlist } from "@/lib/types";
import {
  assessment,
  aud,
  margin,
  scenario,
  specLine,
  effectiveListing,
  sourceLabel,
  pickupLine,
} from "@/lib/format";
import LaptopArt from "./laptop-art";
import { CategoryIcon } from "./watchlists";

export function Badge({ item }: { item: Listing }) {
  const a = assessment(item);
  return (
    <span className={`badge ${a.tone}`}>
      <i />
      {a.label}
    </span>
  );
}
export default function Evidence({
  item,
  mutate,
  pending,
  onCorrect,
  onClose,
  watchlists,
}: {
  watchlists: Watchlist[];
  item: Listing;
  mutate: Mutation;
  pending: boolean;
  onCorrect: () => void;
  onClose: () => void;
}) {
  const [searchId, setSearchId] = useState(
    String(item.valuation.watchlist_id || item.display_watchlist_id || ""),
  );
  const x = effectiveListing(item, searchId ? Number(searchId) : null),
    f = x.extraction.facts,
    v = x.valuation,
    s = scenario(x);
  const matches = watchlists.filter((w) => item.watchlist_ids.includes(w.id));
  const title = f.model
    ? `${f.model}${f.generation ? ` · Gen ${f.generation}` : ""}`
    : x.title;
  const keys: [SpecKey, string][] = [
    ["brand", "Brand"],
    ["model", "Model"],
    ["generation", "Generation"],
    ["variant", "Platform"],
    ["cpu", "Processor"],
    ["ram_gb", "Memory (GB)"],
    ["storage_gb", "SSD (GB)"],
    ["gpu", "Graphics"],
    ["bundle", "Bundle"],
    ["lens", "Lens"],
    ["edition", "Edition"],
    ["vram_gb", "VRAM (GB)"],
    ["lock_status", "Lock/network"],
    ["condition", "Condition"],
  ];
  const costs: [string, number | null | undefined][] = [
    ["Purchase price", x.asking_price],
    [
      x.marketplace === "facebook"
        ? "Pickup / travel allowance"
        : "Inbound postage",
      x.inbound_shipping,
    ],
    ["Repairs", v.costs.repairs],
    ["Packaging", v.costs.packaging],
    ["Outbound postage", v.costs.outbound_shipping],
    ["Buyer-paid postage (income)", v.costs.resale_shipping],
    ["Risk allowance", v.costs.risk_allowance],
    ["Labour allowance", v.costs.labour],
    ["Selling fees (low / assumed)", s?.fees],
  ];
  return (
    <>
      <div className="detail-product">
        {x.extraction.category === "laptop" ? (
          <LaptopArt
            variant={
              x.extraction.classification === "accessory"
                ? "accessory"
                : x.extraction.classification === "parts_or_faulty"
                  ? "faulty"
                  : "normal"
            }
            large
          />
        ) : (
          <div className="laptop-art large category-art" aria-hidden="true">
            <CategoryIcon category={x.extraction.category} size={58} />
          </div>
        )}
        <div>
          <span className="eyebrow">{sourceLabel(x).toUpperCase()}</span>
          <h3>{title}</h3>
          <p>{specLine(x)}</p>
          <p>
            {sourceLabel(x)}
            {x.marketplace === "facebook" ? ` · ${pickupLine(x)}` : ""}
          </p>
          <Badge item={x} />
        </div>
      </div>
      {matches.length > 0 && (
        <label className="field valuation-search">
          <span>Valuation and costs for search</span>
          <select
            aria-label="Valuation and costs for search"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
          >
            {matches.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="detail-actions">
        {x.url && (
          <a
            className="button primary"
            href={x.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open original
            <ArrowUpRight size={16} />
          </a>
        )}
        <button
          disabled={pending}
          className={`button ${x.decision === "saved" ? "saved-button" : "secondary"}`}
          onClick={() =>
            void mutate("decision", {
              id: x.id,
              decision: x.decision === "saved" ? "new" : "saved",
            }).catch(() => {})
          }
        >
          <Bookmark
            size={16}
            fill={x.decision === "saved" ? "currentColor" : "none"}
          />
          {x.decision === "saved" ? "Saved" : "Save listing"}
        </button>
        <button
          className="button secondary"
          onClick={onCorrect}
          disabled={pending}
        >
          <Pencil size={15} />
          Correct facts
        </button>
      </div>
      <section className="detail-section">
        <h3>
          What the numbers say<span>ESTIMATED · PRE-TAX</span>
        </h3>
        <div className="valuation-card">
          <div className="valuation-card-heading">
            <ShieldCheck size={19} />
            <strong>
              {v.method === "unavailable"
                ? "Not enough evidence to estimate"
                : v.method === "user_assumption"
                  ? "Based on your resale assumption"
                  : "Margin after your configured costs"}
            </strong>
          </div>
          <p>{v.reason}</p>
          {Object.keys(v.scenarios).length > 0 && (
            <div className="scenario-grid">
              {Object.entries(v.scenarios).map(([key, value]) => (
                <div className={`scenario ${key}`} key={key}>
                  <span>
                    {key === "assumed"
                      ? "YOUR ASSUMPTION"
                      : key === "low"
                        ? "CONSERVATIVE"
                        : key.toUpperCase()}
                  </span>
                  <strong>{value ? margin(value.margin) : "—"}</strong>
                  <small>{aud(v.range?.[key])} resale</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="detail-section">
        <h3>
          Source listing
          <FileCheck2 size={17} />
        </h3>
        <div className="source-copy">
          <strong>{x.title}</strong>
          <p>{x.description || "No description supplied."}</p>
        </div>
        {x.location_basis && (
          <p className="micro-copy">Location basis: {x.location_basis}</p>
        )}
      </section>
      <section className="detail-section">
        <h3>
          Facts, with their evidence
          <span>{x.extraction.engine || "Not analysed"}</span>
        </h3>
        <div className="facts-table">
          {keys
            .filter(
              ([key]) =>
                ["brand", "model", "condition"].includes(key) ||
                f[key] != null ||
                (x.extraction.category === "laptop" &&
                  ["cpu", "ram_gb", "storage_gb"].includes(key)) ||
                (x.extraction.category === "camera" &&
                  ["bundle", "lens"].includes(key)),
            )
            .map(([key, label]) => (
              <div className="fact-row" key={key}>
                <span>{label}</span>
                <strong>{f[key] ?? "Unknown"}</strong>
                {x.extraction.evidence[key] ? (
                  <q>{x.extraction.evidence[key]}</q>
                ) : (
                  <span className="missing-fact">No supporting text</span>
                )}
              </div>
            ))}
        </div>
        <p className="detail-reason">{x.extraction.reason}</p>
        {!!x.extraction.errors?.length && (
          <ul className="validation-errors">
            {x.extraction.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {x.correction && (
          <div className="inline-notice amber">
            <Pencil size={16} />
            <span>Human correction: {x.correction}</span>
          </div>
        )}
        {x.extraction.stats && (
          <p className="micro-copy">
            {x.extraction.stats.elapsed_seconds}s local inference ·{" "}
            {x.extraction.stats.eval_count ?? "—"} output tokens
            {x.extraction.cached ? " · cached" : ""}
          </p>
        )}
        <button
          className="text-button"
          disabled={pending}
          onClick={() => {
            void mutate("analyse", { id: x.id })
              .then(onClose)
              .catch(() => {});
          }}
        >
          <RefreshCw size={14} />
          Analyse again with Gemma 4
        </button>
      </section>
      <section className="detail-section">
        <h3>
          Every cost accounted for<span>YOUR ASSUMPTIONS</span>
        </h3>
        <div className="cost-list">
          {costs.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value == null ? "Unknown" : aud(value, 2)}</strong>
            </div>
          ))}
          <div className="cost-total">
            <span>Conservative / assumed margin</span>
            <strong>{s ? margin(s.margin) : "Not estimated"}</strong>
          </div>
        </div>
        <p className="micro-copy">
          Fee: {v.costs.fee_rate}% + {aud(v.costs.fixed_fee, 2)}. Base:{" "}
          {v.costs.fee_base === "receipts"
            ? "item + buyer-paid postage"
            : "item only"}
          . All amounts in AUD.
        </p>
      </section>
      <section className="detail-section">
        <h3>
          Comparable sales
          <span>
            {v.count} EXACT MATCHES · {v.costs.recency_days} DAYS
          </span>
        </h3>
        {v.comparisons.length ? (
          <div className="comparisons-list">
            {v.comparisons.map((c) => (
              <div key={`${c.source}-${c.external_id}`}>
                <div>
                  <strong>{c.reference}</strong>
                  <span>
                    {c.sold_at} · {c.condition} · {c.source}
                  </span>
                </div>
                <b>{aud(c.sold_price)}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="detail-empty">
            <FileCheck2 size={23} />
            <p>
              No exact recent sales. Add completed sales to your library, or
              enter an explicit resale assumption in settings.
            </p>
          </div>
        )}
        <p className="micro-copy">
          Quartiles describe this sample, not a calibrated prediction interval.{" "}
          Sales verification is asserted by the importer.
        </p>
      </section>
      <section className="detail-section">
        <h3>
          Price observations
          <Clock3 size={17} />
        </h3>
        <div className="cost-list">
          {x.observations.map((o, i) => (
            <div key={i}>
              <span>
                {new Date(o.observed_at).toLocaleString("en-AU", {
                  timeZone: "Australia/Melbourne",
                })}
              </span>
              <strong>
                {aud(o.asking_price)} +{" "}
                {o.shipping == null ? "unknown postage" : aud(o.shipping)}
              </strong>
            </div>
          ))}
        </div>
        <p className="micro-copy">
          Availability and physical condition are not verified by FlipCheck.
        </p>
      </section>
      <div className="form-footer">
        <small>
          <ShieldCheck size={15} />
          Inspect before buying.
        </small>
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => {
            void mutate("decision", {
              id: x.id,
              decision: x.decision === "dismissed" ? "new" : "dismissed",
            })
              .then(onClose)
              .catch(() => {});
          }}
        >
          {x.decision === "dismissed" ? (
            <Check size={15} />
          ) : (
            <Trash2 size={15} />
          )}
          {x.decision === "dismissed" ? "Restore listing" : "Dismiss listing"}
        </button>
      </div>
    </>
  );
}
