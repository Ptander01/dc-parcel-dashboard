/*
 * Cartographic Studio Design — Parcel Map (Leaflet)
 * Full-viewport Leaflet map with Esri satellite imagery.
 * Parcel polygons rendered as GeoJSON layers with native SVG.
 * Symbology driven by external styleMap from Dashboard.
 * Multi-select: zooms to fit all selected sites' core parcels.
 * Smart zoom: prioritizes core parcels (Intersect/OwnerProximity) near DC points.
 * Map markers are color-coded by parent company.
 * Double-click on markers/parcels triggers phase drill-down (if phasing data exists).
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import type { ParcelFeature, Site, PhasePolygonsGeoJSON } from "@/lib/types";
import type { SitePhaseResult } from "@/hooks/usePhases";
import { safeNumber, formatCurrencyFull, formatAcres } from "@/lib/format";
import { getParentCompany, COMPANY_CONFIG } from "@/lib/companies";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface ParcelMapProps {
  parcels: ParcelFeature[];
  sites: Site[];
  selectedSiteIds: Set<string>;
  hoveredParcelId: number | null;
  onParcelClick: (parcel: ParcelFeature | null) => void;
  onSiteDblClick?: (siteId: string) => void;
  symbologyStyleMap: Map<number, L.PathOptions>;
  hasPhasing?: (siteId: string) => boolean;
  phasePolygons?: PhasePolygonsGeoJSON | null;
  highlightedPhase?: string | null;
  phaseResult?: SitePhaseResult | null;
  showPhaseBoundaries?: boolean;
  className?: string;
}

const TERRACOTTA = "#FF6D40";

const defaultStyle: L.PathOptions = {
  color: "#0288D1",
  weight: 2,
  opacity: 0.9,
  fillColor: "#4FC3F7",
  fillOpacity: 0.3,
};

const hoverStyle: L.PathOptions = {
  color: TERRACOTTA,
  weight: 3,
  opacity: 1,
  fillColor: TERRACOTTA,
  fillOpacity: 0.45,
};

// Esri World Imagery tile URL
const ESRI_SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

/** Build a Leaflet divIcon with a specific company color */
function makeMarkerIcon(color: string, size: number, borderWidth: number, hasPhasingData?: boolean): L.DivIcon {
  const borderColor = isVeryDark(color) ? "#888" : "#fff";
  // Add a subtle ring indicator if the site has phasing data
  const phasingRing = hasPhasingData
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px dashed ${color}80;animation:pulse 2s ease-in-out infinite;"></div>`
    : "";
  return L.divIcon({
    className: "dc-marker",
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      ${phasingRing}
      <div style="
        width: ${size}px; height: ${size}px; border-radius: 50%;
        background: ${color}; border: ${borderWidth}px solid ${borderColor};
        box-shadow: 0 ${borderWidth > 2 ? 2 : 1}px ${borderWidth > 2 ? 6 : 4}px rgba(0,0,0,0.4);
        position:relative; z-index:1;
      "></div>
    </div>`,
    iconSize: [size + (hasPhasingData ? 8 : 0), size + (hasPhasingData ? 8 : 0)],
    iconAnchor: [(size + (hasPhasingData ? 8 : 0)) / 2, (size + (hasPhasingData ? 8 : 0)) / 2],
  });
}

/** Check if a hex color is very dark (for border contrast) */
function isVeryDark(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.2;
}

/** Get the company color for a site */
function getSiteColor(site: Site): string {
  const company = getParentCompany(site);
  return COMPANY_CONFIG[company]?.color || COMPANY_CONFIG.Other.color;
}

/** Phase color palette — matches useSpatialPhases.ts */
const PHASE_OVERLAY_COLORS: Record<string, string> = {
  "1": "#10b981",
  "2": "#3b82f6",
  "3": "#f59e0b",
  "4": "#8b5cf6",
  "5": "#ec4899",
  "TBD": "#6b7280",
  "PP 1": "#06b6d4",
  "PP 2": "#14b8a6",
  "1_Hunt": "#10b981",
  "2_Mica": "#3b82f6",
  "Kenosha_WI": "#f97316",
  "4_Cancelled": "#ef4444",
};

function getPhaseOverlayColor(phase: string): string {
  return PHASE_OVERLAY_COLORS[phase] || "#6b7280";
}

function getPhaseOverlayLabel(phase: string): string {
  if (phase === "1_Hunt") return "Phase 1 — Hunt Midwest";
  if (phase === "2_Mica") return "Phase 2 — Project Mica";
  if (phase === "Kenosha_WI") return "Kenosha, WI";
  if (phase === "4_Cancelled") return "Phase 4 (Cancelled)";
  if (phase === "TBD") return "TBD";
  if (phase.startsWith("PP ")) return `PP ${phase.replace("PP ", "")}`;
  if (/^\d+$/.test(phase)) return `Phase ${phase}`;
  return phase;
}

export function ParcelMap({
  parcels,
  sites,
  selectedSiteIds,
  hoveredParcelId,
  onParcelClick,
  onSiteDblClick,
  symbologyStyleMap,
  hasPhasing,
  phasePolygons,
  highlightedPhase,
  phaseResult,
  showPhaseBoundaries = false,
  className,
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const phaseOverlayRef = useRef<L.LayerGroup | null>(null);
  const globalPhaseBoundariesRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const featureLookupRef = useRef<Map<number, L.Layer>>(new Map());
  const featureStyleRef = useRef<Map<number, L.PathOptions>>(new Map());
  const onParcelClickRef = useRef(onParcelClick);
  onParcelClickRef.current = onParcelClick;
  const onSiteDblClickRef = useRef(onSiteDblClick);
  onSiteDblClickRef.current = onSiteDblClick;
  const hasPhasingRef = useRef(hasPhasing);
  hasPhasingRef.current = hasPhasing;

  // Store symbology ref for hover restore
  const symbologyRef = useRef(symbologyStyleMap);
  symbologyRef.current = symbologyStyleMap;

  const hasSelection = selectedSiteIds.size > 0;

  // Stable serialized key for selectedSiteIds
  const selectionKey = useMemo(() => {
    return Array.from(selectedSiteIds).sort().join(",");
  }, [selectedSiteIds]);

  // Filter parcels by selected sites
  const visibleParcels = useMemo(() => {
    if (!hasSelection) return parcels;
    return parcels.filter((p) => selectedSiteIds.has(p.properties._siteId));
  }, [parcels, selectedSiteIds, hasSelection]);

  // Build GeoJSON FeatureCollection
  const geojsonData = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: visibleParcels,
    };
  }, [visibleParcels]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [39.5, -98.35],
      zoom: 5,
      zoomControl: false,
      attributionControl: true,
      doubleClickZoom: false, // Disable default double-click zoom to allow drill-down
    });

    // Custom panes for proper z-ordering
    map.createPane("labelsPane");
    map.getPane("labelsPane")!.style.zIndex = "250";
    map.getPane("labelsPane")!.style.pointerEvents = "none";

    map.createPane("parcelsPane");
    map.getPane("parcelsPane")!.style.zIndex = "450";

    map.createPane("phaseOverlayPane");
    map.getPane("phaseOverlayPane")!.style.zIndex = "440";
    map.getPane("phaseOverlayPane")!.style.pointerEvents = "none";

    // Satellite tiles
    L.tileLayer(ESRI_SATELLITE, {
      maxZoom: 19,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
    }).addTo(map);

    // Labels overlay below parcels
    L.tileLayer(ESRI_LABELS, {
      maxZoom: 19,
      pane: "labelsPane",
    }).addTo(map);

    // Zoom control top-right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Phase overlay layer group (per-site drill-down)
    phaseOverlayRef.current = L.layerGroup().addTo(map);

    // Global phase boundaries layer
    globalPhaseBoundariesRef.current = L.layerGroup().addTo(map);

    // Markers layer group
    markersLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw parcels and markers whenever data or symbology changes
  const drawParcels = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old GeoJSON layer
    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    // Clear markers
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();
    }

    // Clear lookups
    featureLookupRef.current.clear();
    featureStyleRef.current.clear();

    if (visibleParcels.length === 0) return;

    // Create GeoJSON layer in custom parcelsPane
    const geoJsonLayer = L.geoJSON(geojsonData as any, {
      pane: "parcelsPane",
      style: (feature) => {
        const objectId = feature?.properties?.OBJECTID;
        return symbologyStyleMap.get(objectId) || defaultStyle;
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const objectId = props.OBJECTID;

        // Store in lookups
        featureLookupRef.current.set(objectId, layer);
        const style = symbologyStyleMap.get(objectId) || defaultStyle;
        featureStyleRef.current.set(objectId, style);

        // Hover effects
        layer.on("mouseover", () => {
          (layer as L.Path).setStyle(hoverStyle);
          if ((layer as L.Path).bringToFront) {
            (layer as L.Path).bringToFront();
          }
        });

        layer.on("mouseout", () => {
          const currentStyle = symbologyRef.current.get(objectId) || defaultStyle;
          (layer as L.Path).setStyle(currentStyle);
        });

        // Click — popup + callback
        layer.on("click", () => {
          const totVal = safeNumber(props.TOT_VAL);
          const resultType = props.QueryResultType || "";

          const popupContent = `
            <div style="font-family: 'DM Sans', sans-serif; padding: 4px; min-width: 220px;">
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #333;">
                ${props.OWN1_LAST || "Unknown Owner"}
              </div>
              <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                ${props.STD_ADDR || props.ADDR || "No address"}, ${props.CITY || ""} ${props.STATE || ""}
              </div>
              <table style="font-size: 12px; width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 3px 8px 3px 0; color: #888;">APN</td>
                  <td style="padding: 3px 0; font-size: 11px;">${props.APN || "\u2014"}</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 3px 8px 3px 0; color: #888;">Acres</td>
                  <td style="padding: 3px 0;">${formatAcres(safeNumber(props.LAND_ACRES))}</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 3px 8px 3px 0; color: #888;">Total Value</td>
                  <td style="padding: 3px 0;">${totVal > 0 ? formatCurrencyFull(totVal) : "\u2014"}</td>
                </tr>
                <tr>
                  <td style="padding: 3px 8px 3px 0; color: #888;">Type</td>
                  <td style="padding: 3px 0;">
                    <span style="
                      display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px;
                      font-weight: 500; text-transform: uppercase;
                      background: ${resultType === "Intersect" ? "#E5393520" : resultType === "OwnerProximity" ? "#0288D120" : "#FFA72620"};
                      color: ${resultType === "Intersect" ? "#E53935" : resultType === "OwnerProximity" ? "#0288D1" : "#FFA726"};
                    ">${resultType}</span>
                  </td>
                </tr>
              </table>
            </div>
          `;

          layer.bindPopup(popupContent, { maxWidth: 300 }).openPopup();
          onParcelClickRef.current(feature as ParcelFeature);
        });

        // Double-click on parcel → trigger phase drill-down for its site
        layer.on("dblclick", () => {
          const siteId = props._siteId;
          if (siteId && onSiteDblClickRef.current) {
            onSiteDblClickRef.current(siteId);
          }
        });
      },
    }).addTo(map);

    geoJsonLayerRef.current = geoJsonLayer;

    // SMART ZOOM for multi-select
    if (hasSelection) {
      const coreParcels = visibleParcels.filter(
        (p) =>
          p.properties.QueryResultType === "Intersect" ||
          p.properties.QueryResultType === "OwnerProximity"
      );

      if (coreParcels.length > 0) {
        const coreGeoJson = L.geoJSON({
          type: "FeatureCollection",
          features: coreParcels,
        } as any);
        const coreBounds = coreGeoJson.getBounds();
        if (coreBounds.isValid()) {
          map.fitBounds(coreBounds, {
            paddingTopLeft: [360, 80],
            paddingBottomRight: [250, 240],
            maxZoom: 16,
          });
        }
      } else {
        const selectedSites = sites.filter((s) => selectedSiteIds.has(s.id));
        const dcPoints = selectedSites
          .filter((s) => s.dcPoint)
          .map((s) => L.latLng(s.dcPoint![1], s.dcPoint![0]));

        if (dcPoints.length > 0) {
          const pointBounds = L.latLngBounds(dcPoints);
          map.fitBounds(pointBounds, {
            paddingTopLeft: [360, 80],
            paddingBottomRight: [250, 240],
            maxZoom: 14,
          });
        } else {
          const bounds = geoJsonLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, {
              paddingTopLeft: [360, 80],
              paddingBottomRight: [250, 240],
              maxZoom: 16,
            });
          }
        }
      }
    } else {
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          paddingTopLeft: [360, 80],
          paddingBottomRight: [40, 40],
          maxZoom: 6,
        });
      }
    }

    // Add DC point markers — color-coded by parent company
    if (hasSelection) {
      sites.forEach((site) => {
        if (site.dcPoint) {
          const isSelected = selectedSiteIds.has(site.id);
          const color = getSiteColor(site);
          const siteHasPhasing = hasPhasingRef.current ? hasPhasingRef.current(site.id) : false;
          const icon = isSelected
            ? makeMarkerIcon(color, 22, 2.5, siteHasPhasing)
            : makeMarkerIcon(color, 18, 2, false);
          const marker = L.marker([site.dcPoint[1], site.dcPoint[0]], {
            icon,
            title: `${site.currentName || site.label}${siteHasPhasing ? " (double-click for phases)" : ""}`,
            zIndexOffset: isSelected ? 1000 : 500,
            opacity: isSelected ? 1 : 0.5,
          });

          // Double-click on marker → phase drill-down
          marker.on("dblclick", () => {
            if (onSiteDblClickRef.current) {
              onSiteDblClickRef.current(site.id);
            }
          });

          marker.addTo(markersLayerRef.current!);
        }
      });
    } else {
      sites.forEach((site) => {
        if (site.dcPoint) {
          const color = getSiteColor(site);
          const siteHasPhasing = hasPhasingRef.current ? hasPhasingRef.current(site.id) : false;
          const icon = makeMarkerIcon(color, 18, 2, siteHasPhasing);
          const marker = L.marker([site.dcPoint[1], site.dcPoint[0]], {
            icon,
            title: `${site.currentName || site.label}${siteHasPhasing ? " (double-click for phases)" : ""}`,
            zIndexOffset: 500,
          });

          marker.on("dblclick", () => {
            if (onSiteDblClickRef.current) {
              onSiteDblClickRef.current(site.id);
            }
          });

          marker.addTo(markersLayerRef.current!);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleParcels, geojsonData, sites, selectionKey, symbologyStyleMap, hasSelection]);

  // Draw whenever data or symbology changes
  useEffect(() => {
    drawParcels();
  }, [drawParcels]);

  // ─── Phase Polygon Overlay ─────────────────────────────────────────────
  // Renders phase boundary polygons on the map when a phase is highlighted
  // from the Phases tab eye icon, or when phaseResult is active.
  useEffect(() => {
    const map = mapRef.current;
    const overlayGroup = phaseOverlayRef.current;
    if (!map || !overlayGroup) return;

    // Clear existing overlays
    overlayGroup.clearLayers();

    // Only show overlays when we have phase polygons and a highlighted phase or phaseResult
    if (!phasePolygons || !phaseResult) return;

    // Determine which phase polygons to show
    // The phaseResult.configKey is like "spatial-Stargate 1 Abiliene"
    const polyName = phaseResult.configKey.replace("spatial-", "");

    // Filter phase polygon features for this site
    const sitePolygons = phasePolygons.features.filter(
      (f) => f.properties.Site === polyName
    );

    if (sitePolygons.length === 0) return;

    // Determine display mode:
    // - "__show_all__" sentinel → show all phase boundaries prominently
    // - Specific phase ID → show that one prominently, others faintly
    // - null → no overlays (phaseResult alone doesn't trigger overlays)
    if (!highlightedPhase) return;

    const showAll = highlightedPhase === "__show_all__";

    // Extract the raw phase name from the spatial ID (e.g., "spatial-Stargate 1 Abiliene-1" → "1")
    // Handle edge case where polyName itself contains hyphens
    const highlightedRawPhase = (!showAll && highlightedPhase)
      ? highlightedPhase.replace(`spatial-${polyName}-`, "")
      : null;

    for (const polyFeature of sitePolygons) {
      const phase = polyFeature.properties.Phase;
      const color = getPhaseOverlayColor(phase);
      const isHighlighted = highlightedRawPhase === phase;

      // In "show all" mode, show all phase boundaries prominently
      // In single-highlight mode, show the highlighted phase prominently and others faintly
      const fillOpacity = showAll ? 0.22 : isHighlighted ? 0.32 : 0.08;
      const strokeOpacity = showAll ? 0.9 : isHighlighted ? 1 : 0.35;
      const weight = showAll ? 3 : isHighlighted ? 4 : 2;

      // Convert GeoJSON coordinates (which may be in Web Mercator) to Leaflet LatLng
      // Phase polygons from ArcGIS are in WGS84 (lon/lat)
      const geoJsonLayer = L.geoJSON(polyFeature as any, {
        pane: "phaseOverlayPane",
        style: {
          color: color,
          weight: weight,
          opacity: strokeOpacity,
          fillColor: color,
          fillOpacity: fillOpacity,
          dashArray: showAll ? "" : isHighlighted ? "" : "6 4",
        },
      });

      geoJsonLayer.addTo(overlayGroup);

      // Add a label marker at the centroid of the polygon
      try {
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) {
          const center = bounds.getCenter();
          const label = getPhaseOverlayLabel(phase);
          const fontSize = showAll ? 12 : isHighlighted ? 13 : 10;
          const opacity = showAll ? 0.95 : isHighlighted ? 1 : 0.35;

          const labelIcon = L.divIcon({
            className: "phase-overlay-label",
            html: `<div style="
              font-family: 'DM Sans', sans-serif;
              font-size: ${fontSize}px;
              font-weight: 700;
              color: ${color};
              text-shadow: 0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5);
              white-space: nowrap;
              opacity: ${opacity};
              pointer-events: none;
              letter-spacing: 0.5px;
            ">${label}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          L.marker(center, {
            icon: labelIcon,
            interactive: false,
            pane: "phaseOverlayPane",
          }).addTo(overlayGroup);
        }
      } catch {
        // Silently skip label if bounds calculation fails
      }
    }
  }, [phasePolygons, highlightedPhase, phaseResult]);

  // ── Global Phase Boundaries layer (toggle on/off) ──
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = globalPhaseBoundariesRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (!showPhaseBoundaries || !phasePolygons || phasePolygons.features.length === 0) return;

    // Group features by site for labeling
    const bySite = new Map<string, typeof phasePolygons.features>();
    for (const f of phasePolygons.features) {
      const site = f.properties.Site;
      if (!bySite.has(site)) bySite.set(site, []);
      bySite.get(site)!.push(f);
    }

    bySite.forEach((features) => {
      for (const polyFeature of features) {
        const phase = polyFeature.properties.Phase;
        const siteName = polyFeature.properties.Site;
        const color = getPhaseOverlayColor(phase);

        const geoLayer = L.geoJSON(polyFeature as any, {
          pane: "phaseOverlayPane",
          style: {
            color: color,
            weight: 3,
            opacity: 0.85,
            fillColor: color,
            fillOpacity: 0.18,
            dashArray: "",
          },
        });

        geoLayer.addTo(layerGroup);

        // Add label at centroid with site name + phase
        try {
          const bounds = geoLayer.getBounds();
          if (bounds.isValid()) {
            const center = bounds.getCenter();
            const phaseLabel = getPhaseOverlayLabel(phase);
            // Build a two-line label: site name on top, phase below
            const labelHtml = `<div style="
              font-family: 'DM Sans', sans-serif;
              text-align: center;
              pointer-events: none;
              white-space: nowrap;
            ">
              <div style="
                font-size: 11px;
                font-weight: 700;
                color: #fff;
                text-shadow: 0 0 5px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.8);
                letter-spacing: 0.3px;
              ">${siteName}</div>
              <div style="
                font-size: 10px;
                font-weight: 600;
                color: ${color};
                text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5);
                letter-spacing: 0.5px;
                margin-top: 1px;
              ">${phaseLabel}</div>
            </div>`;

            const labelIcon = L.divIcon({
              className: "global-phase-label",
              html: labelHtml,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            });

            L.marker(center, {
              icon: labelIcon,
              interactive: false,
              pane: "phaseOverlayPane",
            }).addTo(layerGroup);
          }
        } catch {
          // Skip label if bounds fail
        }
      }
    });
  }, [showPhaseBoundaries, phasePolygons]);

  // Handle hover highlight from table
  useEffect(() => {
    featureLookupRef.current.forEach((layer, objectId) => {
      if (objectId === hoveredParcelId) {
        (layer as L.Path).setStyle(hoverStyle);
        if ((layer as L.Path).bringToFront) {
          (layer as L.Path).bringToFront();
        }
      } else {
        const origStyle = symbologyRef.current.get(objectId) || defaultStyle;
        (layer as L.Path).setStyle(origStyle);
      }
    });
  }, [hoveredParcelId]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
