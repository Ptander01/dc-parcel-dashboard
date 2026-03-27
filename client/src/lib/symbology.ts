/*
 * Symbology System — Color coding modes for parcel polygons.
 * Supports categorical (unique values) and graduated (quantile breaks) modes.
 */

import type { ParcelFeature } from "./types";
import { safeNumber } from "./format";
import L from "leaflet";

// ─── Symbology Mode Definitions ───────────────────────────────────────────

export type SymbologyMode =
  | "type"
  | "owner"
  | "acreage"
  | "totalValue"
  | "taxYear"
  | "landUse";

export interface SymbologyOption {
  id: SymbologyMode;
  label: string;
  description: string;
  kind: "categorical" | "graduated";
}

export const SYMBOLOGY_OPTIONS: SymbologyOption[] = [
  { id: "type", label: "Query Result Type", description: "Intersect / Proximity / Statewide", kind: "categorical" },
  { id: "owner", label: "Owner", description: "Unique color per owner", kind: "categorical" },
  { id: "acreage", label: "Parcel Acreage", description: "Graduated by land area", kind: "graduated" },
  { id: "totalValue", label: "Total Value", description: "Graduated by assessed value", kind: "graduated" },
  { id: "taxYear", label: "Tax Year", description: "Unique color per tax year", kind: "categorical" },
  { id: "landUse", label: "Land Use", description: "Unique color per land use code", kind: "categorical" },
];

// ─── Color Palettes ───────────────────────────────────────────────────────

// Categorical palette — 20 distinct colors for unique values
const CATEGORICAL_COLORS = [
  "#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA",
  "#00ACC1", "#F4511E", "#3949AB", "#7CB342", "#D81B60",
  "#039BE5", "#C0CA33", "#6D4C41", "#00897B", "#FFB300",
  "#5E35B1", "#546E7A", "#E91E63", "#00BCD4", "#FF7043",
];

// Graduated ramp — 6 classes from light to dark (blue-to-red diverging)
const GRADUATED_RAMP = [
  { fill: "#D4E6F1", stroke: "#85C1E9", label: "Very Low" },
  { fill: "#85C1E9", stroke: "#3498DB", label: "Low" },
  { fill: "#F9E79F", stroke: "#F4D03F", label: "Medium-Low" },
  { fill: "#F5B041", stroke: "#E67E22", label: "Medium-High" },
  { fill: "#E74C3C", stroke: "#C0392B", label: "High" },
  { fill: "#8E44AD", stroke: "#6C3483", label: "Very High" },
];

// Fixed type colors (matching existing design)
const TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  Intersect: { fill: "#EF5350", stroke: "#E53935" },
  OwnerProximity: { fill: "#4FC3F7", stroke: "#0288D1" },
  OwnerStatewide: { fill: "#FFB74D", stroke: "#FFA726" },
};

// ─── Legend Entry ──────────────────────────────────────────────────────────

export interface LegendEntry {
  color: string;
  strokeColor: string;
  label: string;
  count?: number;
}

// ─── Build Symbology for a set of parcels ─────────────────────────────────

export interface SymbologyResult {
  /** Map from OBJECTID → Leaflet PathOptions */
  styleMap: Map<number, L.PathOptions>;
  /** Legend entries for the current mode */
  legend: LegendEntry[];
  /** Human-readable title for the legend */
  legendTitle: string;
}

export function buildSymbology(
  parcels: ParcelFeature[],
  mode: SymbologyMode
): SymbologyResult {
  switch (mode) {
    case "type":
      return buildTypeSymbology(parcels);
    case "owner":
      return buildCategoricalSymbology(parcels, (p) => p.properties.OWN1_LAST || "Unknown", "Owner");
    case "taxYear":
      return buildCategoricalSymbology(parcels, (p) => {
        const yr = p.properties.TAX_YR;
        return yr ? String(yr) : "Unknown";
      }, "Tax Year");
    case "landUse":
      return buildCategoricalSymbology(parcels, (p) => p.properties.LAND_USE || p.properties.PROP_IND || "Unknown", "Land Use");
    case "acreage":
      return buildGraduatedSymbology(parcels, (p) => p.properties.LAND_ACRES || 0, "Parcel Acreage (ac)");
    case "totalValue":
      return buildGraduatedSymbology(parcels, (p) => safeNumber(p.properties.TOT_VAL), "Total Value ($)");
    default:
      return buildTypeSymbology(parcels);
  }
}

// ─── Type Symbology (fixed 3 categories) ──────────────────────────────────

function buildTypeSymbology(parcels: ParcelFeature[]): SymbologyResult {
  const styleMap = new Map<number, L.PathOptions>();
  const counts: Record<string, number> = {};

  for (const p of parcels) {
    const type = p.properties.QueryResultType || "Unknown";
    counts[type] = (counts[type] || 0) + 1;
    const tc = TYPE_COLORS[type];
    if (tc) {
      styleMap.set(p.properties.OBJECTID, {
        color: tc.stroke,
        weight: type === "Intersect" ? 3 : type === "OwnerProximity" ? 2 : 1.5,
        opacity: type === "OwnerStatewide" ? 0.7 : 0.9,
        fillColor: tc.fill,
        fillOpacity: type === "Intersect" ? 0.35 : type === "OwnerProximity" ? 0.3 : 0.2,
      });
    } else {
      styleMap.set(p.properties.OBJECTID, {
        color: "#0288D1",
        weight: 2,
        opacity: 0.9,
        fillColor: "#4FC3F7",
        fillOpacity: 0.3,
      });
    }
  }

  const legend: LegendEntry[] = [
    { color: TYPE_COLORS.Intersect.fill, strokeColor: TYPE_COLORS.Intersect.stroke, label: "Intersect", count: counts["Intersect"] || 0 },
    { color: TYPE_COLORS.OwnerProximity.fill, strokeColor: TYPE_COLORS.OwnerProximity.stroke, label: "Owner Proximity", count: counts["OwnerProximity"] || 0 },
    { color: TYPE_COLORS.OwnerStatewide.fill, strokeColor: TYPE_COLORS.OwnerStatewide.stroke, label: "Owner Statewide", count: counts["OwnerStatewide"] || 0 },
  ];

  return { styleMap, legend, legendTitle: "Query Result Type" };
}

