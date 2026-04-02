/**
 * Cartographic Studio Design — Dashboard Page
 * Full-viewport layout: map as base canvas with floating glass panels.
 * Left: Site selector (multi-select, grouped by parent company).
 * Top-right: KPI cards. Right: Symbology + Legend.
 * Bottom: Data table drawer with CSV export.
 * Center-right: Compare Sites chart (when 2+ sites selected).
 * Center: Site Intelligence Panel (tabbed: Timeline, Phases, Parcels).
 *
 * Sprint 4 additions:
 *  - Land Intel banners on Phases tab (analyst transaction data for 7 sites)
 *  - Updated phase polygons (xAI Colossus Phase 1, AWS Indiana Phase 4 Cancelled)
 *  - Merged timeline milestones (5 new Mississippi entries)
 *  - Local data bundling (client/public/data/) for CORS-safe deployment
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { Loader2, AlertTriangle, Layers, BarChart3, Activity, Map as MapIcon } from "lucide-react";
import { useData } from "@/hooks/useData";
import { usePhases } from "@/hooks/usePhases";
import { useSpatialPhases } from "@/hooks/useSpatialPhases";
import { SiteSelector } from "@/components/SiteSelector";
import { KpiCards } from "@/components/KpiCards";
import { ParcelTable } from "@/components/ParcelTable";
import { ParcelMap } from "@/components/ParcelMap";
import { SymbologyPanel } from "@/components/SymbologyPanel";
import { CompareSites } from "@/components/CompareSites";
import { SiteIntelligencePanel } from "@/components/SiteIntelligencePanel";
import { FloatingPanel } from "@/components/FloatingPanel";
import type { ParcelFeature, Site, LandIntelData } from "@/lib/types";
import { safeNumber } from "@/lib/format";
import { buildSymbology, setPhaseAssignmentLookup } from "@/lib/symbology";
import type { SymbologyMode } from "@/lib/symbology";

export default function Dashboard() {
  const { sitesData, parcelsData, timelineData, phaseAssignments, phasePolygons, landIntel, loading, error } = useData();
  const { hasPhasing: hasApnPhasing, buildPhaseResult: buildApnPhaseResult } = usePhases();
  const { hasSpatialPhasing, buildSpatialPhaseResult } = useSpatialPhases(phaseAssignments, phasePolygons);

  // Keep the phase assignment lookup in sync for phase symbology mode
  useEffect(() => {
    setPhaseAssignmentLookup(phaseAssignments?.assignments || null);
  }, [phaseAssignments]);

  // Unified hasPhasing: true if either spatial or APN-based data exists
  const hasPhasing = useCallback(
    (siteId: string) => hasSpatialPhasing(siteId) || hasApnPhasing(siteId),
    [hasSpatialPhasing, hasApnPhasing]
  );
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(new Set());
  const [hoveredParcelId, setHoveredParcelId] = useState<number | null>(null);
  const [_selectedParcel, setSelectedParcel] = useState<ParcelFeature | null>(null);
  const [symbologyMode, setSymbologyMode] = useState<SymbologyMode>("type");
  const [showCompare, setShowCompare] = useState(false);
  const [showSiteIntel, setShowSiteIntel] = useState(false);
  const [showPhaseBoundaries, setShowPhaseBoundaries] = useState(false);

  // Phase highlight state (shared with SiteIntelligencePanel)
  const [highlightedPhase, setHighlightedPhase] = useState<string | null>(null);

  // Multi-select handlers
  const handleToggleSite = useCallback((siteId: string) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedSiteIds(new Set());
    setShowCompare(false);
    setShowSiteIntel(false);
    setHighlightedPhase(null);
  }, []);

  const handleSelectAll = useCallback((siteIds: string[]) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      siteIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  // Double-click handler — opens Site Intel panel automatically
  const handleSiteDblClick = useCallback(
    (siteId: string) => {
      // Ensure the site is selected
      setSelectedSiteIds((prev) => {
        const next = new Set(prev);
        next.add(siteId);
        return next;
      });
      setShowSiteIntel(true);
    },
    []
  );

  const handleCloseSiteIntel = useCallback(() => {
    setShowSiteIntel(false);
    setHighlightedPhase(null);
  }, []);

  const hasSelection = selectedSiteIds.size > 0;

  // Filter parcels by selected sites
  const visibleParcels = useMemo(() => {
    if (!parcelsData) return [];
    if (!hasSelection) return parcelsData.features;
    return parcelsData.features.filter(
      (p) => selectedSiteIds.has(p.properties._siteId)
    );
  }, [parcelsData, selectedSiteIds, hasSelection]);

  // Compute KPI metrics for visible parcels
  const metrics = useMemo(() => {
    const count = visibleParcels.length;
    const acres = visibleParcels.reduce(
      (sum, p) => sum + (p.properties.LAND_ACRES || 0),
      0
    );
    const value = visibleParcels.reduce(
      (sum, p) => sum + safeNumber(p.properties.TOT_VAL),
      0
    );
    const costPerAcre = acres > 0 ? value / acres : 0;
    return { count, acres, value, costPerAcre };
  }, [visibleParcels]);

  // Build symbology for visible parcels
  const symbology = useMemo(() => {
    return buildSymbology(visibleParcels, symbologyMode);
  }, [visibleParcels, symbologyMode]);

  // Build phase result for the Site Intelligence Panel
  // Prefer spatial phase data; fall back to APN-based phasing
  const phaseResult = useMemo(() => {
    if (!parcelsData) return null;

    // Try spatial phasing first (covers Stargate, xAI, AWS Indiana, Mt Pleasant, KC)
    const siteWithSpatial = Array.from(selectedSiteIds).find((id) => hasSpatialPhasing(id));
    if (siteWithSpatial) {
      return buildSpatialPhaseResult(selectedSiteIds, parcelsData.features);
    }

    // Fall back to APN-based phasing
    const siteWithApn = Array.from(selectedSiteIds).find((id) => hasApnPhasing(id));
    if (!siteWithApn) return null;
    const siteSet = new Set([siteWithApn]);
    return buildApnPhaseResult(siteSet, parcelsData.features);
  }, [selectedSiteIds, parcelsData, hasSpatialPhasing, buildSpatialPhaseResult, hasApnPhasing, buildApnPhaseResult]);

  // Build phase highlight style map (overrides symbology when a phase is highlighted)
  const phaseStyleMap = useMemo(() => {
    const map = new Map<number, L.PathOptions>();
    if (!phaseResult || !highlightedPhase) return map;

    const phase = phaseResult.phases.find((p) => p.id === highlightedPhase);
    if (!phase) return map;

    // Highlight matched parcels with the phase color
    for (const parcel of phase.matchedParcels) {
      map.set(parcel.properties.OBJECTID, {
        color: phase.color,
        weight: 3,
        opacity: 1,
        fillColor: phase.color,
        fillOpacity: 0.45,
      });
    }

    // Dim all other parcels
    for (const p of visibleParcels) {
      if (!map.has(p.properties.OBJECTID)) {
        map.set(p.properties.OBJECTID, {
          color: "#888",
          weight: 1,
          opacity: 0.4,
          fillColor: "#888",
          fillOpacity: 0.1,
        });
      }
    }

    return map;
  }, [phaseResult, highlightedPhase, visibleParcels]);

  // Merge symbology with phase highlights
  const effectiveStyleMap = useMemo(() => {
    if (phaseStyleMap.size > 0) return phaseStyleMap;
    return symbology.styleMap;
  }, [phaseStyleMap, symbology.styleMap]);

  // Get selected site info for header
  const headerSubtitle = useMemo(() => {
    if (!hasSelection || !sitesData) return "Imagery and Parcels Overlay";
    if (selectedSiteIds.size === 1) {
      const siteId = Array.from(selectedSiteIds)[0];
      const site = sitesData.sites.find((s) => s.id === siteId);
      if (site) {
        return site.metaClusterName || `${site.primaryOwner} — ${site.location}, ${site.state}`;
      }
    }
    return `${selectedSiteIds.size} sites selected`;
  }, [selectedSiteIds, sitesData, hasSelection]);

  const handleParcelClick = useCallback((parcel: ParcelFeature | null) => {
    setSelectedParcel(parcel);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
          <div className="text-sm text-muted-foreground font-medium">
            Loading parcel data...
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !sitesData || !parcelsData) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <div className="text-sm text-muted-foreground">
            Failed to load data: {error || "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Full-viewport map as base canvas */}
      <ParcelMap
        parcels={parcelsData.features}
        sites={sitesData.sites}
        selectedSiteIds={selectedSiteIds}
        hoveredParcelId={hoveredParcelId}
        onParcelClick={handleParcelClick}
        onSiteDblClick={handleSiteDblClick}
        symbologyStyleMap={effectiveStyleMap}
        hasPhasing={hasPhasing}
        phasePolygons={phasePolygons}
        highlightedPhase={highlightedPhase}
        phaseResult={phaseResult}
        showPhaseBoundaries={showPhaseBoundaries}
        className="!h-full !w-full absolute inset-0"
      />

      {/* Top bar — title and context + action buttons */}
      <div className="absolute top-0 left-0 right-0 z-[1100] pointer-events-none">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="glass-panel rounded-lg px-4 py-2.5 pointer-events-auto flex items-center gap-3">
            <Layers className="w-5 h-5 text-terracotta" />
            <div>
              <h1 className="text-sm font-bold text-foreground leading-none">
                DC Site Expansion Analysis
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[400px] truncate">
                {headerSubtitle}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Phase Boundaries toggle — always visible */}
            <button
              onClick={() => setShowPhaseBoundaries(!showPhaseBoundaries)}
              className={`glass-panel rounded-lg flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all
                ${
                  showPhaseBoundaries
                    ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30"
                    : "text-foreground/70 hover:text-foreground hover:bg-white/60"
                }`}
              title="Toggle phase boundary polygons on the map"
            >
              <MapIcon className="w-3.5 h-3.5" />
              Phase Boundaries
            </button>

            {hasSelection && (
              <div className="glass-panel rounded-lg flex items-center gap-1 px-2 py-1.5">
                {selectedSiteIds.size >= 2 && (
                  <button
                    onClick={() => setShowCompare(!showCompare)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                      ${
                        showCompare
                          ? "bg-terracotta/10 text-terracotta"
                          : "text-foreground/70 hover:text-terracotta hover:bg-terracotta/5"
                      }`}
                    title="Compare selected sites"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Compare
                  </button>
                )}
                <button
                  onClick={() => setShowSiteIntel(!showSiteIntel)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    ${
                      showSiteIntel
                        ? "bg-terracotta/10 text-terracotta"
                        : "text-foreground/70 hover:text-terracotta hover:bg-terracotta/5"
                    }`}
                  title="Open Site Intelligence panel"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Site Intel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Left panel — Site Selector (Multi-Select, grouped by company) */}
      <div className="absolute top-16 left-4 z-[1100]">
        <SiteSelector
          sites={sitesData.sites}
          selectedSiteIds={selectedSiteIds}
          onToggleSite={handleToggleSite}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
        />
      </div>

      {/* Right panel — KPI Cards + Symbology */}
      <div className="absolute top-16 right-4 z-[1100] flex flex-col gap-3 items-end">
        <KpiCards
          parcelCount={metrics.count}
          totalAcres={metrics.acres}
          totalValue={metrics.value}
          costPerAcre={metrics.costPerAcre}
        />
        <SymbologyPanel
          mode={symbologyMode}
          onModeChange={setSymbologyMode}
          legend={symbology.legend}
          legendTitle={symbology.legendTitle}
        />
      </div>

      {/* Compare Sites panel — floating, draggable + resizable */}
      {showCompare && selectedSiteIds.size >= 2 && (
        <FloatingPanel
          initialX={Math.round(window.innerWidth / 2 - 350)}
          initialY={60}
          initialWidth={700}
          initialHeight={480}
          minWidth={420}
          minHeight={320}
          showMaximize={true}
          zIndex={1100}
        >
          <CompareSites
            sites={sitesData.sites}
            selectedSiteIds={selectedSiteIds}
            parcels={parcelsData?.features || []}
            onClose={() => setShowCompare(false)}
          />
        </FloatingPanel>
      )}

      {/* Site Intelligence Panel — combined Timeline + Phases + Parcels */}
      {showSiteIntel && hasSelection && (
        <SiteIntelligencePanel
          sites={sitesData.sites}
          selectedSiteIds={selectedSiteIds}
          timelineData={timelineData}
          parcels={parcelsData.features}
          phaseResult={phaseResult}
          phaseAssignments={phaseAssignments}
          phasePolygons={phasePolygons}
          landIntel={landIntel}
          hasPhasing={hasPhasing}
          highlightedPhase={highlightedPhase}
          onHighlightPhase={setHighlightedPhase}
          onHoverParcel={setHoveredParcelId}
          onClickParcel={handleParcelClick}
          onClose={handleCloseSiteIntel}
        />
      )}

      {/* Bottom panel — Data Table (filtered by selected sites) with CSV export */}
      <div className="absolute bottom-0 left-0 right-0 z-[1100]">
        <ParcelTable
          parcels={visibleParcels}
          onHoverParcel={setHoveredParcelId}
          onClickParcel={handleParcelClick}
        />
      </div>
    </div>
  );
}
