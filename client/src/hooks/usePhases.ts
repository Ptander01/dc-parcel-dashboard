import { useState, useEffect, useCallback, useMemo } from "react";
import type { ParcelFeature } from "@/lib/types";
import { safeNumber } from "@/lib/format";

/* ─── Phase data types ─── */
export interface PhaseDetails {
  power?: string;
  buildings?: string;
  energization?: string;
  acreage?: string;
  operator?: string;
  project?: string;
  capacity?: string;
  status?: string;
  investment?: string;
  gpuConfig?: string;
  cooling?: string;
  source?: string;
}

export interface Phase {
  id: string;
  label: string;
  color: string;
  description: string;
  details: PhaseDetails;
  parcelApns: string[];
}

export interface SiteTotals {
  estimatedMW?: string;
  energizationWindow?: string;
  investmentTotal?: string;
  gpuTotal?: string;
  sources?: string[];
}

export interface SitePhaseConfig {
  displayName: string;
  siteIds: string[];
  phases: Phase[];
  totals?: SiteTotals;
}

export interface PhasesData {
  _meta: { description: string; source: string; lastUpdated: string };
  sites: Record<string, SitePhaseConfig>;
}

/* ─── Aggregated phase with computed parcel metrics ─── */
export interface PhaseWithMetrics extends Phase {
  matchedParcels: ParcelFeature[];
  unmatchedCount: number;
  totalAcres: number;
  totalValue: number;
  parcelCount: number;
}

export interface SitePhaseResult {
  configKey: string;
  displayName: string;
  phases: PhaseWithMetrics[];
  totalParcels: number;
  totalAcres: number;
  totalValue: number;
  unassignedParcels: ParcelFeature[];
  totals?: SiteTotals;
}

export function usePhases() {
  const [phasesData, setPhasesData] = useState<PhasesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("https://d2xsxph8kpxj0f.cloudfront.net/310519663348511113/HQS4SQ7gKiCdBgjmaVCmNU/phases_7049f8fd.json")
      .then((r) => r.json())
      .then((data: PhasesData) => {
        if (!cancelled) {
          setPhasesData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Build a lookup: siteId → configKey
  const siteIdToConfigKey = useMemo(() => {
    const map = new Map<string, string>();
    if (!phasesData) return map;
    for (const [key, config] of Object.entries(phasesData.sites)) {
      for (const siteId of config.siteIds) {
        map.set(siteId, key);
      }
    }
    return map;
  }, [phasesData]);

  // Check if a site has phasing data
  const hasPhasing = useCallback(
    (siteId: string): boolean => {
      return siteIdToConfigKey.has(siteId);
    },
    [siteIdToConfigKey]
  );

  // Get the config key for a site
  const getConfigKey = useCallback(
    (siteId: string): string | null => {
      return siteIdToConfigKey.get(siteId) || null;
    },
    [siteIdToConfigKey]
  );

  // Build phase drill-down result for a set of selected site IDs
  const buildPhaseResult = useCallback(
    (siteIds: Set<string>, allParcels: ParcelFeature[]): SitePhaseResult | null => {
      if (!phasesData) return null;

      // Find the config key — use the first selected site that has phasing
      let configKey: string | null = null;
      for (const siteId of Array.from(siteIds)) {
        const key = siteIdToConfigKey.get(siteId);
        if (key) {
          configKey = key;
          break;
        }
      }
      if (!configKey) return null;

      const config = phasesData.sites[configKey];
      if (!config) return null;

      // Get all parcels belonging to any of this config's site IDs
      const configSiteIds = new Set(config.siteIds);
      const siteParcels = allParcels.filter((p) =>
        configSiteIds.has(p.properties._siteId)
      );

      // Build APN lookup
      const apnToParcel = new Map<string, ParcelFeature>();
      for (const p of siteParcels) {
        const apn = p.properties.APN?.trim();
        if (apn) apnToParcel.set(apn, p);
      }

      // Track which parcels are assigned
      const assignedApns = new Set<string>();

      const phasesWithMetrics: PhaseWithMetrics[] = config.phases.map((phase) => {
        const matchedParcels: ParcelFeature[] = [];
        let unmatchedCount = 0;

        for (const apn of phase.parcelApns) {
          const trimmed = apn.trim();
          const parcel = apnToParcel.get(trimmed);
          if (parcel) {
            matchedParcels.push(parcel);
            assignedApns.add(trimmed);
          } else {
            unmatchedCount++;
          }
        }

        const totalAcres = matchedParcels.reduce(
          (sum, p) => sum + (p.properties.LAND_ACRES || 0),
          0
        );
        const totalValue = matchedParcels.reduce(
          (sum, p) => sum + safeNumber(p.properties.TOT_VAL),
          0
        );

        return {
          ...phase,
          matchedParcels,
          unmatchedCount,
          totalAcres,
          totalValue,
          parcelCount: matchedParcels.length,
        };
      });

      // Unassigned parcels
      const unassignedParcels = siteParcels.filter(
        (p) => !assignedApns.has(p.properties.APN?.trim() || "")
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
        configKey,
        displayName: config.displayName,
        phases: phasesWithMetrics,
        totalParcels: siteParcels.length,
        totalAcres,
        totalValue,
        unassignedParcels,
        totals: config.totals,
      };
    },
    [phasesData, siteIdToConfigKey]
  );

  return {
    phasesData,
    loading,
    hasPhasing,
    getConfigKey,
    buildPhaseResult,
  };
}
