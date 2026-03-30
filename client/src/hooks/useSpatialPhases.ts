/**
 * useSpatialPhases — builds phase drill-down results from spatial join data.
 *
 * Uses the phase_assignments.json (OBJECTID → { site, phase }) produced by
 * a point-in-polygon spatial join of Site_Phases.geojson against parcels.
 *
 * Falls through to the existing APN-based usePhases when no spatial data
 * is available for a given site.
 */

import { useMemo, useCallback } from "react";
import type { ParcelFeature, PhaseAssignmentsData, PhasePolygonsGeoJSON } from "@/lib/types";
import type { SitePhaseResult, PhaseWithMetrics, SiteTotals } from "@/hooks/usePhases";
import { safeNumber } from "@/lib/format";

/* ── Phase polygon site name → dashboard site IDs (post-merge) ── */
const PHASE_SITE_MAP: Record<string, string[]> = {
  "Stargate 1 Abiliene": ["-11108573.0384 3828587.806599997"],
  "XAI Colossus": ["-10023138.0952 4163402.289499998"],
  "AWS Indiana": ["-9624486.1387 5111264.9684000015"],
  "Microsoft Mt Pleasant": ["-9785066.4343 5262789.561300002"],
  // KC maps to both merged sites — parcels already remapped by useData
  "Google Kansas City": [
    "-10514673.6901 4746935.318700001",  // Hunt Midwest (Phase 1)
    "-10528275.9494 4767685.2412",        // Project Mica (Phase 2)
  ],
};

/** Reverse lookup: dashboard site ID → phase polygon site name */
function buildSiteIdToPolygonName(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [polyName, siteIds] of Object.entries(PHASE_SITE_MAP)) {
    for (const id of siteIds) {
      map.set(id, polyName);
    }
  }
  return map;
}

const SITE_ID_TO_POLY_NAME = buildSiteIdToPolygonName();

/* ── Phase color palette ── */
const PHASE_COLORS: Record<string, string> = {
  "1": "#10b981",       // emerald
  "2": "#3b82f6",       // blue
  "3": "#f59e0b",       // amber
  "4": "#8b5cf6",       // violet
  "5": "#ec4899",       // pink
  "TBD": "#6b7280",     // gray
  "PP 1": "#06b6d4",    // cyan
  "PP 2": "#14b8a6",    // teal
  "1_Hunt": "#10b981",  // emerald
  "2_Mica": "#3b82f6",  // blue
  "Kenosha_WI": "#f97316", // orange
};

function getPhaseColor(phase: string): string {
  return PHASE_COLORS[phase] || "#6b7280";
}

function getPhaseLabel(phase: string): string {
  // Pretty-print phase names
  if (phase === "1_Hunt") return "Phase 1 — Hunt Midwest";
  if (phase === "2_Mica") return "Phase 2 — Project Mica";
  if (phase === "Kenosha_WI") return "Kenosha, WI Expansion";
  if (phase === "TBD") return "TBD / Unassigned";
  if (phase.startsWith("PP ")) return `Power Plant ${phase.replace("PP ", "")}`;
  if (/^\d+$/.test(phase)) return `Phase ${phase}`;
  return phase;
}

/* ── Site-level totals (manually curated for sites with known data) ── */
const SITE_TOTALS: Record<string, SiteTotals> = {
  "Stargate 1 Abiliene": {
    estimatedMW: "1,200+ MW",
    investmentTotal: "$100B+ (Stargate JV)",
    sources: ["OpenAI / SoftBank announcement", "Taylor County filings"],
  },
  "XAI Colossus": {
    estimatedMW: "150+ MW (Phase 2), expanding",
    gpuTotal: "100,000+ H100 GPUs",
    investmentTotal: "$10B+",
    sources: ["Memphis Business Journal", "MLGW filings"],
  },
  "Microsoft Mt Pleasant": {
    estimatedMW: "2,000+ MW planned",
    investmentTotal: "$3.3B+",
    sources: ["Racine County filings", "Microsoft SEC filings"],
  },
};

