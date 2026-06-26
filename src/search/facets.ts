import type { AnyDocument, FacetConfig, FacetResult } from "../types/index";

function getRawFieldValue(doc: AnyDocument, field: string): unknown {
  const parts = field.split(".");
  let val: unknown = doc;
  for (const p of parts) {
    if (val === null || val === undefined) return undefined;
    val = (val as Record<string, unknown>)[p];
  }
  return val;
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function truncateDate(
  d: Date,
  interval: "day" | "week" | "month" | "year"
): Date {
  switch (interval) {
    case "day":
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case "week":
      return startOfWeek(d);
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "year":
      return new Date(d.getFullYear(), 0, 1);
  }
}

function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  if (value instanceof Date) return value.getTime();
  return undefined;
}

function parseDateValue(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

export function computeFacets<T extends AnyDocument>(
  docs: T[],
  facets: Record<string, FacetConfig>
): Record<string, FacetResult> {
  const results: Record<string, FacetResult> = {};

  for (const [field, config] of Object.entries(facets)) {
    switch (config.type) {
      case "terms": {
        const counts = new Map<string | number, number>();

        for (const doc of docs) {
          const value = getRawFieldValue(doc, field);

          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === "string" || typeof item === "number") {
                counts.set(item, (counts.get(item) ?? 0) + 1);
              }
            }
          } else if (typeof value === "string" || typeof value === "number") {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
        }

        const size = config.size ?? 10;
        const buckets = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, size)
          .map(([key, count]) => ({ key, count }));

        results[field] = { type: "terms", buckets };
        break;
      }

      case "range": {
        const ranges = config.ranges ?? [];
        const buckets: FacetResult["buckets"] = [];

        for (const range of ranges) {
          let count = 0;
          for (const doc of docs) {
            const value = parseNumericValue(getRawFieldValue(doc, field));
            if (value === undefined) continue;

            if (range.min !== undefined && range.max !== undefined) {
              if (value >= range.min && value <= range.max) count++;
            } else if (range.min !== undefined) {
              if (value >= range.min) count++;
            } else if (range.max !== undefined) {
              if (value <= range.max) count++;
            } else {
              count++;
            }
          }

          buckets.push({
            key: range.label,
            count,
            min: range.min,
            max: range.max,
          });
        }

        results[field] = { type: "range", buckets };
        break;
      }

      case "date_histogram": {
        const interval = config.interval ?? "day";
        const counts = new Map<string, number>();

        for (const doc of docs) {
          const value = parseDateValue(getRawFieldValue(doc, field));
          if (value === undefined) continue;

          const truncated = truncateDate(value, interval);
          const key = truncated.toISOString();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        const buckets = [...counts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([key, count]) => ({ key, count }));

        results[field] = { type: "date_histogram", buckets };
        break;
      }
    }
  }

  return results;
}
