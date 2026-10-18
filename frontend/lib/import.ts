export function parseImport(
  text: string,
  kind: "listings" | "comparisons",
): unknown[] {
  text = text.trim().replace(/^\uFEFF/, "");
  if (!text) throw new Error("Choose a file or paste JSON / CSV first.");
  if (new TextEncoder().encode(text).length > 2_000_000)
    throw new Error("Import must be smaller than 2 MB.");
  if (text[0] === "[" || text[0] === "{") {
    const parsed: unknown = JSON.parse(text);
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)[kind]
        : null;
    if (!Array.isArray(rows))
      throw new Error(`Expected an array or an object with a “${kind}” array.`);
    return rows;
  }
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.length) throw new Error("Invalid CSV quote.");
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
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2)
    throw new Error("CSV needs a header and at least one row.");
  const headers = rows.shift()!.map((x) => x.trim());
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be unique.");
  const numbers = new Set([
    "asking_price",
    "inbound_shipping",
    "generation",
    "ram_gb",
    "storage_gb",
    "sold_price",
    "shipping",
    "latitude",
    "longitude",
    "vram_gb",
  ]);
  const booleans = new Set([
    "verified",
    "actual_price_known",
    "has_variations",
  ]);
  return rows.map((r, index) => {
    if (r.length !== headers.length)
      throw new Error(`Row ${index + 2} has the wrong column count.`);
    return Object.fromEntries(
      headers.map((h, j) => {
        const raw = r[j].trim();
        let value: unknown = raw;
        if (numbers.has(h)) {
          value = raw === "" ? null : Number(raw);
          if (value !== null && !Number.isFinite(value))
            throw new Error(`Invalid number in ${h}.`);
        }
        if (booleans.has(h)) {
          if (!["true", "false", ""].includes(raw.toLowerCase()))
            throw new Error(`${h} must be true or false.`);
          value = raw.toLowerCase() === "true";
        }
        return [h, value];
      }),
    );
  });
}
