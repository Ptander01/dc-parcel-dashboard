import { useState, useEffect } from "react";
import type { SitesData, ParcelsGeoJSON, TimelineData } from "@/lib/types";

const SITES_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663348511113/HQS4SQ7gKiCdBgjmaVCmNU/sites_89eb3daf.json";
const PARCELS_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663348511113/HQS4SQ7gKiCdBgjmaVCmNU/parcels_654f57cb.geojson";
const TIMELINE_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663348511113/FuT3jd9kTgsQVw8s7BkLWz/timeline_9a1af74b.json";

interface DataState {
  sitesData: SitesData | null;
  parcelsData: ParcelsGeoJSON | null;
  timelineData: TimelineData | null;
  loading: boolean;
  error: string | null;
}

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

        const sitesData: SitesData = await sitesRes.json();
        const parcelsData: ParcelsGeoJSON = await parcelsRes.json();
        const timelineData: TimelineData = timelineRes.ok
          ? await timelineRes.json()
          : {};

        if (!cancelled) {
          setState({
            sitesData,
            parcelsData,
            timelineData,
            loading: false,
            error: null,
          });
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
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
