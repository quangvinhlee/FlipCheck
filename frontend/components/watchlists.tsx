"use client";
import {
  Camera,
  ChevronRight,
  Cpu,
  Gamepad2,
  Laptop,
  Plus,
  Radar,
  Smartphone,
  SlidersHorizontal,
} from "lucide-react";
import type { Watchlist } from "@/lib/types";
import { aud } from "@/lib/format";
export function CategoryIcon({
  category,
  size = 20,
}: {
  category?: string;
  size?: number;
}) {
  const Icon =
    category === "camera"
      ? Camera
      : category === "phone" || category === "tablet"
        ? Smartphone
        : category === "console"
          ? Gamepad2
          : category === "gpu"
            ? Cpu
            : Laptop;
  return <Icon size={size} />;
}
export default function WatchlistManager({
  watchlists,
  onEdit,
  onAdd,
  onScan,
  locked,
}: {
  watchlists: Watchlist[];
  onEdit: (w: Watchlist) => void;
  onAdd: () => void;
  onScan: (ids: number[]) => void;
  locked: boolean;
}) {
  return (
    <section className="search-manager" aria-label="Product searches">
      <header>
        <div>
          <span className="eyebrow">YOUR PRODUCT SEARCHES</span>
          <h2>
            Different products. One sourcing desk.
            <span>{watchlists.length}/10</span>
          </h2>
          <p>
            Scan enabled searches together. Each keeps its own budget and costs.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={locked || watchlists.length >= 10}
          onClick={onAdd}
        >
          <Plus size={16} />
          Add search
        </button>
      </header>
      <div className="search-cards">
        {watchlists.map((w) => (
          <article
            key={w.id}
            className={`search-card ${!w.enabled ? "paused" : ""}`}
          >
            <div className="search-card-top">
              <span className="search-category">
                <CategoryIcon category={w.category} />
              </span>
              <span className={`search-state ${w.enabled ? "on" : ""}`}>
                {w.enabled ? "Enabled" : "Paused"}
              </span>
              <button
                className="icon-button"
                aria-label={`Edit ${w.name}`}
                onClick={() => onEdit(w)}
                disabled={locked}
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>
            <h3>{w.name}</h3>
            <p title={w.query}>{w.query}</p>
            <div className="search-prices">
              <span>
                Buy under<strong>{aud(w.max_price)}</strong>
              </span>
              <span>
                Margin target<strong>{aud(w.min_margin)}+</strong>
              </span>
            </div>
            <button
              className="search-scan"
              disabled={locked || !w.enabled}
              onClick={() => onScan([w.id])}
            >
              <Radar size={14} />
              {w.enabled ? "Scan this search" : "Paused search"}
              <ChevronRight size={14} />
            </button>
          </article>
        ))}
      </div>
      {!watchlists.length && (
        <p className="search-manager-empty">
          Add your first search to discover real listings. Nothing is preloaded.
        </p>
      )}
    </section>
  );
}
