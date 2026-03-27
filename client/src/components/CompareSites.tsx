/*
 * Cartographic Studio Design — Compare Sites Summary View
 * Frosted glass panel with horizontal bar charts comparing selected sites
 * side-by-side on key metrics: Parcels, Acreage, Land Value, Cost/Acre.
 * Uses Recharts BarChart with the app's DM Sans / DM Mono font system.
 * Includes a brief introduction and a methods toggle per user preference.
 */

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BarChart3, X, Info, ChevronDown, ChevronUp } from "lucide-react";
import type { Site } from "@/lib/types";
import { formatCurrency, formatAcres, formatNumber } from "@/lib/format";
import { getParentCompany, COMPANY_CONFIG } from "@/lib/companies";

interface CompareSitesProps {
  sites: Site[];
  selectedSiteIds: Set<string>;
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

export function CompareSites({ sites, selectedSiteIds, onClose }: CompareSitesProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("acres");
  const [showMethods, setShowMethods] = useState(false);

  const selectedSites = useMemo(() => {
    return sites.filter((s) => selectedSiteIds.has(s.id));
  }, [sites, selectedSiteIds]);

  const chartData = useMemo(() => {
    return selectedSites.map((site) => {
      const m = site.metrics;
      const shortName =
        site.currentName?.split(",")[0] || site.location || site.primaryOwner;
      const company = getParentCompany(site);
      const color = COMPANY_CONFIG[company]?.color || "#6b7280";

      return {
        name: shortName.length > 18 ? shortName.slice(0, 16) + "…" : shortName,
        fullName: site.currentName || site.label,
        company,
        color,
        parcels: m.parcelCount,
        acres: m.totalAcres,
        value: m.totalValue,
        costPerAcre: m.totalAcres > 0 ? m.totalValue / m.totalAcres : 0,
      };
    });
  }, [selectedSites]);

  const currentTab = METRIC_TABS.find((t) => t.key === activeMetric)!;

  if (selectedSites.length < 2) return null;

  return (
    <div className="glass-panel rounded-xl w-full max-w-[700px] flex flex-col overflow-hidden">
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
          with each site. Color indicates parent company.
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
            Sites with $0 assessed value may reflect tax-exempt or
            recently-acquired parcels.
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

      {/* Chart */}
      <div className="px-4 pb-4" style={{ height: Math.max(180, selectedSites.length * 40 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="oklch(0.85 0.01 80)"
            />
            <XAxis
              type="number"
              tickFormatter={(v: number) => currentTab.format(v)}
              tick={{ fontSize: 10, fontFamily: "'DM Mono', monospace", fill: "#78716c" }}
              axisLine={{ stroke: "oklch(0.85 0.01 80)" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 11, fontFamily: "'DM Sans', sans-serif", fill: "#44403c" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="glass-panel rounded-lg px-3 py-2 text-xs shadow-lg">
                    <div className="font-semibold text-foreground mb-1">
                      {d.fullName}
                    </div>
                    <div className="text-muted-foreground">
                      {d.company}
                    </div>
                    <div className="mt-1.5 font-mono text-foreground">
                      {currentTab.label}: {currentTab.format(d[activeMetric])}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey={activeMetric} radius={[0, 4, 4, 0]} barSize={24}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
