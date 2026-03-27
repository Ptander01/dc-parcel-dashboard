import { useState, useEffect } from "react";
import type { SitesData, ParcelsGeoJSON, TimelineData, Site } from "@/lib/types";

const SITES_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663348511113/HQS4SQ7gKiCdBgjmaVCmNU/sites_89eb3daf.json";
const PARCELS_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663348511113/HQS4SQ7gKiCdBgjmaVCmNU/parcels_654f57cb.geojson";
const TIMELINE_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663348511113/FuT3jd9kTgsQVw8s7BkLWz/timeline_9a1af74b.json";

/* ─── Kansas City site merge constants ─── */
const KC_AG_ROSE_ID = "-10528275.9494 4767685.2412";       // Northern — Project Mica (Phase 2)
const KC_HUNT_MW_ID = "-10514673.6901 4746935.318700001";  // Southern — Hunt Midwest (Phase 1) — keep
const KC_PORT_AUTH_ID = "-10515568.557 4747632.644900002";  // Southern — Port Authority — merge into Hunt MW

/* ─── Rainier 2 Jackson site merge constants ─── */
const R2_RIDGELAND_NORTH_ID = "-10030193.9332 3841907.052500002"; // 43 parcels, lat 32.597 (actually Canton area) — keep as Canton primary
const R2_RIDGELAND_SOUTH_ID = "-10040018.9597 3817076.1340000033"; // 1 parcel, lat 32.409 (actual Ridgeland) — stays
const R2_CANTON_ID = "-10029261.7206 3841972.158500001";           // 29 parcels, lat 32.597 (Canton area) — merge into Canton primary

/* ─── South Bend IN AWS merge constants ─── */
const SB_AMAZON_ID = "-9624486.1387 5111264.9684000015";   // 11 parcels, 325 ac — keep as primary
const SB_RAZOR5_ID = "-9626406.2557 5111263.7852";          // 8 parcels, 929 ac — merge into primary

/* ─── Lueders TX merge constants ─── */
const LUEDERS_CLEARFORK_ID = "-11081749.4424 3889251.5212000012"; // 5 parcels, 1661 ac — keep as primary
const LUEDERS_GOOGLE_ID = "-11085213.72 3893864.5059999973";     // 2 parcels, 291 ac — merge into primary

interface DataState {
  sitesData: SitesData | null;
  parcelsData: ParcelsGeoJSON | null;
  timelineData: TimelineData | null;
  loading: boolean;
  error: string | null;
}

/* ═══════════════════════════════════════════════════════════
   Generic helpers
   ═══════════════════════════════════════════════════════════ */

/** Merge metrics from two sites */
function mergeMetrics(a: Site["metrics"], b: Site["metrics"]): Site["metrics"] {
  return {
    parcelCount: a.parcelCount + b.parcelCount,
    totalAcres: a.totalAcres + b.totalAcres,
    totalValue: a.totalValue + b.totalValue,
    landValue: a.landValue + b.landValue,
    improvementValue: a.improvementValue + b.improvementValue,
    marketValue: a.marketValue + b.marketValue,
  };
}

/** Merge bounding boxes */
function mergeBboxes(
  ...boxes: (Site["bbox"])[]
): [number, number, number, number] | null {
  const valid = boxes.filter(Boolean) as [number, number, number, number][];
  if (valid.length === 0) return null;
  return [
    Math.min(...valid.map((b) => b[0])),
    Math.min(...valid.map((b) => b[1])),
    Math.max(...valid.map((b) => b[2])),
    Math.max(...valid.map((b) => b[3])),
  ];
}

/** Deduplicate-merge timeline milestones from donor into primary */
function mergeTimelineMilestones(
  data: TimelineData,
  primaryId: string,
  donorId: string
): void {
  const primary = data[primaryId] || [];
  const donor = data[donorId] || [];
  const seen = new Set(primary.map((m) => `${m.date}|${m.milestone}`));
  const merged = [...primary];
  for (const m of donor) {
    const key = `${m.date}|${m.milestone}`;
    if (!seen.has(key)) {
      merged.push(m);
      seen.add(key);
    }
  }
  data[primaryId] = merged;
  delete data[donorId];
}

/** Remap parcels from one siteId to another */
function remapParcels(
  parcelsData: ParcelsGeoJSON,
  fromId: string,
  toId: string
): ParcelsGeoJSON {
  return {
    ...parcelsData,
    features: parcelsData.features.map((f) => {
      if (f.properties._siteId === fromId) {
        return { ...f, properties: { ...f.properties, _siteId: toId } };
      }
      return f;
    }),
  };
}

/* ═══════════════════════════════════════════════════════════
   Kansas City merge (3 → 2)
   ═══════════════════════════════════════════════════════════ */

