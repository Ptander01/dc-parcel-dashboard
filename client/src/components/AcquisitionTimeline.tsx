/*
 * Cartographic Studio Design — Acquisition Timeline (Enhanced)
 *
 * Features:
 * - Horizontal scrollable timeline with milestone nodes on a time axis
 * - Category swim-lane bars with clickable filters
 * - MULTI-SITE COMPARISON: parallel swim lanes per site when 2+ sites selected
 * - Wrapped in FloatingPanel for drag/resize/maximize
 * - Hover tooltips with source link click-through
 * - Methods panel explaining data sources
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Clock, Info, X, ExternalLink, ChevronRight, Users, Layers } from "lucide-react";
import type { TimelineData, TimelineMilestone, ParcelFeature, Site } from "@/lib/types";
import { safeNumber } from "@/lib/format";
import { getParentCompany, COMPANY_CONFIG } from "@/lib/companies";
import { FloatingPanel } from "./FloatingPanel";

interface AcquisitionTimelineProps {
  sites: Site[];
  selectedSiteIds: Set<string>;
  timelineData: TimelineData | null;
  parcels: ParcelFeature[];
  onClose: () => void;
}

/* ── Category grouping: map stage gates into high-level swim-lane categories ── */
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

/* ── Enriched milestone with computed position ── */
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

/* ── Helpers ── */
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

/* ── Build plotted milestones from rich timeline data ── */
function buildPlottedMilestones(
  sites: Site[],
  selectedSiteIds: Set<string>,
  timelineData: TimelineData | null,
  parcels: ParcelFeature[]
): { milestones: PlottedMilestone[]; dataSource: "timeline" | "parcel" } {
  const selectedSites = sites.filter((s) => selectedSiteIds.has(s.id));

  // Try rich timeline data first
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
      milestone: `${ps.length} parcel${ps.length > 1 ? "s" : ""} — ${totalAcres.toFixed(0)} ac`,
      detail: `Tax year ${yr}: ${ps.length} parcels totaling ${totalAcres.toFixed(1)} acres. Total assessed value: $${ps.reduce((s: number, p: ParcelFeature) => s + safeNumber(p.properties.TOT_VAL), 0).toLocaleString()}.`,
      siteId: site.id,
      siteName: site.currentName || site.label,
      siteColor: color,
    });
  }
  fallback.sort((a, b) => a.timestamp - b.timestamp);
  return { milestones: fallback, dataSource: "parcel" };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SINGLE-SITE TIMELINE VIEW (original layout with category swim lanes)
 * ═══════════════════════════════════════════════════════════════════════════ */