export function useSpatialPhases(
  phaseAssignments: PhaseAssignmentsData | null,
  _phasePolygons: PhasePolygonsGeoJSON | null,
) {
  /** Check if a site has spatial phase data */
  const hasSpatialPhasing = useCallback(
    (siteId: string): boolean => {
      if (!phaseAssignments) return false;
      return SITE_ID_TO_POLY_NAME.has(siteId);
    },
    [phaseAssignments]
  );

  /** Build a SitePhaseResult from spatial join data for a set of selected site IDs */
  const buildSpatialPhaseResult = useCallback(
    (siteIds: Set<string>, allParcels: ParcelFeature[]): SitePhaseResult | null => {
      if (!phaseAssignments) return null;

      // Find the first selected site that has spatial phasing
      let matchedSiteId: string | null = null;
      let polyName: string | null = null;
      for (const siteId of Array.from(siteIds)) {
        const name = SITE_ID_TO_POLY_NAME.get(siteId);
        if (name) {
          matchedSiteId = siteId;
          polyName = name;
          break;
        }
      }
      if (!matchedSiteId || !polyName) return null;

      // Get all dashboard site IDs that belong to this phase polygon site
      const allSiteIdsForPoly = PHASE_SITE_MAP[polyName] || [matchedSiteId];
      const siteIdSet = new Set(allSiteIdsForPoly);

      // Get all parcels for these site IDs
      const siteParcels = allParcels.filter((p) => siteIdSet.has(p.properties._siteId));

      // Build OBJECTID → phase assignment lookup
      const assignments = phaseAssignments.assignments;

      // Group parcels by phase
      const phaseGroups = new Map<string, ParcelFeature[]>();
      const assignedObjIds = new Set<number>();

      for (const parcel of siteParcels) {
        const objId = String(parcel.properties.OBJECTID);
        const assignment = assignments[objId];
        if (assignment && assignment.site === polyName) {
          const phase = assignment.phase;
          if (!phaseGroups.has(phase)) {
            phaseGroups.set(phase, []);
          }
          phaseGroups.get(phase)!.push(parcel);
          assignedObjIds.add(parcel.properties.OBJECTID);
        }
      }

      // Sort phases: numeric first (1, 2, 3...), then alpha
      const sortedPhases = Array.from(phaseGroups.keys()).sort((a, b) => {
        const aNum = parseInt(a);
        const bNum = parseInt(b);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        if (!isNaN(aNum)) return -1;
        if (!isNaN(bNum)) return 1;
        return a.localeCompare(b);
      });

      // Build PhaseWithMetrics for each phase
      const phasesWithMetrics: PhaseWithMetrics[] = sortedPhases.map((phase) => {
        const matchedParcels = phaseGroups.get(phase) || [];
        const totalAcres = matchedParcels.reduce(
          (sum, p) => sum + (p.properties.LAND_ACRES || 0),
          0
        );
        const totalValue = matchedParcels.reduce(
          (sum, p) => sum + safeNumber(p.properties.TOT_VAL),
          0
        );

        return {
          id: `spatial-${polyName}-${phase}`,
          label: getPhaseLabel(phase),
          color: getPhaseColor(phase),
          description: `Spatially assigned parcels in ${phase}`,
          details: {},
          parcelApns: matchedParcels.map((p) => p.properties.APN),
          matchedParcels,
          unmatchedCount: 0,
          totalAcres,
          totalValue,
          parcelCount: matchedParcels.length,
        };
      });

      // Unassigned parcels (in the site but not in any phase polygon)
      const unassignedParcels = siteParcels.filter(
        (p) => !assignedObjIds.has(p.properties.OBJECTID)
      );

      const totalAcres = siteParcels.reduce(
        (sum, p) => sum + (p.properties.LAND_ACRES || 0),
        0
      );
      const totalValue = siteParcels.reduce(
        (sum, p) => sum + safeNumber(p.properties.TOT_VAL),
        0
      );

      return {
        configKey: `spatial-${polyName}`,
        displayName: polyName,
        phases: phasesWithMetrics,
        totalParcels: siteParcels.length,
        totalAcres,
        totalValue,
        unassignedParcels,
        totals: SITE_TOTALS[polyName],
      };
    },
    [phaseAssignments]
  );

  /** Get the phase assignment for a specific parcel OBJECTID */
  const getParcelPhase = useCallback(
    (objectId: number): { site: string; phase: string } | null => {
      if (!phaseAssignments) return null;
      return phaseAssignments.assignments[String(objectId)] || null;
    },
    [phaseAssignments]
  );

  return {
    hasSpatialPhasing,
    buildSpatialPhaseResult,
    getParcelPhase,
  };
}
