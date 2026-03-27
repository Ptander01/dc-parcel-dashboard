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
import type { ParcelFeature, Site } from "@/lib/types";
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

export function ParcelMap({
  parcels,
  sites,
  selectedSiteIds,
  hoveredParcelId,
  onParcelClick,
  onSiteDblClick,
  symbologyStyleMap,
  hasPhasing,
  className,
}: ParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
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
            ? makeMarkerIcon(color, 18, 2.5, siteHasPhasing)
            : makeMarkerIcon(color, 14, 2, false);
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
          const icon = makeMarkerIcon(color, 14, 2, siteHasPhasing);
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