function SingleSiteTimeline({
  milestones,
  allMilestones,
  activeCategories,
  activeFilter,
  setActiveFilter,
  minTime,
  maxTime,
  yearMarkers,
}: {
  milestones: PlottedMilestone[];
  allMilestones: PlottedMilestone[];
  activeCategories: (typeof CATEGORY_CONFIG)[number][];
  activeFilter: string | null;
  setActiveFilter: (f: string | null) => void;
  minTime: number;
  maxTime: number;
  yearMarkers: { year: number; pct: number; label: string; isYear: boolean }[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const timeSpan = maxTime - minTime;
  const TIMELINE_WIDTH_PX = Math.max(milestones.length * 140, 1200);

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

  return (
    <div className="relative px-4 pt-3 pb-4">
      {canScrollLeft && (
        <button
          onClick={scrollLeft}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors rotate-180"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={scrollRight}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      )}

      <div ref={scrollRef} className="overflow-x-auto overflow-y-visible custom-scrollbar" style={{ paddingBottom: "8px" }}>
        <div className="relative" style={{ width: `${TIMELINE_WIDTH_PX}px`, minHeight: "240px" }}>
          {/* Quarter/Year grid lines */}
          {yearMarkers.map((marker) => (
            <div
              key={`grid-${marker.year}-${marker.label}`}
              className="absolute top-0 bottom-0"
              style={{ left: `${marker.pct}%` }}
            >
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
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 3)}%`,
                  top: `${topOffset}px`,
                  height: "22px",
                  backgroundColor: `${cat.color}20`,
                  borderLeft: `3px solid ${cat.color}`,
                }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: cat.color }}>
                  {cat.label}
                </span>
              </div>
            );
          })}

          {/* Main timeline axis */}
          <div
            className="absolute left-0 right-0 h-[3px] rounded-full bg-border/30"
            style={{ top: `${8 + activeCategories.length * 28 + 20}px` }}
          />

          {/* Milestone nodes */}
          {milestones.map((m, idx) => {
            const leftPct = ((m.timestamp - minTime) / timeSpan) * 100;
            const axisTop = 8 + activeCategories.length * 28 + 20;
            const isHovered = hoveredIdx === idx;
            const isAbove = idx % 2 === 0;
            const labelTop = isAbove ? axisTop - 56 : axisTop + 20;

            return (
              <div key={`ms-${idx}`}>
                <div
                  className="absolute w-px transition-colors"
                  style={{
                    left: `${leftPct}%`,
                    top: isAbove ? `${labelTop + 38}px` : `${axisTop + 6}px`,
                    height: isAbove ? `${axisTop - labelTop - 38 + 2}px` : `${labelTop - axisTop - 6}px`,
                    backgroundColor: isHovered ? m.category.color : `${m.category.color}40`,
                  }}
                />
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm cursor-pointer transition-all z-10"
                  style={{
                    left: `${leftPct}%`,
                    top: `${axisTop + 1.5}px`,
                    width: isHovered ? "14px" : "10px",
                    height: isHovered ? "14px" : "10px",
                    backgroundColor: m.category.color,
                    boxShadow: isHovered ? `0 0 0 3px ${m.category.color}30, 0 2px 8px rgba(0,0,0,0.2)` : "0 1px 3px rgba(0,0,0,0.2)",
                    zIndex: isHovered ? 30 : 10,
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(-1)}
                />
                <div
                  className="absolute -translate-x-1/2 flex flex-col items-center cursor-pointer"
                  style={{
                    left: `${leftPct}%`,
                    top: `${labelTop}px`,
                    opacity: isHovered ? 1 : 0.8,
                    zIndex: isHovered ? 25 : 5,
                    maxWidth: isHovered ? "180px" : "110px",
                    transition: "opacity 0.15s, max-width 0.2s",
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(-1)}
                >
                  <span className="text-[9px] font-mono text-foreground/60 whitespace-nowrap">{formatDateLabel(m.date)}</span>
                  <span
                    className={`text-[10px] font-semibold text-center leading-tight ${isHovered ? "line-clamp-3" : "line-clamp-1"}`}
                    style={{ color: m.category.color }}
                  >
                    {m.milestone}
                  </span>
                </div>

                {/* Hover tooltip */}
                {isHovered && (
                  <div className="absolute z-50" style={{ left: `${leftPct}%`, top: `${axisTop + 20}px`, transform: "translateX(-50%)" }}>
                    <div
                      className="bg-white rounded-lg shadow-xl border border-border/40 p-3 min-w-[260px] max-w-[340px] pointer-events-auto"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(-1)}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.category.color }} />
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: m.category.color }}>{m.stageGate}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto font-mono">{formatDateFull(m.date)}</span>
                      </div>
                      <div className="text-xs font-semibold text-foreground mb-1">{m.milestone}</div>
                      {m.detail && <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 line-clamp-4">{m.detail}</p>}
                      {m.actionedBy && <p className="text-[10px] text-muted-foreground/70 mt-1 italic">By: {m.actionedBy}</p>}
                      {m.sourceLink && (
                        <a
                          href={m.sourceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 mt-1.5 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3 text-terracotta" />
                          <span className="text-[10px] text-terracotta">View source</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Year/Quarter labels at bottom */}
          <div className="absolute left-0 right-0" style={{ top: `${8 + activeCategories.length * 28 + 50}px`, height: "20px" }}>
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

/* ═══════════════════════════════════════════════════════════════════════════
 *  MULTI-SITE COMPARISON VIEW — parallel swim lanes per site
 * ═══════════════════════════════════════════════════════════════════════════ */
function MultiSiteComparisonTimeline({
  milestones,
  allMilestones,
  selectedSites,
  activeFilter,
  setActiveFilter,
  minTime,
  maxTime,
  yearMarkers,
}: {
  milestones: PlottedMilestone[];
  allMilestones: PlottedMilestone[];
  selectedSites: Site[];
  activeFilter: string | null;
  setActiveFilter: (f: string | null) => void;
  minTime: number;
  maxTime: number;
  yearMarkers: { year: number; pct: number; label: string; isYear: boolean }[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const timeSpan = maxTime - minTime;
  const TIMELINE_WIDTH_PX = Math.max(milestones.length * 80, 1400);
  const LANE_HEIGHT = 88;
  const LANE_GAP = 6;
  const LABEL_WIDTH = 170;
  const HEADER_HEIGHT = 32;

  // Group milestones by site
  const siteGroups = useMemo(() => {
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
    // Only return sites that have milestones
    return Array.from(groups.values()).filter((g) => g.milestones.length > 0);
  }, [milestones, selectedSites]);

  const totalHeight = HEADER_HEIGHT + siteGroups.length * (LANE_HEIGHT + LANE_GAP) + 40;

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

  if (siteGroups.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-foreground/70">No timeline data available for the selected sites.</p>
        <p className="text-xs text-foreground/50 mt-1">Only 12 of 35 sites have detailed timeline milestones.</p>
      </div>
    );
  }

  return (
    <div className="relative pt-2 pb-4">
      {/* Scroll arrows */}
      {canScrollLeft && (
        <button
          onClick={scrollLeft}
          className="absolute left-[168px] top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors rotate-180"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={scrollRight}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-foreground" />
        </button>
      )}

      <div className="flex">
        {/* Fixed site labels column */}
        <div className="shrink-0" style={{ width: `${LABEL_WIDTH}px` }}>
          {/* Header spacer */}
          <div style={{ height: `${HEADER_HEIGHT}px` }} className="flex items-end px-3 pb-1">
            <span className="text-[9px] uppercase tracking-widest text-foreground/70 font-semibold">Sites</span>
          </div>
          {/* Site labels */}
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
                  {group.milestones.length} milestones
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable timeline area */}
        <div ref={scrollRef} className="overflow-x-auto overflow-y-visible custom-scrollbar flex-1" style={{ paddingBottom: "8px" }}>
          <div className="relative" style={{ width: `${TIMELINE_WIDTH_PX}px`, height: `${totalHeight}px` }}>
            {/* Year/Quarter grid lines spanning full height */}
            {yearMarkers.map((marker) => (
              <div key={`grid-${marker.year}-${marker.label}`} className="absolute top-0 bottom-0" style={{ left: `${marker.pct}%` }}>
                <div className="w-px h-full" style={{ backgroundColor: marker.isYear ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.07)" }} />
              </div>
            ))}

            {/* Year/Quarter labels in header */}
            <div className="absolute left-0 right-0" style={{ top: 0, height: `${HEADER_HEIGHT}px` }}>
              {yearMarkers.map((marker) => (
                <span
                  key={`hdr-${marker.year}-${marker.label}`}
                  className={`absolute -translate-x-1/2 select-none ${
                    marker.isYear ? "text-[11px] font-bold text-foreground/60 bottom-1" : "text-[9px] font-medium text-foreground/35 bottom-2"
                  }`}
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
                  {/* Lane background */}
                  <div
                    className="absolute left-0 right-0 rounded-sm"
                    style={{
                      top: `${laneTop}px`,
                      height: `${LANE_HEIGHT}px`,
                      backgroundColor: `${group.color}06`,
                      borderTop: `1px solid ${group.color}15`,
                      borderBottom: `1px solid ${group.color}15`,
                    }}
                  />

                  {/* Horizontal axis line */}
                  <div
                    className="absolute left-0 right-0 h-[2px] rounded-full"
                    style={{
                      top: `${axisY}px`,
                      backgroundColor: `${group.color}25`,
                    }}
                  />

                  {/* Milestone nodes */}
                  {group.milestones.map((m, mIdx) => {
                    const leftPct = ((m.timestamp - minTime) / timeSpan) * 100;
                    const hoverKey = `${group.site.id}-${mIdx}`;
                    const isHovered = hoveredIdx === hoverKey;
                    const isAbove = mIdx % 2 === 0;
                    const labelOffsetY = isAbove ? -28 : 14;

                    return (
                      <div key={`ms-${group.site.id}-${mIdx}`}>
                        {/* Vertical connector */}
                        <div
                          className="absolute w-px transition-colors"
                          style={{
                            left: `${leftPct}%`,
                            top: isAbove ? `${axisY + labelOffsetY + 16}px` : `${axisY + 4}px`,
                            height: isAbove ? `${-labelOffsetY - 16 + 2}px` : `${labelOffsetY - 4}px`,
                            backgroundColor: isHovered ? m.category.color : `${m.category.color}30`,
                          }}
                        />

                        {/* Node circle */}
                        <div
                          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm cursor-pointer transition-all"
                          style={{
                            left: `${leftPct}%`,
                            top: `${axisY + 1}px`,
                            width: isHovered ? "13px" : "9px",
                            height: isHovered ? "13px" : "9px",
                            backgroundColor: m.category.color,
                            boxShadow: isHovered ? `0 0 0 3px ${m.category.color}30, 0 2px 6px rgba(0,0,0,0.2)` : "0 1px 2px rgba(0,0,0,0.15)",
                            zIndex: isHovered ? 30 : 10,
                          }}
                          onMouseEnter={() => setHoveredIdx(hoverKey)}
                          onMouseLeave={() => setHoveredIdx("")}
                        />

                        {/* Label */}
                        <div
                          className="absolute -translate-x-1/2 flex flex-col items-center cursor-pointer"
                          style={{
                            left: `${leftPct}%`,
                            top: `${axisY + labelOffsetY}px`,
                            opacity: isHovered ? 1 : 0.75,
                            zIndex: isHovered ? 25 : 5,
                            maxWidth: isHovered ? "160px" : "90px",
                            transition: "opacity 0.15s, max-width 0.2s",
                          }}
                          onMouseEnter={() => setHoveredIdx(hoverKey)}
                          onMouseLeave={() => setHoveredIdx("")}
                        >
                          <span className="text-[8px] font-mono text-foreground/55 whitespace-nowrap">{formatDateLabel(m.date)}</span>
                          <span
                            className={`text-[9px] font-semibold text-center leading-tight ${isHovered ? "line-clamp-2" : "line-clamp-1"}`}
                            style={{ color: m.category.color }}
                          >
                            {m.milestone}
                          </span>
                        </div>

                        {/* Hover tooltip */}
                        {isHovered && (
                          <div
                            className="absolute z-50"
                            style={{
                              left: `${leftPct}%`,
                              top: `${axisY + 16}px`,
                              transform: "translateX(-50%)",
                            }}
                          >
                            <div
                              className="bg-white rounded-lg shadow-xl border border-border/40 p-3 min-w-[240px] max-w-[320px] pointer-events-auto"
                              onMouseEnter={() => setHoveredIdx(hoverKey)}
                              onMouseLeave={() => setHoveredIdx("")}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                                <span className="text-[10px] font-semibold text-foreground truncate">{m.siteName}</span>
                                <span className="text-[10px] text-muted-foreground ml-auto font-mono">{formatDateFull(m.date)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.category.color }} />
                                <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: m.category.color }}>{m.stageGate}</span>
                              </div>
                              <div className="text-xs font-semibold text-foreground mb-1">{m.milestone}</div>
                              {m.detail && <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 line-clamp-3">{m.detail}</p>}
                              {m.actionedBy && <p className="text-[10px] text-muted-foreground/70 mt-1 italic">By: {m.actionedBy}</p>}
                              {m.sourceLink && (
                                <a href={m.sourceLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1.5 hover:underline" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="w-3 h-3 text-terracotta" />
                                  <span className="text-[10px] text-terracotta">View source</span>
                                </a>
                              )}
                            </div>
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

/* ═══════════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT — wraps everything in FloatingPanel
 * ═══════════════════════════════════════════════════════════════════════════ */
export function AcquisitionTimeline({
  sites,
  selectedSiteIds,
  timelineData,
  parcels,
  onClose,
}: AcquisitionTimelineProps) {
  const [showMethods, setShowMethods] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");

  const selectedSites = useMemo(() => sites.filter((s) => selectedSiteIds.has(s.id)), [sites, selectedSiteIds]);

  // Auto-switch to compare mode when 2+ sites selected, single when 1
  useEffect(() => {
    if (selectedSites.length >= 2) {
      setViewMode("compare");
    } else {
      setViewMode("single");
    }
  }, [selectedSites.length]);

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

  const { minTime, maxTime, yearMarkers } = useMemo(() => {
    if (milestones.length === 0) return { minTime: 0, maxTime: 1, yearMarkers: [] };
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
          markers.push({ year: y, pct: Math.max(0, Math.min(100, pct)), label: isYear ? String(y) : `${quarterLabels[q + 1]}`, isYear });
        }
      }
    }
    return { minTime: minT, maxTime: maxT, yearMarkers: markers };
  }, [milestones]);

  if (selectedSites.length === 0 || allMilestones.length === 0) return null;

  const siteName = selectedSites.length === 1 ? selectedSites[0].currentName || selectedSites[0].label : `${selectedSites.length} sites`;
  const minYear = milestones.length > 0 ? milestones[0].year : 2020;
  const maxYear = milestones.length > 0 ? milestones[milestones.length - 1].year : 2028;

  // Compute initial panel dimensions based on view mode
  // Position to the right of the site selector (280px) with generous sizing
  const panelWidth = Math.min(window.innerWidth - 320, viewMode === "compare" ? 1100 : 900);
  const panelHeight = viewMode === "compare"
    ? Math.min(window.innerHeight - 80, Math.max(500, 380 + selectedSites.length * 70))
    : Math.min(window.innerHeight - 80, 460);

  return (
    <FloatingPanel
      initialX={Math.max(290, (window.innerWidth - panelWidth) / 2)}
      initialY={56}
      initialWidth={panelWidth}
      initialHeight={panelHeight}
      minWidth={500}
      minHeight={300}
      showMaximize
      zIndex={1200}
    >
      <div className="flex flex-col h-full">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-terracotta" />
            <span className="text-sm font-semibold text-foreground">Acquisition Timeline</span>
            <span className="text-xs text-foreground/60 font-mono ml-1">
              {siteName} · {allMilestones.length} milestones
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* View mode toggle — only show when 2+ sites */}
            {selectedSites.length >= 2 && (
              <div className="flex items-center bg-black/5 rounded-md p-0.5 mr-2">
                <button
                  onClick={() => setViewMode("single")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    viewMode === "single" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Combined timeline"
                >
                  <Layers className="w-3 h-3" />
                  Combined
                </button>
                <button
                  onClick={() => setViewMode("compare")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    viewMode === "compare" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Compare sites side by side"
                >
                  <Users className="w-3 h-3" />
                  Compare
                </button>
              </div>
            )}
            <button onClick={() => setShowMethods(!showMethods)} className="p-1.5 rounded-md hover:bg-black/5 transition-colors" title="Methods">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ── Introduction ── */}
        <div className="px-4 pt-2.5 pb-1 shrink-0">
          <p className="text-xs text-foreground/65 leading-relaxed max-w-[90%]">
            {viewMode === "compare" && selectedSites.length >= 2
              ? `Comparing development timelines across ${selectedSites.length} sites. Each row shows milestones for one site on a shared time axis (${minYear}–${maxYear}). Scroll horizontally to explore.`
              : dataSource === "timeline"
                ? `Chronological milestones for ${siteName} spanning ${minYear}–${maxYear}, sourced from public filings, news reports, and regulatory documents. Scroll horizontally to explore. Click category bars to filter.`
                : `Acquisition timeline for ${siteName} based on parcel tax year records (${minYear}–${maxYear}). Each node represents parcels sharing the same tax year.`}
          </p>
        </div>

        {/* ── Methods panel ── */}
        {showMethods && (
          <div className="mx-4 mt-2 p-3 rounded-lg bg-black/3 border border-border/30 shrink-0">
            <p className="text-[11px] text-foreground/60 leading-relaxed">
              {dataSource === "timeline" ? (
                <>
                  <strong>Data:</strong> {allMilestones.length} chronological milestones from the TIMELINE_DETAILS Google Sheet. Milestones include land acquisitions, construction permits, utility agreements, and zoning approvals.{" "}
                  <strong>Categories:</strong> Stage gates are grouped into {activeCategories.length} high-level categories displayed as colored swim lanes.{" "}
                  <strong>Time axis:</strong> Milestones are positioned proportionally along a continuous time axis from {minYear} to {maxYear}. Sources include county recorder filings, SEC filings, news articles, and utility commission records.
                  {viewMode === "compare" && (
                    <>
                      {" "}
                      <strong>Compare mode:</strong> Each site occupies a separate horizontal lane with milestones aligned on the shared time axis, enabling visual comparison of development pace and stage progression.
                    </>
                  )}
                </>
              ) : (
                <>
                  <strong>Data:</strong> Parcel-level TAX_YR field from county assessor records. <strong>Method:</strong> Parcels are grouped by tax year to approximate acquisition phases. TAX_YR may not reflect exact purchase date. <strong>Acreage</strong> = sum of LAND_ACRES. <strong>Value</strong> = sum of TOT_VAL.
                </>
              )}
            </p>
          </div>
        )}

        {/* ── Category filter pills ── */}
        <div className="px-4 pt-2.5 pb-1 flex flex-wrap gap-1.5 shrink-0">
          {activeCategories.map((cat) => {
            const count = allMilestones.filter((m) => m.category.id === cat.id).length;
            const isActive = activeFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveFilter(isActive ? null : cat.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border"
                style={{
                  backgroundColor: isActive ? cat.color : `${cat.color}12`,
                  color: isActive ? "#fff" : cat.color,
                  borderColor: isActive ? cat.color : `${cat.color}30`,
                }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? "#fff" : cat.color }} />
                {cat.label}
                <span className="text-[10px] opacity-70 ml-0.5" style={{ color: isActive ? "#ffffffcc" : cat.color }}>
                  {count}
                </span>
              </button>
            );
          })}
          {activeFilter && (
            <button onClick={() => setActiveFilter(null)} className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-full border border-border/30 transition-colors">
              Clear filter
            </button>
          )}
        </div>

        {/* ── Timeline content (scrollable) ── */}
        <div className="flex-1 overflow-auto">
          {viewMode === "compare" && selectedSites.length >= 2 ? (
            <MultiSiteComparisonTimeline
              milestones={milestones}
              allMilestones={allMilestones}
              selectedSites={selectedSites}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              minTime={minTime}
              maxTime={maxTime}
              yearMarkers={yearMarkers}
            />
          ) : (
            <SingleSiteTimeline
              milestones={milestones}
              allMilestones={allMilestones}
              activeCategories={activeCategories}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              minTime={minTime}
              maxTime={maxTime}
              yearMarkers={yearMarkers}
            />
          )}
        </div>

        {/* ── Legend ── */}
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
      </div>
    </FloatingPanel>
  );
}