function mergeKansasCitySites(sitesData: SitesData): SitesData {
  const agRose = sitesData.sites.find((s) => s.id === KC_AG_ROSE_ID);
  const huntMw = sitesData.sites.find((s) => s.id === KC_HUNT_MW_ID);
  const portAuth = sitesData.sites.find((s) => s.id === KC_PORT_AUTH_ID);

  if (!agRose || !huntMw || !portAuth) return sitesData;

  const micaSite: Site = {
    ...agRose,
    currentName: "Kansas City, MO — Project Mica",
    label: "Kansas City, MO — Project Mica (Phase 2)",
    metaClusterName: "GDM; Google; Kansas City, MO (Project Mica)",
  };

  const huntMwSite: Site = {
    ...huntMw,
    currentName: "Kansas City, MO — Hunt Midwest",
    label: "Kansas City, MO — Hunt Midwest (Phase 1)",
    metaClusterName: "GDM; Google; Kansas City, MO (Hunt Midwest)",
    metrics: mergeMetrics(huntMw.metrics, portAuth.metrics),
    bbox: mergeBboxes(huntMw.bbox, portAuth.bbox),
  };

  const otherSites = sitesData.sites.filter(
    (s) => s.id !== KC_AG_ROSE_ID && s.id !== KC_HUNT_MW_ID && s.id !== KC_PORT_AUTH_ID
  );

  return {
    ...sitesData,
    sites: [...otherSites, huntMwSite, micaSite],
    globalMetrics: { ...sitesData.globalMetrics, totalSites: otherSites.length + 2 },
  };
}

/* ═══════════════════════════════════════════════════════════
   Rainier 2 Jackson merge (3 → 2)
   Canton (north) = RIDGELAND_NORTH + CANTON entries
   Ridgeland (south) = RIDGELAND_SOUTH stays as-is
   ═══════════════════════════════════════════════════════════ */

function mergeRainier2Sites(sitesData: SitesData): SitesData {
  const ridgeNorth = sitesData.sites.find((s) => s.id === R2_RIDGELAND_NORTH_ID);
  const ridgeSouth = sitesData.sites.find((s) => s.id === R2_RIDGELAND_SOUTH_ID);
  const canton = sitesData.sites.find((s) => s.id === R2_CANTON_ID);

  if (!ridgeNorth || !ridgeSouth || !canton) return sitesData;

  // Merge ridgeNorth (43 parcels) + canton (29 parcels) → "Canton" site
  const cantonSite: Site = {
    ...ridgeNorth,
    currentName: "Rainier 2 Jackson, MS — Canton",
    label: "Rainier 2 Jackson, MS — Canton",
    metaClusterName: "Anthropic; AWS; Canton, MS (Rainier 2)",
    metrics: mergeMetrics(ridgeNorth.metrics, canton.metrics),
    bbox: mergeBboxes(ridgeNorth.bbox, canton.bbox),
  };

  // Rename ridgeSouth → "Ridgeland" site
  const ridgelandSite: Site = {
    ...ridgeSouth,
    currentName: "Rainier 2 Jackson, MS — Ridgeland",
    label: "Rainier 2 Jackson, MS — Ridgeland",
    metaClusterName: "Anthropic; AWS; Ridgeland, MS (Rainier 2)",
  };

  const otherSites = sitesData.sites.filter(
    (s) =>
      s.id !== R2_RIDGELAND_NORTH_ID &&
      s.id !== R2_RIDGELAND_SOUTH_ID &&
      s.id !== R2_CANTON_ID
  );

  return {
    ...sitesData,
    sites: [...otherSites, cantonSite, ridgelandSite],
    globalMetrics: { ...sitesData.globalMetrics, totalSites: otherSites.length + 2 },
  };
}

/* ═══════════════════════════════════════════════════════════
   South Bend IN AWS merge (2 → 1)
   ═══════════════════════════════════════════════════════════ */

function mergeSouthBendSites(sitesData: SitesData): SitesData {
  const amazon = sitesData.sites.find((s) => s.id === SB_AMAZON_ID);
  const razor5 = sitesData.sites.find((s) => s.id === SB_RAZOR5_ID);

  if (!amazon || !razor5) return sitesData;

  const mergedSite: Site = {
    ...amazon,
    currentName: "South Bend, IN AWS",
    label: "South Bend, IN AWS (Rainier 1)",
    metaClusterName: "Anthropic; AWS; New Carlisle, IN (Rainier 1)",
    metrics: mergeMetrics(amazon.metrics, razor5.metrics),
    bbox: mergeBboxes(amazon.bbox, razor5.bbox),
  };

  const otherSites = sitesData.sites.filter(
    (s) => s.id !== SB_AMAZON_ID && s.id !== SB_RAZOR5_ID
  );

  return {
    ...sitesData,
    sites: [...otherSites, mergedSite],
    globalMetrics: { ...sitesData.globalMetrics, totalSites: otherSites.length + 1 },
  };
}

