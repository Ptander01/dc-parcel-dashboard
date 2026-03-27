/*
 * Cartographic Studio Design — Compare Sites Summary View
 * Frosted glass panel with horizontal bar charts comparing selected sites
 * side-by-side on key metrics: Parcels, Acreage, Land Value, Cost/Acre.
 *
 * Owner-segmented bars: Each bar is broken into segments colored by the
 * parcel owner (OWN1_LAST), using the same CATEGORICAL_COLORS palette as
 * the map symbology so colors stay consistent across views.
 */

import { useState, useMemo } from "react";
import { BarChart3, X, Info } from "lucide-react";
import type { ParcelFeature, Site } from "@/lib/types";
import { formatCurrency, formatAcres, formatNumber, safeNumber } from "@/lib/format";
import { getParentCompany, COMPANY_CONFIG } from "@/lib/companies";

/* ─── Same palette as symbology.ts categorical mode ─── */
const CATEGORICAL_COLORS = [
  "#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA",
  "#00ACC1", "#F4511E", "#3949AB", "#7CB342", "#D81B60",
  "#039BE5", "#C0CA33", "#6D4C41", "#00897B", "#FFB300",
  "#5E35B1", "#546E7A", "#E91E63", "#00BCD4", "#FF7043",
];

interface CompareSitesProps {
  sites: Site[];
  selectedSiteIds: Set<string>;
  parcels: ParcelFeature[];
  onClose: () => void;
}

type MetricKey = "parcels" | "acres" | "value" | "costPerAcre";

const METRIC_TABS: { key: MetricKey; label: string; format: (v: number) => string }[] = [
  { key: "parcels", label: "Parcels", format: (v) => formatNumber(v) },
  { key: "acres", label: "Acreage", format: (v) => formatAcres(v) },
  { key: "value", label: "Land Value", format: (v) => formatCurrency(v) },
  {
    key: "costPerAcre",
    label: "Cost / Acre",
    format: (v) => (v > 0 ? formatCurrency(v) : "N/A"),
  },
];

/* ─── Per-owner breakdown for a site ─── */
interface OwnerSegment {
  owner: string;
  color: string;
  parcels: number;
  acres: number;
  value: number;
}

interface SiteRow {
  siteId: string;
  name: string;
  fullName: string;
  company: string;
  companyColor: string;
  parcels: number;
  acres: number;
  value: number;
  costPerAcre: number;
  segments: OwnerSegment[];
}

