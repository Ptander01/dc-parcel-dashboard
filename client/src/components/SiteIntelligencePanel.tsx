/*
 * Cartographic Studio Design — Site Intelligence Panel
 *
 * Combined floating panel merging Timeline, Phase Details, and Parcel Table
 * into a single tabbed interface. Replaces the separate AcquisitionTimeline
 * and PhaseDrilldown panels from Sprint 2.
 *
 * Tab 1: Timeline (Gantt) — horizontal scrollable Gantt with phase swim lanes
 *        + milestone markers. Multi-site comparison when 2+ sites selected.
 * Tab 2: Phase Details — expanded phase cards with enriched detail pills,
 *        site-level totals banner, and per-phase parcel lists.
 * Tab 3: Parcels — sortable, filterable parcel attribute table grouped by phase.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Clock,
  Info,
  X,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Users,
  Layers,
  Zap,
  Building,
  Calendar,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  DollarSign,
  Cpu,
  Thermometer,
  MapPin,
  Table2,
  Activity,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FloatingPanel } from "./FloatingPanel";
import type { TimelineData, TimelineMilestone, ParcelFeature, Site } from "@/lib/types";
import type { SitePhaseResult, PhaseWithMetrics, SiteTotals } from "@/hooks/usePhases";
import { safeNumber, formatAcres, formatCurrency } from "@/lib/format";
import { getParentCompany, COMPANY_CONFIG } from "@/lib/companies";

/* ═══════════════════════════════════════════════════════════════════════════
 *  SHARED TYPES & HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

interface SiteIntelligencePanelProps {
  sites: Site[];
  selectedSiteIds: Set<string>;
  timelineData: TimelineData | null;
  parcels: ParcelFeature[];
  phaseResult: SitePhaseResult | null;
  hasPhasing: (siteId: string) => boolean;
  highlightedPhase: string | null;
  onHighlightPhase: (phaseId: string | null) => void;
  onHoverParcel: (objectId: number | null) => void;
  onClickParcel: (parcel: ParcelFeature | null) => void;
  onClose: () => void;
}

/* ── Category grouping for timeline milestones ── */
const CATEGORY_CONFIG: {
  id: string;
  label: string;
  color: string;
  stageGates: string[];
}[] = [
  {
    id: "land",
    label: "Land Acquisition",
    color: "#10b981",
    stageGates: ["Land Acquisition", "Land Acquisition to First Power"],
  },
  {
    id: "zoning",
    label: "Zoning & Permitting",
    color: "#8b5cf6",
    stageGates: ["Zoning/Permitting", "Environmental Review", "Air Permit"],
  },
  {
    id: "utility",
    label: "Utility & Energy",
    color: "#f59e0b",
    stageGates: ["Utility/Energy", "Utility/Energy ", "Utility/Energy Contract", "First Power"],
  },
  {
    id: "construction",
    label: "Construction",
    color: "#3b82f6",
    stageGates: ["Construction"],
  },
  {
    id: "project",
    label: "Project & Strategy",
    color: "#06b6d4",
    stageGates: ["Project Proposal", "Project Updates", "Incentives"],
  },
  {
    id: "community",
    label: "Community & Other",
    color: "#f97316",
    stageGates: ["Community Opposition"],
  },
];

function getCategoryForStageGate(stageGate: string): (typeof CATEGORY_CONFIG)[0] {
  const sg = stageGate.trim();
  for (const cat of CATEGORY_CONFIG) {
    if (cat.stageGates.includes(sg)) return cat;
  }
  return { id: "other", label: "Other", color: "#6b7280", stageGates: [] };
}

interface PlottedMilestone {
  date: string;
  timestamp: number;
  year: number;
  month: number;
  stageGate: string;
  category: (typeof CATEGORY_CONFIG)[0];
  milestone: string;
  detail: string;
  sourceLink?: string;
  actionedBy?: string;
  siteId: string;
  siteName: string;
  siteColor: string;
}

function parseDate(d: string): number {
  const t = new Date(d + "T00:00:00Z").getTime();
  return isNaN(t) ? 0 : t;
}

