/*
 * Cartographic Studio Design — Parcel Data Table
 * Three-state bottom drawer: minimized (header bar only), peek (few rows), expanded (50vh).
 * Frosted glass background, tabular data with monospace numbers.
 * Includes CSV export functionality.
 *
 * Collapse states:
 *   "minimized" → thin header bar only (~40px), no table visible
 *   "peek"      → header + ~4 rows visible (~220px)
 *   "expanded"  → header + scrollable table up to 50vh
 */

import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, Table2, Minus, Download } from "lucide-react";
import type { ParcelFeature } from "@/lib/types";
import { safeNumber, formatCurrencyFull, formatAcres } from "@/lib/format";

interface ParcelTableProps {
  parcels: ParcelFeature[];
  onHoverParcel: (objectId: number | null) => void;
  onClickParcel: (parcel: ParcelFeature | null) => void;
}

type CollapseState = "minimized" | "peek" | "expanded";
type SortKey = "OWN1_LAST" | "CITY" | "STATE" | "LAND_ACRES" | "TOT_VAL" | "APN";
type SortDir = "asc" | "desc";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function ParcelTable({ parcels, onHoverParcel, onClickParcel }: ParcelTableProps) {
  const [collapseState, setCollapseState] = useState<CollapseState>("minimized");
  const [sortKey, setSortKey] = useState<SortKey>("OWN1_LAST");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    return [...parcels].sort((a, b) => {
      const ap = a.properties;
      const bp = b.properties;
      let cmp = 0;

      switch (sortKey) {
        case "LAND_ACRES":
        case "TOT_VAL":
          cmp = safeNumber(ap[sortKey]) - safeNumber(bp[sortKey]);
          break;
        default:
          cmp = String(ap[sortKey] || "").localeCompare(String(bp[sortKey] || ""));
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [parcels, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Cycle through states: minimized → peek → expanded → minimized
  const cycleExpand = useCallback(() => {
    setCollapseState((prev) => {
      if (prev === "minimized") return "peek";
      if (prev === "peek") return "expanded";
      return "minimized";
    });
  }, []);

  const exportCsv = useCallback(() => {
    const headers = [
      "APN", "Owner", "City", "State", "Acres", "Total Value",
      "Land Value", "Address", "Type", "Tax Year", "Site Name", "Zoning", "Land Use",
    ];

    const rows = sorted.map((parcel) => {
      const p = parcel.properties;
      return [
        escapeCsvField(p.APN || ""),
        escapeCsvField(p.OWN1_LAST || ""),
        escapeCsvField(p.CITY || ""),
        escapeCsvField(p.STATE || ""),
        String(p.LAND_ACRES || 0),
        String(safeNumber(p.TOT_VAL)),
        String(safeNumber(p.LAN_VAL)),
        escapeCsvField(p.STD_ADDR || p.ADDR || ""),
        escapeCsvField(p.QueryResultType || ""),
        String(p.TAX_YR || ""),
        escapeCsvField(p._currentName || p.QuerySiteName || ""),
        escapeCsvField(p.ZONING || ""),
        escapeCsvField(p.LAND_USE || ""),
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dc_parcels_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [sorted]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    );
  }

  const headerClass =
    "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-foreground/55 cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap";
  const cellClass = "px-3 py-2 text-sm whitespace-nowrap";

  // Height mapping for each state
  const heightClass =
    collapseState === "minimized"
      ? "max-h-[44px]"
      : collapseState === "peek"
        ? "max-h-[240px]"
        : "max-h-[50vh]";

  // Expand icon: up arrow when minimized/peek, down arrow when expanded
  const ExpandIcon =
    collapseState === "expanded" ? ChevronDown : ChevronUp;

  const expandTitle =
    collapseState === "minimized"
      ? "Show table (peek)"
      : collapseState === "peek"
        ? "Expand table"
        : "Collapse table";

  return (
    <div
      className={`glass-panel rounded-t-xl transition-all duration-300 ease-in-out ${heightClass} flex flex-col overflow-hidden`}
    >
      {/* Header bar — always visible, clickable to cycle states */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 shrink-0 cursor-pointer select-none hover:bg-black/[0.02] transition-colors"
        onClick={cycleExpand}
      >
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-terracotta" />
          <span className="text-sm font-semibold text-foreground">
            Parcel Details
          </span>
          <span className="text-xs text-foreground/55 font-mono ml-1">
            ({parcels.length} records)
          </span>
          {/* State indicator pill */}
          <span className="text-[9px] uppercase tracking-wider font-medium text-foreground/35 ml-2">
            {collapseState === "minimized" ? "Click to open" : collapseState === "peek" ? "Preview" : "Full view"}
          </span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* CSV Export Button — only show when table is visible */}
          {collapseState !== "minimized" && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                         text-foreground/70 hover:text-terracotta hover:bg-terracotta/5
                         border border-border/40 hover:border-terracotta/30 transition-all"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          )}

          {/* Minimize button — collapses to header-only */}
          {collapseState !== "minimized" && (
            <button
              onClick={() => setCollapseState("minimized")}
              className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
              title="Minimize table"
            >
              <Minus className="w-4 h-4 text-foreground/50" />
            </button>
          )}

          {/* Expand/collapse cycle button */}
          <button
            onClick={cycleExpand}
            className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
            title={expandTitle}
          >
            <ExpandIcon className="w-4 h-4 text-foreground/50" />
          </button>
        </div>
      </div>

      {/* Table — hidden when minimized */}
      {collapseState !== "minimized" && (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-stone-warm/95 backdrop-blur-sm z-10">
              <tr className="border-b border-border/30">
                <th className={headerClass} onClick={() => toggleSort("APN")}>
                  APN <SortIcon col="APN" />
                </th>
                <th className={headerClass} onClick={() => toggleSort("OWN1_LAST")}>
                  Owner <SortIcon col="OWN1_LAST" />
                </th>
                <th className={headerClass} onClick={() => toggleSort("CITY")}>
                  City <SortIcon col="CITY" />
                </th>
                <th className={headerClass} onClick={() => toggleSort("STATE")}>
                  State <SortIcon col="STATE" />
                </th>
                <th className={headerClass + " text-right"} onClick={() => toggleSort("LAND_ACRES")}>
                  Acres <SortIcon col="LAND_ACRES" />
                </th>
                <th className={headerClass + " text-right"} onClick={() => toggleSort("TOT_VAL")}>
                  Total Value <SortIcon col="TOT_VAL" />
                </th>
                <th className={headerClass}>Address</th>
                <th className={headerClass}>Type</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((parcel) => {
                const p = parcel.properties;
                return (
                  <tr
                    key={p.OBJECTID}
                    className="border-b border-border/20 hover:bg-terracotta/4 transition-colors cursor-pointer"
                    onMouseEnter={() => onHoverParcel(p.OBJECTID)}
                    onMouseLeave={() => onHoverParcel(null)}
                    onClick={() => onClickParcel(parcel)}
                  >
                    <td className={cellClass + " font-mono text-xs text-foreground/50"}>
                      {p.APN || "\u2014"}
                    </td>
                    <td className={cellClass + " font-medium max-w-[200px] truncate"}>
                      {p.OWN1_LAST || "\u2014"}
                    </td>
                    <td className={cellClass}>{p.CITY || "\u2014"}</td>
                    <td className={cellClass}>{p.STATE || "\u2014"}</td>
                    <td className={cellClass + " text-right font-mono"}>
                      {formatAcres(p.LAND_ACRES)}
                    </td>
                    <td className={cellClass + " text-right font-mono"}>
                      {safeNumber(p.TOT_VAL) > 0
                        ? formatCurrencyFull(safeNumber(p.TOT_VAL))
                        : "\u2014"}
                    </td>
                    <td className={cellClass + " text-foreground/60 max-w-[180px] truncate"}>
                      {p.STD_ADDR || p.ADDR || "\u2014"}
                    </td>
                    <td className={cellClass}>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide
                        ${
                          p.QueryResultType === "Intersect"
                            ? "bg-red-500/10 text-red-600"
                            : p.QueryResultType === "OwnerProximity"
                            ? "bg-blue-500/10 text-blue-600"
                            : p.QueryResultType === "OwnerStatewide"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.QueryResultType}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