export function CompareSites({ sites, selectedSiteIds, parcels, onClose }: CompareSitesProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("acres");
  const [showMethods, setShowMethods] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<{
    siteId: string;
    owner: string;
    x: number;
    y: number;
  } | null>(null);

  const selectedSites = useMemo(() => {
    return sites.filter((s) => selectedSiteIds.has(s.id));
  }, [sites, selectedSiteIds]);

  /* Build a global owner→color map from ALL parcels of selected sites so
     the same owner always gets the same color across sites */
  const ownerColorMap = useMemo(() => {
    const ownerCounts = new Map<string, number>();
    for (const p of parcels) {
      if (!selectedSiteIds.has(p.properties._siteId)) continue;
      const owner = p.properties.OWN1_LAST || "Unknown";
      ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
    }
    // Sort by count descending, assign colors
    const sorted = Array.from(ownerCounts.entries()).sort((a, b) => b[1] - a[1]);
    const map = new Map<string, string>();
    sorted.forEach(([owner], idx) => {
      map.set(owner, CATEGORICAL_COLORS[idx % CATEGORICAL_COLORS.length]);
    });
    return map;
  }, [parcels, selectedSiteIds]);

  /* Build row data with per-owner segments */
  const rows: SiteRow[] = useMemo(() => {
    return selectedSites.map((site) => {
      const m = site.metrics;
      const shortName =
        site.currentName?.split(",")[0] || site.location || site.primaryOwner;
      const company = getParentCompany(site);
      const companyColor = COMPANY_CONFIG[company]?.color || "#6b7280";

      // Aggregate parcels by owner for this site
      const ownerAgg = new Map<string, { parcels: number; acres: number; value: number }>();
      for (const p of parcels) {
        if (p.properties._siteId !== site.id) continue;
        const owner = p.properties.OWN1_LAST || "Unknown";
        const existing = ownerAgg.get(owner) || { parcels: 0, acres: 0, value: 0 };
        existing.parcels += 1;
        existing.acres += p.properties.LAND_ACRES || 0;
        existing.value += safeNumber(p.properties.TOT_VAL);
        ownerAgg.set(owner, existing);
      }

      // Sort segments by the current metric descending
      const segments: OwnerSegment[] = Array.from(ownerAgg.entries())
        .map(([owner, agg]) => ({
          owner,
          color: ownerColorMap.get(owner) || "#6b7280",
          ...agg,
        }))
        .sort((a, b) => b.acres - a.acres);

      return {
        siteId: site.id,
        name: shortName.length > 20 ? shortName.slice(0, 18) + "…" : shortName,
        fullName: site.currentName || site.label,
        company,
        companyColor,
        parcels: m.parcelCount,
        acres: m.totalAcres,
        value: m.totalValue,
        costPerAcre: m.totalAcres > 0 ? m.totalValue / m.totalAcres : 0,
        segments,
      };
    });
  }, [selectedSites, parcels, ownerColorMap]);

  const currentTab = METRIC_TABS.find((t) => t.key === activeMetric)!;

  /* Compute max value for scaling bars */
  const maxVal = useMemo(() => {
    if (activeMetric === "costPerAcre") {
      // Cost/Acre doesn't segment — use total
      return Math.max(...rows.map((r) => r.costPerAcre), 1);
    }
    return Math.max(...rows.map((r) => r[activeMetric] as number), 1);
  }, [rows, activeMetric]);

  /* Unique owners across all selected sites for the legend */
  const legendOwners = useMemo(() => {
    const seen = new Map<string, { color: string; total: number }>();
    for (const row of rows) {
      for (const seg of row.segments) {
        const existing = seen.get(seg.owner);
        if (existing) {
          existing.total += seg[activeMetric === "costPerAcre" ? "acres" : activeMetric];
        } else {
          seen.set(seg.owner, {
            color: seg.color,
            total: seg[activeMetric === "costPerAcre" ? "acres" : activeMetric],
          });
        }
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);
  }, [rows, activeMetric]);

  if (selectedSites.length < 2) return null;

  const barHeight = 28;
  const rowGap = 8;
  const labelWidth = 130;

  return (
    <div className="w-full flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-terracotta" />
          <span className="text-sm font-semibold text-foreground">
            Compare Sites
          </span>
          <span className="text-xs text-muted-foreground font-mono ml-1">
            ({selectedSites.length} sites)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowMethods(!showMethods)}
            className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
            title="Methods"
          >
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Introduction text */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Side-by-side comparison of selected data center sites across key land
          acquisition metrics. Values are aggregated from all parcels associated
          with each site. Bar segments are colored by parcel owner, matching the
          map's owner symbology palette.
        </p>
      </div>

      {/* Methods panel (expandable) */}
      {showMethods && (
        <div className="mx-4 mt-2 p-3 rounded-lg bg-black/3 border border-border/30">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong>Data:</strong> Parcel-level records from county assessor data,
            filtered by spatial intersection, owner proximity, and statewide owner
            queries. <strong>Parcels</strong> = count of matched parcel polygons.{" "}
            <strong>Acreage</strong> = sum of LAND_ACRES field.{" "}
            <strong>Land Value</strong> = sum of TOT_VAL (total assessed value).{" "}
            <strong>Cost/Acre</strong> = TOT_VAL / LAND_ACRES for each site.
            Bar segments show per-owner breakdown using the same color palette
            as the map's Owner symbology mode. Cost/Acre uses a single bar
            (not segmented) since it's a derived ratio.
          </p>
        </div>
      )}

      {/* Metric Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2">
        {METRIC_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveMetric(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all
              ${
                activeMetric === tab.key
                  ? "bg-terracotta/10 text-terracotta border border-terracotta/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/3 border border-transparent"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Custom stacked bar chart */}
      <div
        className="px-4 pb-3 overflow-y-auto relative flex-1"
      >
        <div className="flex flex-col" style={{ gap: rowGap }}>
          {rows.map((row) => {
            const totalVal = activeMetric === "costPerAcre" ? row.costPerAcre : (row[activeMetric] as number);
            const barWidthPct = maxVal > 0 ? (totalVal / maxVal) * 100 : 0;
            const isCostPerAcre = activeMetric === "costPerAcre";

            return (
              <div key={row.siteId} className="flex items-center gap-2">
                {/* Site label */}
                <div
                  className="text-[11px] text-right shrink-0 truncate"
                  style={{
                    width: labelWidth,
                    fontFamily: "'DM Sans', sans-serif",
                    color: "#44403c",
                  }}
                  title={row.fullName}
                >
                  {row.name}
                </div>

                {/* Bar container */}
                <div className="flex-1 relative" style={{ height: barHeight }}>
                  {/* Background track */}
                  <div
                    className="absolute inset-0 rounded-r-md"
                    style={{ background: "oklch(0.95 0.005 80)" }}
                  />

                  {/* Segmented bar */}
                  <div
                    className="absolute top-0 left-0 h-full flex rounded-r-md overflow-hidden transition-all duration-300"
                    style={{ width: `${Math.max(barWidthPct, 0.5)}%` }}
                  >
                    {isCostPerAcre ? (
                      /* Cost/Acre: single bar colored by company */
                      <div
                        className="h-full w-full"
                        style={{ background: row.companyColor, opacity: 0.8 }}
                      />
                    ) : (
                      /* Segmented by owner */
                      row.segments.map((seg) => {
                        const segVal = seg[activeMetric as "parcels" | "acres" | "value"];
                        const segPct = totalVal > 0 ? (segVal / totalVal) * 100 : 0;
                        if (segPct < 0.3) return null;
                        return (
                          <div
                            key={seg.owner}
                            className="h-full transition-opacity duration-150 cursor-pointer"
                            style={{
                              width: `${segPct}%`,
                              background: seg.color,
                              opacity:
                                hoveredSegment &&
                                hoveredSegment.siteId === row.siteId &&
                                hoveredSegment.owner !== seg.owner
                                  ? 0.4
                                  : 0.8,
                              minWidth: 2,
                            }}
                            onMouseEnter={(e) =>
                              setHoveredSegment({
                                siteId: row.siteId,
                                owner: seg.owner,
                                x: e.clientX,
                                y: e.clientY,
                              })
                            }
                            onMouseLeave={() => setHoveredSegment(null)}
                          />
                        );
                      })
                    )}
                  </div>

                  {/* Value label */}
                  <div
                    className="absolute right-2 top-0 h-full flex items-center text-[10px] font-mono"
                    style={{ color: barWidthPct > 60 ? "white" : "#78716c" }}
                  >
                    {currentTab.format(totalVal)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hover tooltip */}
        {hoveredSegment && (() => {
          const row = rows.find((r) => r.siteId === hoveredSegment.siteId);
          const seg = row?.segments.find((s) => s.owner === hoveredSegment.owner);
          if (!row || !seg) return null;
          return (
            <div
              className="fixed z-[9999] glass-panel rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none"
              style={{
                left: hoveredSegment.x + 12,
                top: hoveredSegment.y - 40,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: seg.color }}
                />
                <span className="font-semibold text-foreground truncate max-w-[200px]">
                  {seg.owner}
                </span>
              </div>
              <div className="text-muted-foreground">{row.fullName}</div>
              <div className="mt-1 font-mono text-foreground space-y-0.5">
                <div>{seg.parcels} parcels</div>
                <div>{formatAcres(seg.acres)}</div>
                <div>{formatCurrency(seg.value)}</div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Owner legend */}
      {activeMetric !== "costPerAcre" && legendOwners.length > 1 && (
        <div className="px-4 pb-3 pt-1 border-t border-border/30">
          <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-medium">
            Owners
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {legendOwners.map(([owner, { color }]) => (
              <div key={owner} className="flex items-center gap-1">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: color }}
                />
                <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                  {owner}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* X-axis label */}
      <div className="px-4 pb-2 text-center">
        <span className="text-[10px] text-muted-foreground font-mono">
          {currentTab.label}
        </span>
      </div>
    </div>
  );
}