// ─── Categorical Symbology (unique values) ────────────────────────────────

function buildCategoricalSymbology(
  parcels: ParcelFeature[],
  accessor: (p: ParcelFeature) => string,
  title: string
): SymbologyResult {
  const styleMap = new Map<number, L.PathOptions>();
  const categories = new Map<string, number>();

  // Count occurrences
  for (const p of parcels) {
    const val = accessor(p);
    categories.set(val, (categories.get(val) || 0) + 1);
  }

  // Sort by count descending, assign colors
  const sorted = Array.from(categories.entries()).sort((a, b) => b[1] - a[1]);
  const colorAssignment = new Map<string, number>();
  sorted.forEach(([cat], idx) => {
    colorAssignment.set(cat, idx % CATEGORICAL_COLORS.length);
  });

  // Build style map
  for (const p of parcels) {
    const val = accessor(p);
    const colorIdx = colorAssignment.get(val) || 0;
    const color = CATEGORICAL_COLORS[colorIdx];
    styleMap.set(p.properties.OBJECTID, {
      color: color,
      weight: 2,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.35,
    });
  }

  // Build legend (top 15 + "Other" if needed)
  const MAX_LEGEND = 15;
  const legend: LegendEntry[] = sorted.slice(0, MAX_LEGEND).map(([cat, count]) => {
    const colorIdx = colorAssignment.get(cat) || 0;
    const color = CATEGORICAL_COLORS[colorIdx];
    return { color, strokeColor: color, label: cat, count };
  });

  if (sorted.length > MAX_LEGEND) {
    const otherCount = sorted.slice(MAX_LEGEND).reduce((s, [, c]) => s + c, 0);
    legend.push({
      color: "#9E9E9E",
      strokeColor: "#757575",
      label: `Other (${sorted.length - MAX_LEGEND} categories)`,
      count: otherCount,
    });
  }

  return { styleMap, legend, legendTitle: title };
}

// ─── Graduated Symbology (quantile breaks) ────────────────────────────────

function buildGraduatedSymbology(
  parcels: ParcelFeature[],
  accessor: (p: ParcelFeature) => number,
  title: string
): SymbologyResult {
  const styleMap = new Map<number, L.PathOptions>();
  const values = parcels.map(accessor).filter((v) => v > 0).sort((a, b) => a - b);

  if (values.length === 0) {
    // No valid values — all grey
    for (const p of parcels) {
      styleMap.set(p.properties.OBJECTID, {
        color: "#9E9E9E",
        weight: 2,
        opacity: 0.8,
        fillColor: "#BDBDBD",
        fillOpacity: 0.3,
      });
    }
    return {
      styleMap,
      legend: [{ color: "#BDBDBD", strokeColor: "#9E9E9E", label: "No data", count: parcels.length }],
      legendTitle: title,
    };
  }

  // Compute quantile breaks (6 classes)
  const numClasses = GRADUATED_RAMP.length;
  const breaks: number[] = [];
  for (let i = 1; i < numClasses; i++) {
    const idx = Math.floor((i / numClasses) * values.length);
    breaks.push(values[Math.min(idx, values.length - 1)]);
  }

  function getClass(val: number): number {
    if (val <= 0) return 0;
    for (let i = 0; i < breaks.length; i++) {
      if (val <= breaks[i]) return i;
    }
    return numClasses - 1;
  }

  // Format range labels
  function formatVal(v: number): string {
    if (title.includes("$") || title.includes("Value")) {
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
      return `$${v.toFixed(0)}`;
    }
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(1);
  }

  // Build style map
  const classCounts = new Array(numClasses).fill(0);
  for (const p of parcels) {
    const val = accessor(p);
    const cls = getClass(val);
    classCounts[cls]++;
    const ramp = GRADUATED_RAMP[cls];
    styleMap.set(p.properties.OBJECTID, {
      color: ramp.stroke,
      weight: 2,
      opacity: 0.9,
      fillColor: ramp.fill,
      fillOpacity: 0.4,
    });
  }

  // Build legend with ranges
  const min = values[0];
  const max = values[values.length - 1];
  const allBreaks = [min, ...breaks, max];

  const legend: LegendEntry[] = GRADUATED_RAMP.map((ramp, i) => {
    const lo = i === 0 ? allBreaks[0] : allBreaks[i];
    const hi = i === numClasses - 1 ? allBreaks[allBreaks.length - 1] : allBreaks[i + 1];
    return {
      color: ramp.fill,
      strokeColor: ramp.stroke,
      label: `${formatVal(lo)} – ${formatVal(hi)}`,
      count: classCounts[i],
    };
  });

  return { styleMap, legend, legendTitle: title };
}
