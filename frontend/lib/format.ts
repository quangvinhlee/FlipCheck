import type { Listing } from "./types";
export function aud(value: number | null | undefined, digits = 0) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .format(value)
    .replace("$", "A$");
}
export function margin(value: number) {
  return `${value < 0 ? "−" : "+"}${aud(Math.abs(value), 2)}`;
}
export function relative(value?: string) {
  if (!value) return "Not scanned yet";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : new Date(value).toLocaleDateString("en-AU", {
            timeZone: "Australia/Melbourne",
          });
}
export function scenario(item: Listing) {
  return (
    item.valuation.scenarios.low || item.valuation.scenarios.assumed || null
  );
}
export function assessment(item: Listing): {
  label: string;
  tone: "green" | "amber" | "red" | "neutral";
  short: string;
} {
  if (item.extraction.status === "rejected")
    return { label: "Excluded", tone: "red", short: "Doesn’t fit your search" };
  if (
    item.extraction.status === "needs_review" ||
    item.inbound_shipping == null
  )
    return {
      label: item.extraction.legacy
        ? "Reanalyse listing"
        : item.extraction.unknown_fields?.includes("condition")
          ? "Condition unknown"
          : item.inbound_shipping == null &&
              item.extraction.status === "eligible"
            ? item.marketplace === "facebook"
              ? "Pickup cost unknown"
              : "Shipping unknown"
            : "Check specifications",
      tone: "amber",
      short: item.valuation.blockers?.[0]?.message || "Confirm missing details",
    };
  if (item.valuation.opportunity)
    return {
      label: "Worth inspecting",
      tone: "green",
      short: "Conservative margin meets target",
    };
  if (item.valuation.method === "user_assumption")
    return {
      label: "Your assumption",
      tone: "neutral",
      short: "Resale price entered by you",
    };
  if (item.valuation.method === "unavailable")
    return {
      label: "Needs sales data",
      tone: "amber",
      short: "Not enough comparable sales",
    };
  return {
    label: "Below target",
    tone: "neutral",
    short: "Margin below your threshold",
  };
}
export function specLine(item: Listing) {
  const f = item.extraction.facts;
  return (
    [
      f.cpu,
      f.gpu,
      f.lens,
      f.bundle,
      f.edition,
      f.ram_gb ? `${f.ram_gb}GB RAM` : null,
      f.storage_gb ? `${f.storage_gb}GB SSD` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Specifications need confirmation"
  );
}
export function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sourceLabel(item: Listing) {
  return item.marketplace === "facebook" ? "Facebook Marketplace" : "eBay AU";
}
export function pickupLine(item: Listing) {
  if (item.marketplace !== "facebook") return "";
  const distance = item.display_distance_km;
  return distance == null
    ? "Location not confirmed"
    : `~${distance.toFixed(1)} km away · ${item.location_label || "published map pin"}`;
}
export function effectiveListing(item: Listing, searchId: number | null) {
  const valuation = item.valuations[String(searchId)] || item.valuation;
  return {
    ...item,
    valuation,
    inbound_shipping:
      item.marketplace === "facebook"
        ? (valuation.costs.pickup_cost ?? null)
        : item.inbound_shipping,
    display_distance_km: item.distance_by_watchlist?.[String(searchId)] ?? null,
  };
}