/* ═══════════════════════════════════════════════════════════
   Lueders TX merge (2 → 1)
   ═══════════════════════════════════════════════════════════ */

function mergeLuedersSites(sitesData: SitesData): SitesData {
  const clearfork = sitesData.sites.find((s) => s.id === LUEDERS_CLEARFORK_ID);
  const google = sitesData.sites.find((s) => s.id === LUEDERS_GOOGLE_ID);

  if (!clearfork || !google) return sitesData;

  const mergedSite: Site = {
    ...clearfork,
    currentName: "Lueders, Texas",
    label: "Lueders, TX (Google / GDM)",
    metaClusterName: "GDM; Google; Lueders, TX",
    metrics: mergeMetrics(clearfork.metrics, google.metrics),
    bbox: mergeBboxes(clearfork.bbox, google.bbox),
  };

  const otherSites = sitesData.sites.filter(
    (s) => s.id !== LUEDERS_CLEARFORK_ID && s.id !== LUEDERS_GOOGLE_ID
  );

  return {
    ...sitesData,
    sites: [...otherSites, mergedSite],
    globalMetrics: { ...sitesData.globalMetrics, totalSites: otherSites.length + 1 },
  };
}

/* ═══════════════════════════════════════════════════════════
   Apply all merges
   ═══════════════════════════════════════════════════════════ */

function applyAllSiteMerges(sitesData: SitesData): SitesData {
  let result = sitesData;
  result = mergeKansasCitySites(result);
  result = mergeRainier2Sites(result);
  result = mergeSouthBendSites(result);
  result = mergeLuedersSites(result);
  return result;
}

function applyAllParcelRemaps(parcelsData: ParcelsGeoJSON): ParcelsGeoJSON {
  let result = parcelsData;
  // KC: Port Authority → Hunt Midwest
  result = remapParcels(result, KC_PORT_AUTH_ID, KC_HUNT_MW_ID);
  // Rainier 2: Canton entry → Ridgeland North (Canton primary)
  result = remapParcels(result, R2_CANTON_ID, R2_RIDGELAND_NORTH_ID);
  // South Bend: Razor5 → Amazon
  result = remapParcels(result, SB_RAZOR5_ID, SB_AMAZON_ID);
  // Lueders: Google → Clearfork
  result = remapParcels(result, LUEDERS_GOOGLE_ID, LUEDERS_CLEARFORK_ID);
  return result;
}

function applyAllTimelineMerges(timelineData: TimelineData): TimelineData {
  const result = { ...timelineData };
  // KC: Port Authority milestones → Hunt Midwest
  mergeTimelineMilestones(result, KC_HUNT_MW_ID, KC_PORT_AUTH_ID);
  // Rainier 2: Canton milestones → Ridgeland North (Canton primary)
  mergeTimelineMilestones(result, R2_RIDGELAND_NORTH_ID, R2_CANTON_ID);
  // South Bend: Razor5 milestones → Amazon
  mergeTimelineMilestones(result, SB_AMAZON_ID, SB_RAZOR5_ID);
  // Lueders: Google milestones → Clearfork
  mergeTimelineMilestones(result, LUEDERS_CLEARFORK_ID, LUEDERS_GOOGLE_ID);
  return result;
}

/* ═══════════════════════════════════════════════════════════
   Hook
   ═══════════════════════════════════════════════════════════ */

export function useData(): DataState {
  const [state, setState] = useState<DataState>({
    sitesData: null,
    parcelsData: null,
    timelineData: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [sitesRes, parcelsRes, timelineRes] = await Promise.all([
          fetch(SITES_URL),
          fetch(PARCELS_URL),
          fetch(TIMELINE_URL),
        ]);

        if (!sitesRes.ok || !parcelsRes.ok) {
          throw new Error("Failed to fetch data");
        }

        let sitesData: SitesData = await sitesRes.json();
        let parcelsData: ParcelsGeoJSON = await parcelsRes.json();
        let timelineData: TimelineData = timelineRes.ok
          ? await timelineRes.json()
          : {};

        // Post-process: apply all site merges
        sitesData = applyAllSiteMerges(sitesData);
        parcelsData = applyAllParcelRemaps(parcelsData);
        timelineData = applyAllTimelineMerges(timelineData);

        if (!cancelled) {
          setState({ sitesData, parcelsData, timelineData, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