function formatDateLabel(d: string): string {
  try {
    const dt = new Date(d + "T00:00:00Z");
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}

function formatDateFull(d: string): string {
  try {
    const dt = new Date(d + "T00:00:00Z");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
}

/* ── Build plotted milestones from timeline data ── */
function buildPlottedMilestones(
  sites: Site[],
  selectedSiteIds: Set<string>,
  timelineData: TimelineData | null,
  parcels: ParcelFeature[]
): { milestones: PlottedMilestone[]; dataSource: "timeline" | "parcel" } {
  const selectedSites = sites.filter((s) => selectedSiteIds.has(s.id));

  const richMilestones: PlottedMilestone[] = [];
  for (const site of selectedSites) {
    const ms = timelineData?.[site.id];
    if (!ms || ms.length === 0) continue;
    const company = getParentCompany(site);
    const color = COMPANY_CONFIG[company]?.color || "#6b7280";
    const name = site.currentName || site.label;

    for (const m of ms) {
      if (!m.date) continue;
      richMilestones.push({
        date: m.date,
        timestamp: parseDate(m.date),
        year: m.year || new Date(m.date + "T00:00:00Z").getUTCFullYear(),
        month: m.month || 1,
        stageGate: m.stageGate,
        category: getCategoryForStageGate(m.stageGate),
        milestone: m.milestone,
        detail: m.detail,
        sourceLink: m.sourceLink || undefined,
        actionedBy: m.actionedBy || undefined,
        siteId: site.id,
        siteName: name,
        siteColor: color,
      });
    }
  }

  if (richMilestones.length > 0) {
    const seen = new Set<string>();
    const unique = richMilestones.filter((m) => {
      const key = `${m.date}|${m.milestone}|${m.siteId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => a.timestamp - b.timestamp);
    return { milestones: unique, dataSource: "timeline" };
  }

  // Fallback: TAX_YR from parcels
  const siteParcels = parcels.filter((p) => selectedSiteIds.has(p.properties._siteId));
  const byYearSite = new Map<string, { parcels: ParcelFeature[]; site: Site }>();
  for (const p of siteParcels) {
    const yr = p.properties.TAX_YR;
    if (!yr || yr < 1990) continue;
    const site = selectedSites.find((s) => s.id === p.properties._siteId);
    if (!site) continue;
    const key = `${yr}-${site.id}`;
    if (!byYearSite.has(key)) byYearSite.set(key, { parcels: [], site });
    byYearSite.get(key)!.parcels.push(p);
  }

  const fallback: PlottedMilestone[] = [];
  for (const [, { parcels: ps, site }] of Array.from(byYearSite.entries())) {
    const yr = ps[0].properties.TAX_YR!;
    const totalAcres = ps.reduce((s: number, p: ParcelFeature) => s + (p.properties.LAND_ACRES || 0), 0);
    const company = getParentCompany(site);
    const color = COMPANY_CONFIG[company]?.color || "#6b7280";
    fallback.push({
      date: `${yr}-06-01`,
      timestamp: new Date(`${yr}-06-01T00:00:00Z`).getTime(),
      year: yr,
      month: 6,
      stageGate: "Land Acquisition",
      category: CATEGORY_CONFIG[0],
      milestone: `${ps.length} parcel${ps.length !== 1 ? "s" : ""} — ${totalAcres.toFixed(0)} ac`,
      detail: `Tax year ${yr}: ${ps.length} parcel${ps.length !== 1 ? "s" : ""} totaling ${totalAcres.toFixed(1)} acres.`,
      siteId: site.id,
      siteName: site.currentName || site.label,
      siteColor: color,
    });
  }
  fallback.sort((a, b) => a.timestamp - b.timestamp);
  return { milestones: fallback, dataSource: "parcel" };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  TAB 1: GANTT TIMELINE
 * ═══════════════════════════════════════════════════════════════════════════ */

function GanttTimeline({
  milestones,
  allMilestones,
  selectedSites,
  phaseResult,
  activeFilter,
  setActiveFilter,
  viewMode,
  dataSource,
}: {
  milestones: PlottedMilestone[];
  allMilestones: PlottedMilestone[];
  selectedSites: Site[];
  phaseResult: SitePhaseResult | null;
  activeFilter: string | null;
  setActiveFilter: (f: string | null) => void;
  viewMode: "single" | "compare";
  dataSource: "timeline" | "parcel";
}) {
  const [hoveredIdx, setHoveredIdx] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  // Compute time bounds
  const { minTime, maxTime, yearMarkers } = useMemo(() => {
    if (milestones.length === 0) return { minTime: 0, maxTime: 1, yearMarkers: [] as any[] };
    const min = milestones[0].timestamp;
    const max = milestones[milestones.length - 1].timestamp;
    const pad = Math.max((max - min) * 0.05, 86400000 * 30);
    const minT = min - pad;
    const maxT = max + pad;

    const minYear = new Date(minT).getUTCFullYear();
    const maxYear = new Date(maxT).getUTCFullYear();
    const markers: { year: number; pct: number; label: string; isYear: boolean }[] = [];
    const quarterLabels = ["", "Q1", "Q2", "Q3", "Q4"];
    for (let y = minYear; y <= maxYear + 1; y++) {
      for (let q = 0; q < 4; q++) {
        const month = q * 3 + 1;
        const t = new Date(`${y}-${String(month).padStart(2, "0")}-01T00:00:00Z`).getTime();
        const pct = ((t - minT) / (maxT - minT)) * 100;
        if (pct >= -2 && pct <= 102) {
          const isYear = q === 0;
          markers.push({ year: y, pct: Math.max(0, Math.min(100, pct)), label: isYear ? String(y) : quarterLabels[q + 1], isYear });
        }
      }
    }
    return { minTime: minT, maxTime: maxT, yearMarkers: markers };
  }, [milestones]);

  const timeSpan = maxTime - minTime;

  // Active categories present in data
  const activeCategories = useMemo(() => {
    const ids = new Set(allMilestones.map((m) => m.category.id));
    return CATEGORY_CONFIG.filter((c) => ids.has(c.id));
  }, [allMilestones]);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el?.removeEventListener("scroll", checkScroll);
  }, [checkScroll, milestones]);

  const scrollRight = () => scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" });
  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" });

  // Multi-site groups
  const siteGroups = useMemo(() => {
    if (viewMode !== "compare") return [];
    const groups = new Map<string, { site: Site; milestones: PlottedMilestone[]; color: string }>();
    for (const site of selectedSites) {
      const company = getParentCompany(site);
      const color = COMPANY_CONFIG[company]?.color || "#6b7280";
      groups.set(site.id, { site, milestones: [], color });
    }
    for (const m of milestones) {
      const g = groups.get(m.siteId);
      if (g) g.milestones.push(m);
    }
    return Array.from(groups.values()).filter((g) => g.milestones.length > 0);
  }, [milestones, selectedSites, viewMode]);

  // Phase lanes for Gantt (when phaseResult available and single-site mode)
  const phaseLanes = useMemo(() => {
    if (viewMode !== "single" || !phaseResult) return null;
    return phaseResult.phases.map((phase) => {
      const energization = phase.details.energization;
      let startDate: number | null = null;
      let endDate: number | null = null;

      // Try to parse energization as a date range
      if (energization) {
        const parts = energization.split(/[–—-]/);
        if (parts.length >= 2) {
          const s = parseDate(parts[0].trim());
          const e = parseDate(parts[1].trim());
          if (s > 0) startDate = s;
          if (e > 0) endDate = e;
        } else {
          const d = parseDate(energization.trim());
          if (d > 0) { startDate = d; endDate = d; }
        }
      }

      return { phase, startDate, endDate };
    });
  }, [viewMode, phaseResult]);

  if (milestones.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-foreground/70">No timeline data available for the selected sites.</p>
        <p className="text-xs text-foreground/50 mt-1">Only 12 of 34 sites have detailed timeline milestones.</p>
      </div>
    );
  }

  const isCompare = viewMode === "compare" && siteGroups.length > 0;
  const LANE_HEIGHT = 88;
  const LANE_GAP = 6;
  const LABEL_WIDTH = 170;
  const HEADER_HEIGHT = 32;
  const TIMELINE_WIDTH_PX = isCompare
    ? Math.max(milestones.length * 80, 1400)
    : Math.max(milestones.length * 140, 1200);

  /* ── Compare mode rendering ── */
  if (isCompare) {
    const totalHeight = HEADER_HEIGHT + siteGroups.length * (LANE_HEIGHT + LANE_GAP) + 40;

    return (
      <div className="relative pt-2 pb-4">
        {canScrollLeft && (
          <button onClick={scrollLeft} className="absolute left-[168px] top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors rotate-180">
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        )}
        {canScrollRight && (
          <button onClick={scrollRight} className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors">
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        )}

        <div className="flex">
          {/* Fixed site labels */}
          <div className="shrink-0" style={{ width: `${LABEL_WIDTH}px` }}>
            <div style={{ height: `${HEADER_HEIGHT}px` }} className="flex items-end px-3 pb-1">
              <span className="text-[9px] uppercase tracking-widest text-foreground/70 font-semibold">Sites</span>
            </div>
            {siteGroups.map((group, idx) => (
              <div
                key={group.site.id}
                className="flex items-center gap-2 px-3 border-r border-border/20"
                style={{
                  height: `${LANE_HEIGHT}px`,
                  marginBottom: idx < siteGroups.length - 1 ? `${LANE_GAP}px` : 0,
                  backgroundColor: `${group.color}06`,
                }}
              >
                <div className="w-3 h-3 rounded-full shrink-0 border-2 border-white shadow-sm" style={{ backgroundColor: group.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-foreground truncate leading-tight">
                    {group.site.currentName || group.site.label}
                  </div>
                  <div className="text-[9px] text-foreground/50 truncate">
                    {group.milestones.length} milestone{group.milestones.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Scrollable timeline area */}
          <div ref={scrollRef} className="overflow-x-auto overflow-y-visible custom-scrollbar flex-1" style={{ paddingBottom: "8px" }}>
            <div className="relative" style={{ width: `${TIMELINE_WIDTH_PX}px`, height: `${totalHeight}px` }}>
              {/* Grid lines */}
              {yearMarkers.map((marker) => (
                <div key={`grid-${marker.year}-${marker.label}`} className="absolute top-0 bottom-0" style={{ left: `${marker.pct}%` }}>
                  <div className="w-px h-full" style={{ backgroundColor: marker.isYear ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.07)" }} />
                </div>
              ))}

              {/* Year labels */}
              <div className="absolute left-0 right-0" style={{ top: 0, height: `${HEADER_HEIGHT}px` }}>
                {yearMarkers.map((marker) => (
                  <span
                    key={`hdr-${marker.year}-${marker.label}`}
                    className={`absolute -translate-x-1/2 select-none ${marker.isYear ? "text-[11px] font-bold text-foreground/60 bottom-1" : "text-[9px] font-medium text-foreground/35 bottom-2"}`}
                    style={{ left: `${marker.pct}%` }}
                  >
                    {marker.label}
                  </span>
                ))}
              </div>

              {/* Per-site swim lanes */}
              {siteGroups.map((group, laneIdx) => {
                const laneTop = HEADER_HEIGHT + laneIdx * (LANE_HEIGHT + LANE_GAP);
                const axisY = laneTop + LANE_HEIGHT / 2;

                return (
                  <div key={`lane-${group.site.id}`}>
                    <div className="absolute left-0 right-0 rounded-sm" style={{ top: `${laneTop}px`, height: `${LANE_HEIGHT}px`, backgroundColor: `${group.color}06`, borderTop: `1px solid ${group.color}15`, borderBottom: `1px solid ${group.color}15` }} />
                    <div className="absolute left-0 right-0 h-[2px] rounded-full" style={{ top: `${axisY}px`, backgroundColor: `${group.color}25` }} />

                    {group.milestones.map((m, mIdx) => {
                      const leftPct = timeSpan > 0 ? ((m.timestamp - minTime) / timeSpan) * 100 : 50;
                      const hoverKey = `${group.site.id}-${mIdx}`;
                      const isHovered = hoveredIdx === hoverKey;
                      const isAbove = mIdx % 2 === 0;
                      const labelOffsetY = isAbove ? -28 : 14;

                      return (
                        <div key={`ms-${group.site.id}-${mIdx}`}>
                          <div className="absolute w-px transition-colors" style={{ left: `${leftPct}%`, top: isAbove ? `${axisY + labelOffsetY + 16}px` : `${axisY + 4}px`, height: isAbove ? `${-labelOffsetY - 16 + 2}px` : `${labelOffsetY - 4}px`, backgroundColor: isHovered ? m.category.color : `${m.category.color}30` }} />
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm cursor-pointer transition-all"
                            style={{ left: `${leftPct}%`, top: `${axisY + 1}px`, width: isHovered ? "13px" : "9px", height: isHovered ? "13px" : "9px", backgroundColor: m.category.color, boxShadow: isHovered ? `0 0 0 3px ${m.category.color}30, 0 2px 6px rgba(0,0,0,0.2)` : "0 1px 2px rgba(0,0,0,0.15)", zIndex: isHovered ? 30 : 10 }}
                            onMouseEnter={() => setHoveredIdx(hoverKey)}
                            onMouseLeave={() => setHoveredIdx("")}
                          />
                          <div
                            className="absolute -translate-x-1/2 flex flex-col items-center cursor-pointer"
                            style={{ left: `${leftPct}%`, top: `${axisY + labelOffsetY}px`, opacity: isHovered ? 1 : 0.75, zIndex: isHovered ? 25 : 5, maxWidth: isHovered ? "160px" : "90px", transition: "opacity 0.15s, max-width 0.2s" }}
                            onMouseEnter={() => setHoveredIdx(hoverKey)}
                            onMouseLeave={() => setHoveredIdx("")}
                          >
                            <span className="text-[8px] font-mono text-foreground/55 whitespace-nowrap">{formatDateLabel(m.date)}</span>
                            <span className={`text-[9px] font-semibold text-center leading-tight ${isHovered ? "line-clamp-2" : "line-clamp-1"}`} style={{ color: m.category.color }}>{m.milestone}</span>
                          </div>

                          {isHovered && (
                            <div className="absolute z-50" style={{ left: `${leftPct}%`, top: `${axisY + 16}px`, transform: "translateX(-50%)" }}>
                              <MilestoneTooltip m={m} siteColor={group.color} onHover={() => setHoveredIdx(hoverKey)} onLeave={() => setHoveredIdx("")} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Single-site mode rendering ── */
  const singleAxisTop = 8 + activeCategories.length * 28 + 20;

  return (
    <div className="relative px-4 pt-3 pb-4">
      {canScrollLeft && (
        <button onClick={scrollLeft} className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors rotate-180">
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      )}
      {canScrollRight && (
        <button onClick={scrollRight} className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors">
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      )}

      <div ref={scrollRef} className="overflow-x-auto overflow-y-visible custom-scrollbar" style={{ paddingBottom: "8px" }}>
        <div className="relative" style={{ width: `${TIMELINE_WIDTH_PX}px`, minHeight: "240px" }}>
          {/* Grid lines */}
          {yearMarkers.map((marker) => (
            <div key={`grid-${marker.year}-${marker.label}`} className="absolute top-0 bottom-0" style={{ left: `${marker.pct}%` }}>
              <div className="w-px h-full" style={{ backgroundColor: marker.isYear ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.07)" }} />
            </div>
          ))}

          {/* Category swim-lane bands */}
          {activeCategories.map((cat, catIdx) => {
            const catMs = milestones.filter((m) => m.category.id === cat.id);
            if (catMs.length === 0) return null;
            const catMin = catMs[0].timestamp;
            const catMax = catMs[catMs.length - 1].timestamp;
            const leftPct = Math.max(((catMin - minTime) / timeSpan) * 100 - 0.5, 0);
            const rightPct = Math.min(((catMax - minTime) / timeSpan) * 100 + 0.5, 100);
            const widthPct = rightPct - leftPct;
            const topOffset = 8 + catIdx * 28;
            return (
              <div
                key={`lane-${cat.id}`}
                className="absolute rounded-full flex items-center px-3 select-none"
                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 3)}%`, top: `${topOffset}px`, height: "22px", backgroundColor: `${cat.color}20`, borderLeft: `3px solid ${cat.color}` }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: cat.color }}>{cat.label}</span>
              </div>
            );
          })}

          {/* Main timeline axis */}
          <div className="absolute left-0 right-0 h-[3px] rounded-full bg-border/30" style={{ top: `${singleAxisTop}px` }} />

          {/* Milestone nodes */}
          {milestones.map((m, idx) => {
            const leftPct = timeSpan > 0 ? ((m.timestamp - minTime) / timeSpan) * 100 : 50;
            const isHovered = hoveredIdx === String(idx);
            const isAbove = idx % 2 === 0;
            const labelTop = isAbove ? singleAxisTop - 56 : singleAxisTop + 20;

            return (
              <div key={`ms-${idx}`}>
                <div className="absolute w-px transition-colors" style={{ left: `${leftPct}%`, top: isAbove ? `${labelTop + 38}px` : `${singleAxisTop + 6}px`, height: isAbove ? `${singleAxisTop - labelTop - 38 + 2}px` : `${labelTop - singleAxisTop - 6}px`, backgroundColor: isHovered ? m.category.color : `${m.category.color}40` }} />
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm cursor-pointer transition-all z-10"
                  style={{ left: `${leftPct}%`, top: `${singleAxisTop + 1.5}px`, width: isHovered ? "14px" : "10px", height: isHovered ? "14px" : "10px", backgroundColor: m.category.color, boxShadow: isHovered ? `0 0 0 3px ${m.category.color}30, 0 2px 8px rgba(0,0,0,0.2)` : "0 1px 3px rgba(0,0,0,0.2)", zIndex: isHovered ? 30 : 10 }}
                  onMouseEnter={() => setHoveredIdx(String(idx))}
                  onMouseLeave={() => setHoveredIdx("")}
                />
                <div
                  className="absolute -translate-x-1/2 flex flex-col items-center cursor-pointer"
                  style={{ left: `${leftPct}%`, top: `${labelTop}px`, opacity: isHovered ? 1 : 0.8, zIndex: isHovered ? 25 : 5, maxWidth: isHovered ? "180px" : "110px", transition: "opacity 0.15s, max-width 0.2s" }}
                  onMouseEnter={() => setHoveredIdx(String(idx))}
                  onMouseLeave={() => setHoveredIdx("")}
                >
                  <span className="text-[9px] font-mono text-foreground/60 whitespace-nowrap">{formatDateLabel(m.date)}</span>
                  <span className={`text-[10px] font-semibold text-center leading-tight ${isHovered ? "line-clamp-3" : "line-clamp-1"}`} style={{ color: m.category.color }}>{m.milestone}</span>
                </div>

                {isHovered && (
                  <div className="absolute z-50" style={{ left: `${leftPct}%`, top: `${singleAxisTop + 20}px`, transform: "translateX(-50%)" }}>
                    <MilestoneTooltip m={m} onHover={() => setHoveredIdx(String(idx))} onLeave={() => setHoveredIdx("")} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Year labels at bottom */}
          <div className="absolute left-0 right-0" style={{ top: `${singleAxisTop + 50}px`, height: "20px" }}>
            {yearMarkers.map((marker) => (
              <span
                key={`yr-${marker.year}-${marker.label}`}
                className={`absolute -translate-x-1/2 select-none ${marker.isYear ? "text-[11px] font-bold text-foreground/65" : "text-[9px] font-medium text-foreground/40"}`}
                style={{ left: `${marker.pct}%` }}
              >
                {marker.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Shared milestone tooltip ── */
function MilestoneTooltip({ m, siteColor, onHover, onLeave }: { m: PlottedMilestone; siteColor?: string; onHover: () => void; onLeave: () => void }) {
  return (
    <div className="bg-white rounded-lg shadow-xl border border-border/40 p-3 min-w-[240px] max-w-[320px] pointer-events-auto" onMouseEnter={onHover} onMouseLeave={onLeave}>
      {siteColor && (
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: siteColor }} />
          <span className="text-[10px] font-semibold text-foreground truncate">{m.siteName}</span>
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">{formatDateFull(m.date)}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.category.color }} />
        <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: m.category.color }}>{m.stageGate}</span>
        {!siteColor && <span className="text-[10px] text-muted-foreground ml-auto font-mono">{formatDateFull(m.date)}</span>}
      </div>
      <div className="text-xs font-semibold text-foreground mb-1">{m.milestone}</div>
      {m.detail && <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 line-clamp-4">{m.detail}</p>}
      {m.actionedBy && <p className="text-[10px] text-muted-foreground/70 mt-1 italic">By: {m.actionedBy}</p>}
      {m.sourceLink && (
        <a href={m.sourceLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1.5 hover:underline" onClick={(e) => e.stopPropagation()}>
          <ExternalLink className="w-3 h-3 text-terracotta" />
          <span className="text-[10px] text-terracotta">View source</span>
        </a>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  TAB 2: PHASE DETAILS
 * ═══════════════════════════════════════════════════════════════════════════ */

function PhaseDetailsTab({
  phaseResult,
  highlightedPhase,
  onHighlightPhase,
  onHoverParcel,
}: {
  phaseResult: SitePhaseResult;
  highlightedPhase: string | null;
  onHighlightPhase: (phaseId: string | null) => void;
  onHoverParcel: (objectId: number | null) => void;
}) {
  const [showUnassigned, setShowUnassigned] = useState(false);

  const handleToggleHighlight = useCallback(
    (phaseId: string) => {
      onHighlightPhase(highlightedPhase === phaseId ? null : phaseId);
    },
    [highlightedPhase, onHighlightPhase]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header summary */}
      <div className="px-4 pt-3 pb-2 border-b border-border/30 shrink-0">
        <p className="text-xs text-foreground/60 leading-relaxed">
          {phaseResult.displayName} — {phaseResult.phases.length} phase{phaseResult.phases.length !== 1 ? "s" : ""}, {phaseResult.totalParcels} parcel{phaseResult.totalParcels !== 1 ? "s" : ""}, {formatAcres(phaseResult.totalAcres)}
        </p>

        {/* Site-level totals banner */}
        {phaseResult.totals && <SiteTotalsBanner totals={phaseResult.totals} />}

        {/* Aggregate metrics */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <MetricBox label="Total Parcels" value={String(phaseResult.totalParcels)} />
          <MetricBox label="Total Acres" value={formatAcres(phaseResult.totalAcres)} />
          <MetricBox label="Total Value" value={phaseResult.totalValue > 0 ? formatCurrency(phaseResult.totalValue) : "\u2014"} />
        </div>

        {phaseResult.totals?.sources && phaseResult.totals.sources.length > 0 && (
          <div className="flex items-center gap-1.5 text-[9px] text-foreground/35 mt-2 italic">
            <Info className="w-2.5 h-2.5 shrink-0" />
            Sources: {phaseResult.totals.sources.join("; ")}
          </div>
        )}
      </div>

      {/* Phase cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {phaseResult.phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            isHighlighted={highlightedPhase === phase.id}
            onToggleHighlight={() => handleToggleHighlight(phase.id)}
            onHoverParcel={onHoverParcel}
          />
        ))}

        {/* Unassigned parcels */}
        {phaseResult.unassignedParcels.length > 0 && (
          <div className="rounded-lg border border-border/30 mt-2">
            <button className="w-full flex items-center gap-2 px-3 py-2.5 text-left" onClick={() => setShowUnassigned(!showUnassigned)}>
              <div className="w-3.5 h-3.5 rounded-full bg-gray-400/50 shrink-0" />
              <span className="text-sm font-medium text-foreground/60 flex-1">Unassigned Parcels</span>
              <span className="text-xs font-mono text-foreground/40">{phaseResult.unassignedParcels.length}</span>
              {showUnassigned ? <ChevronDown className="w-3.5 h-3.5 text-foreground/40" /> : <ChevronRight className="w-3.5 h-3.5 text-foreground/40" />}
            </button>
            {showUnassigned && (
              <div className="px-3 pb-3 border-t border-border/20">
                <p className="text-[10px] text-foreground/40 mt-2 mb-2">
                  These parcels belong to the site but aren't assigned to a specific phase yet.
                </p>
                <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
                  {phaseResult.unassignedParcels.map((p) => (
                    <ParcelRow key={p.properties.OBJECTID} parcel={p} phaseColor="#9ca3af" onHover={onHoverParcel} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-border/40 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-foreground/40">
          <MapPin className="w-3 h-3" />
          Click the eye icon to highlight a phase's parcels on the map
        </div>
      </div>
    </div>
  );
}

/* ── Site Totals Banner ── */
function SiteTotalsBanner({ totals }: { totals: SiteTotals }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 mt-3">
      {totals.estimatedMW && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-amber-700/70 font-medium">Power</div>
            <div className="text-xs font-bold text-amber-800">{totals.estimatedMW}</div>
          </div>
        </div>
      )}
      {totals.investmentTotal && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-emerald-700/70 font-medium">Investment</div>
            <div className="text-xs font-bold text-emerald-800">{totals.investmentTotal}</div>
          </div>
        </div>
      )}
      {totals.gpuTotal && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Cpu className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-blue-700/70 font-medium">GPUs</div>
            <div className="text-xs font-bold text-blue-800">{totals.gpuTotal}</div>
          </div>
        </div>
      )}
      {totals.energizationWindow && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-purple-700/70 font-medium">Timeline</div>
            <div className="text-xs font-bold text-purple-800">{totals.energizationWindow}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Phase Card ── */
function PhaseCard({
  phase,
  isHighlighted,
  onToggleHighlight,
  onHoverParcel,
}: {
  phase: PhaseWithMetrics;
  isHighlighted: boolean;
  onToggleHighlight: () => void;
  onHoverParcel: (objectId: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = (() => {
    const s = (phase.details.status || "").toLowerCase();
    if (s.includes("completion") || s.includes("operational") || s.includes("active")) return "bg-emerald-500";
    if (s.includes("construction") || s.includes("started")) return "bg-blue-500";
    if (s.includes("progress") || s.includes("approved")) return "bg-amber-500";
    return "bg-gray-400";
  })();

  const d = phase.details;

  return (
    <div
      className={`rounded-lg border transition-all duration-200 ${isHighlighted ? "border-current shadow-md" : "border-border/40 hover:border-border/60"}`}
      style={isHighlighted ? { borderColor: phase.color + "80" } : undefined}
    >
      <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
        <div className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/50" style={{ backgroundColor: phase.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{phase.label}</span>
            {d.status && (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-medium text-white uppercase tracking-wider ${statusColor}`}>
                {d.status.length > 40 ? d.status.slice(0, 38) + "…" : d.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-foreground/50">
            {d.power && <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{d.power}</span>}
            {d.buildings && <span className="flex items-center gap-0.5"><Building className="w-2.5 h-2.5" />{d.buildings}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-foreground/60 shrink-0">
          <span>{phase.parcelCount} parcel{phase.parcelCount !== 1 ? "s" : ""}</span>
          <span>{formatAcres(phase.totalAcres)}</span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleHighlight(); }}
          className={`p-1 rounded transition-colors ${isHighlighted ? "text-white" : "text-foreground/40 hover:text-foreground/70"}`}
          style={isHighlighted ? { color: phase.color } : undefined}
          title={isHighlighted ? "Hide phase on map" : "Show phase on map"}
        >
          {isHighlighted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-foreground/40 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-foreground/40 shrink-0" />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30">
          <p className="text-xs text-foreground/60 mt-2 mb-3 leading-relaxed">{phase.description}</p>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {d.power && <DetailPill icon={Zap} label="Power" value={d.power} />}
            {d.buildings && <DetailPill icon={Building} label="Buildings" value={d.buildings} />}
            {d.energization && <DetailPill icon={Calendar} label="Energization" value={d.energization} />}
            {d.investment && <DetailPill icon={DollarSign} label="Investment" value={d.investment} />}
            {d.gpuConfig && <DetailPill icon={Cpu} label="GPU Config" value={d.gpuConfig} />}
            {d.cooling && d.cooling !== "TBD" && <DetailPill icon={Thermometer} label="Cooling" value={d.cooling} />}
            {d.operator && <DetailPill icon={User} label="Operator" value={d.operator} />}
            {d.acreage && <DetailPill icon={MapPin} label="Expansion" value={d.acreage} />}
          </div>

          {d.source && (
            <div className="flex items-center gap-1.5 text-[9px] text-foreground/35 mb-3 italic">
              <Info className="w-2.5 h-2.5 shrink-0" />
              Source: {d.source}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-3">
            <MetricBox label="Parcels" value={String(phase.parcelCount)} />
            <MetricBox label="Acres" value={formatAcres(phase.totalAcres)} />
            <MetricBox label="Value" value={phase.totalValue > 0 ? formatCurrency(phase.totalValue) : "\u2014"} />
          </div>

          {phase.matchedParcels.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-foreground/40 mb-1.5">Parcels in this phase</div>
              <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar">
                {phase.matchedParcels.map((p) => (
                  <ParcelRow key={p.properties.OBJECTID} parcel={p} phaseColor={phase.color} onHover={onHoverParcel} />
                ))}
              </div>
            </div>
          )}

          {phase.unmatchedCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600">
              <AlertCircle className="w-3 h-3" />
              {phase.unmatchedCount} parcel{phase.unmatchedCount !== 1 ? "s" : ""} in phase data not found in current dataset
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPill({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-foreground/5 text-[11px]">
      <Icon className="w-3 h-3 text-foreground/40 shrink-0" />
      <span className="text-foreground/50">{label}:</span>
      <span className="text-foreground/80 font-medium leading-tight">{value}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-foreground/[0.03] px-2.5 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-foreground/40 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-foreground font-mono">{value}</div>
    </div>
  );
}

function ParcelRow({ parcel, phaseColor, onHover }: { parcel: ParcelFeature; phaseColor: string; onHover: (objectId: number | null) => void }) {
  const p = parcel.properties;
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/[0.03] transition-colors cursor-pointer"
      onMouseEnter={() => onHover(p.OBJECTID)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: phaseColor }} />
      <span className="text-[11px] font-mono text-foreground/50 w-[90px] truncate">{p.APN || "\u2014"}</span>
      <span className="text-[11px] text-foreground/70 flex-1 truncate">{p.OWN1_LAST || "\u2014"}</span>
      <span className="text-[11px] font-mono text-foreground/50">{formatAcres(p.LAND_ACRES || 0)}</span>
      <span className="text-[11px] font-mono text-foreground/50">{safeNumber(p.TOT_VAL) > 0 ? formatCurrency(safeNumber(p.TOT_VAL)) : "\u2014"}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  TAB 3: PARCELS TABLE
 * ═══════════════════════════════════════════════════════════════════════════ */

type SortKey = "APN" | "OWN1_LAST" | "CITY" | "STATE" | "LAND_ACRES" | "TOT_VAL" | "PHASE";

function ParcelsTab({
  parcels,
  phaseResult,
  onHoverParcel,
  onClickParcel,
}: {
  parcels: ParcelFeature[];
  phaseResult: SitePhaseResult | null;
  onHoverParcel: (objectId: number | null) => void;
  onClickParcel: (parcel: ParcelFeature | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("PHASE");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Build phase lookup: APN → phase
  const apnToPhase = useMemo(() => {
    const map = new Map<string, PhaseWithMetrics>();
    if (!phaseResult) return map;
    for (const phase of phaseResult.phases) {
      for (const p of phase.matchedParcels) {
        const apn = p.properties.APN?.trim();
        if (apn) map.set(apn, phase);
      }
    }
    return map;
  }, [phaseResult]);

  // Filter and sort
  const sortedParcels = useMemo(() => {
    let filtered = parcels;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = parcels.filter((p) => {
        const pr = p.properties;
        return (
          (pr.APN || "").toLowerCase().includes(q) ||
          (pr.OWN1_LAST || "").toLowerCase().includes(q) ||
          (pr.CITY || "").toLowerCase().includes(q) ||
          (pr.ADDR || "").toLowerCase().includes(q)
        );
      });
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let cmp = 0;
      const ap = a.properties;
      const bp = b.properties;

      switch (sortKey) {
        case "APN":
          cmp = (ap.APN || "").localeCompare(bp.APN || "");
          break;
        case "OWN1_LAST":
          cmp = (ap.OWN1_LAST || "").localeCompare(bp.OWN1_LAST || "");
          break;
        case "CITY":
          cmp = (ap.CITY || "").localeCompare(bp.CITY || "");
          break;
        case "STATE":
          cmp = (ap.STATE || "").localeCompare(bp.STATE || "");
          break;
        case "LAND_ACRES":
          cmp = (ap.LAND_ACRES || 0) - (bp.LAND_ACRES || 0);
          break;
        case "TOT_VAL":
          cmp = safeNumber(ap.TOT_VAL) - safeNumber(bp.TOT_VAL);
          break;
        case "PHASE": {
          const phaseA = apnToPhase.get(ap.APN?.trim() || "");
          const phaseB = apnToPhase.get(bp.APN?.trim() || "");
          const labelA = phaseA?.label || "zzz";
          const labelB = phaseB?.label || "zzz";
          cmp = labelA.localeCompare(labelB);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [parcels, search, sortKey, sortDir, apnToPhase]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-foreground/30" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-terracotta" /> : <ArrowDown className="w-3 h-3 text-terracotta" />;
  };

  // CSV export
  const exportCsv = useCallback(() => {
    const headers = ["APN", "Owner", "City", "State", "Acres", "Total Value", "Address", "Phase"];
    const rows = sortedParcels.map((p) => {
      const pr = p.properties;
      const phase = apnToPhase.get(pr.APN?.trim() || "");
      return [
        pr.APN || "",
        pr.OWN1_LAST || "",
        pr.CITY || "",
        pr.STATE || "",
        String(pr.LAND_ACRES || 0),
        String(safeNumber(pr.TOT_VAL)),
        pr.ADDR || "",
        phase?.label || "Unassigned",
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parcels_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedParcels, apnToPhase]);

  return (
    <div className="flex flex-col h-full">
      {/* Search + controls */}
      <div className="px-3 pt-3 pb-2 border-b border-border/30 shrink-0 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/40" />
          <input
            type="text"
            placeholder="Search parcels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border/40 bg-white/50 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-terracotta/30"
          />
        </div>
        <span className="text-[10px] text-foreground/50 font-mono whitespace-nowrap">
          {sortedParcels.length} record{sortedParcels.length !== 1 ? "s" : ""}
        </span>
        <button onClick={exportCsv} className="p-1.5 rounded-md hover:bg-black/5 transition-colors" title="Export CSV">
          <Download className="w-3.5 h-3.5 text-foreground/50" />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10">
            <tr className="border-b border-border/30">
              {phaseResult && (
                <th className="px-2 py-2 text-left font-semibold text-foreground/60 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("PHASE")}>
                  <div className="flex items-center gap-1">Phase <SortIcon col="PHASE" /></div>
                </th>
              )}
              <th className="px-2 py-2 text-left font-semibold text-foreground/60 cursor-pointer select-none" onClick={() => handleSort("APN")}>
                <div className="flex items-center gap-1">APN <SortIcon col="APN" /></div>
              </th>
              <th className="px-2 py-2 text-left font-semibold text-foreground/60 cursor-pointer select-none" onClick={() => handleSort("OWN1_LAST")}>
                <div className="flex items-center gap-1">Owner <SortIcon col="OWN1_LAST" /></div>
              </th>
              <th className="px-2 py-2 text-left font-semibold text-foreground/60 cursor-pointer select-none" onClick={() => handleSort("CITY")}>
                <div className="flex items-center gap-1">City <SortIcon col="CITY" /></div>
              </th>
              <th className="px-2 py-2 text-right font-semibold text-foreground/60 cursor-pointer select-none" onClick={() => handleSort("LAND_ACRES")}>
                <div className="flex items-center justify-end gap-1">Acres <SortIcon col="LAND_ACRES" /></div>
              </th>
              <th className="px-2 py-2 text-right font-semibold text-foreground/60 cursor-pointer select-none" onClick={() => handleSort("TOT_VAL")}>
                <div className="flex items-center justify-end gap-1">Value <SortIcon col="TOT_VAL" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedParcels.map((p) => {
              const pr = p.properties;
              const phase = apnToPhase.get(pr.APN?.trim() || "");
              return (
                <tr
                  key={pr.OBJECTID}
                  className="border-b border-border/15 hover:bg-foreground/[0.02] transition-colors cursor-pointer"
                  onMouseEnter={() => onHoverParcel(pr.OBJECTID)}
                  onMouseLeave={() => onHoverParcel(null)}
                  onClick={() => onClickParcel(p)}
                >
                  {phaseResult && (
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: phase?.color || "#9ca3af" }} />
                        <span className="text-foreground/60 truncate max-w-[100px]">{phase?.label || "Unassigned"}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-2 py-1.5 font-mono text-foreground/60">{pr.APN || "\u2014"}</td>
                  <td className="px-2 py-1.5 text-foreground/70 truncate max-w-[140px]">{pr.OWN1_LAST || "\u2014"}</td>
                  <td className="px-2 py-1.5 text-foreground/60">{pr.CITY || "\u2014"}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-foreground/60">{formatAcres(pr.LAND_ACRES || 0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-foreground/60">{safeNumber(pr.TOT_VAL) > 0 ? formatCurrency(safeNumber(pr.TOT_VAL)) : "\u2014"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedParcels.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-foreground/50">
            {search ? "No parcels match your search." : "No parcels for the selected site."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  NO PHASE DATA PLACEHOLDER
 * ═══════════════════════════════════════════════════════════════════════════ */

function NoPhaseDataPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      <Layers className="w-8 h-8 text-foreground/20 mb-3" />
      <p className="text-sm font-medium text-foreground/60 mb-1">No Phase Data Available</p>
      <p className="text-xs text-foreground/40 max-w-[280px] leading-relaxed">
        Phase details are currently available for 5 sites: Stargate Abilene, South Bend AWS, Mt. Pleasant Microsoft, Memphis xAI, and Kansas City Google.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

export function SiteIntelligencePanel({
  sites,
  selectedSiteIds,
  timelineData,
  parcels,
  phaseResult,
  hasPhasing,
  highlightedPhase,
  onHighlightPhase,
  onHoverParcel,
  onClickParcel,
  onClose,
}: SiteIntelligencePanelProps) {
  const [activeTab, setActiveTab] = useState("timeline");
  const [showMethods, setShowMethods] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");

  const selectedSites = useMemo(() => sites.filter((s) => selectedSiteIds.has(s.id)), [sites, selectedSiteIds]);

  // Auto-switch view mode
  useEffect(() => {
    if (selectedSites.length >= 2) {
      setViewMode("compare");
    } else {
      setViewMode("single");
    }
  }, [selectedSites.length]);

  // Build timeline milestones
  const { milestones: allMilestones, dataSource } = useMemo(
    () => buildPlottedMilestones(sites, selectedSiteIds, timelineData, parcels),
    [sites, selectedSiteIds, timelineData, parcels]
  );

  const milestones = useMemo(() => {
    if (!activeFilter) return allMilestones;
    return allMilestones.filter((m) => m.category.id === activeFilter);
  }, [allMilestones, activeFilter]);

  const activeCategories = useMemo(() => {
    const ids = new Set(allMilestones.map((m) => m.category.id));
    return CATEGORY_CONFIG.filter((c) => ids.has(c.id));
  }, [allMilestones]);

  // Filter parcels for Tab 3
  const visibleParcels = useMemo(() => {
    return parcels.filter((p) => selectedSiteIds.has(p.properties._siteId));
  }, [parcels, selectedSiteIds]);

  const siteName = selectedSites.length === 1
    ? selectedSites[0].currentName || selectedSites[0].label
    : `${selectedSites.length} sites`;

  const minYear = milestones.length > 0 ? milestones[0].year : 2020;
  const maxYear = milestones.length > 0 ? milestones[milestones.length - 1].year : 2028;

  // Panel dimensions
  const panelWidth = Math.min(window.innerWidth - 320, viewMode === "compare" ? 1100 : 900);
  const panelHeight = viewMode === "compare"
    ? Math.min(window.innerHeight - 80, Math.max(500, 380 + selectedSites.length * 70))
    : Math.min(window.innerHeight - 80, 520);

  if (selectedSites.length === 0) return null;

  return (
    <FloatingPanel
      initialX={Math.max(290, (window.innerWidth - panelWidth) / 2)}
      initialY={56}
      initialWidth={panelWidth}
      initialHeight={panelHeight}
      minWidth={500}
      minHeight={350}
      showMaximize
      zIndex={1200}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full gap-0">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-terracotta" />
            <span className="text-sm font-semibold text-foreground">Site Intelligence</span>
            <span className="text-xs text-foreground/50 font-mono ml-1">
              {siteName} · {allMilestones.length} milestone{allMilestones.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Tab triggers */}
            <TabsList className="h-7 bg-black/5 p-0.5">
              <TabsTrigger value="timeline" className="text-[10px] h-6 px-2.5 gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Clock className="w-3 h-3" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="phases" className="text-[10px] h-6 px-2.5 gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Layers className="w-3 h-3" />
                Phases
              </TabsTrigger>
              <TabsTrigger value="parcels" className="text-[10px] h-6 px-2.5 gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Table2 className="w-3 h-3" />
                Parcels
              </TabsTrigger>
            </TabsList>

            {/* View mode toggle (timeline tab, 2+ sites) */}
            {activeTab === "timeline" && selectedSites.length >= 2 && (
              <div className="flex items-center bg-black/5 rounded-md p-0.5 ml-2">
                <button
                  onClick={() => setViewMode("single")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${viewMode === "single" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Layers className="w-3 h-3" />
                  Combined
                </button>
                <button
                  onClick={() => setViewMode("compare")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${viewMode === "compare" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Users className="w-3 h-3" />
                  Compare
                </button>
              </div>
            )}

            <button onClick={() => setShowMethods(!showMethods)} className="p-1.5 rounded-md hover:bg-black/5 transition-colors ml-1" title="Methods">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ── Timeline tab: intro + methods + filters ── */}
        {activeTab === "timeline" && (
          <div className="shrink-0">
            {/* Introduction */}
            <div className="px-4 pt-2.5 pb-1">
              <p className="text-xs text-foreground/65 leading-relaxed">
                {viewMode === "compare" && selectedSites.length >= 2
                  ? `Comparing development timelines across ${selectedSites.length} sites on a shared time axis (${minYear}–${maxYear}). Scroll horizontally to explore.`
                  : dataSource === "timeline"
                    ? `Chronological milestones for ${siteName} spanning ${minYear}–${maxYear}, sourced from public filings, news reports, and regulatory documents.`
                    : `Acquisition timeline for ${siteName} based on parcel tax year records (${minYear}–${maxYear}).`}
              </p>
            </div>

            {/* Methods panel */}
            {showMethods && (
              <div className="mx-4 mt-2 p-3 rounded-lg bg-black/3 border border-border/30">
                <p className="text-[11px] text-foreground/60 leading-relaxed">
                  {dataSource === "timeline" ? (
                    <>
                      <strong>Data:</strong> {allMilestones.length} chronological milestones from the TIMELINE_DETAILS Google Sheet.{" "}
                      <strong>Categories:</strong> Stage gates grouped into {activeCategories.length} high-level categories.{" "}
                      <strong>Time axis:</strong> Milestones positioned proportionally from {minYear} to {maxYear}. Sources include county filings, SEC filings, news articles, and utility commission records.
                      {viewMode === "compare" && <> <strong>Compare mode:</strong> Each site occupies a separate horizontal lane for visual comparison of development pace.</>}
                    </>
                  ) : (
                    <>
                      <strong>Data:</strong> Parcel-level TAX_YR from county assessor records. <strong>Method:</strong> Parcels grouped by tax year. TAX_YR may not reflect exact purchase date.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Category filter pills */}
            <div className="px-4 pt-2.5 pb-1 flex flex-wrap gap-1.5">
              {activeCategories.map((cat) => {
                const count = allMilestones.filter((m) => m.category.id === cat.id).length;
                const isActive = activeFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveFilter(isActive ? null : cat.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border"
                    style={{ backgroundColor: isActive ? cat.color : `${cat.color}12`, color: isActive ? "#fff" : cat.color, borderColor: isActive ? cat.color : `${cat.color}30` }}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? "#fff" : cat.color }} />
                    {cat.label}
                    <span className="text-[10px] opacity-70 ml-0.5">{count}</span>
                  </button>
                );
              })}
              {activeFilter && (
                <button onClick={() => setActiveFilter(null)} className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-full border border-border/30 transition-colors">
                  Clear filter
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Tab content ── */}
        <TabsContent value="timeline" className="flex-1 overflow-auto">
          <GanttTimeline
            milestones={milestones}
            allMilestones={allMilestones}
            selectedSites={selectedSites}
            phaseResult={phaseResult}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            viewMode={viewMode}
            dataSource={dataSource}
          />
        </TabsContent>

        <TabsContent value="phases" className="flex-1 overflow-hidden">
          {phaseResult ? (
            <PhaseDetailsTab
              phaseResult={phaseResult}
              highlightedPhase={highlightedPhase}
              onHighlightPhase={onHighlightPhase}
              onHoverParcel={onHoverParcel}
            />
          ) : (
            <NoPhaseDataPlaceholder />
          )}
        </TabsContent>

        <TabsContent value="parcels" className="flex-1 overflow-hidden">
          <ParcelsTab
            parcels={visibleParcels}
            phaseResult={phaseResult}
            onHoverParcel={onHoverParcel}
            onClickParcel={onClickParcel}
          />
        </TabsContent>

        {/* ── Footer legend (timeline tab only) ── */}
        {activeTab === "timeline" && (
          <div className="px-4 py-2 border-t border-border/40 shrink-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-[10px] text-foreground/60 uppercase tracking-wide font-semibold">Categories:</span>
              {activeCategories.map((cat) => (
                <button key={cat.id} onClick={() => setActiveFilter(activeFilter === cat.id ? null : cat.id)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-[10px] text-foreground/65">{cat.label}</span>
                </button>
              ))}
              {selectedSites.length > 1 && viewMode === "single" && (
                <>
                  <span className="text-[10px] text-muted-foreground/30 mx-1">|</span>
                  <span className="text-[10px] text-foreground/60 uppercase tracking-wide font-semibold">Sites:</span>
                  {selectedSites.slice(0, 5).map((s) => {
                    const company = getParentCompany(s);
                    const color = COMPANY_CONFIG[company]?.color || "#6b7280";
                    return (
                      <div key={s.id} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[10px] text-foreground/65 truncate max-w-[100px]">{s.currentName || s.label}</span>
                      </div>
                    );
                  })}
                  {selectedSites.length > 5 && <span className="text-[10px] text-muted-foreground">+{selectedSites.length - 5} more</span>}
                </>
              )}
            </div>
          </div>
        )}
      </Tabs>
    </FloatingPanel>
  );
}
