export interface SiteMetrics {
  parcelCount: number;
  totalAcres: number;
  totalValue: number;
  landValue: number;
  improvementValue: number;
  marketValue: number;
}

export interface Site {
  id: string;
  label: string;
  location: string;
  primaryOwner: string;
  city: string;
  state: string;
  clipprefix: string | null;
  origFid: number | null;
  queryUniqueId: string | null;
  centroid: [number, number];
  dcPoint: [number, number] | null;
  bbox: [number, number, number, number] | null;
  metrics: SiteMetrics;
  currentName: string | null;
  metaClusterName: string | null;
  namingId: number | null;
}

export interface GlobalMetrics {
  totalSites: number;
  totalParcels: number;
  totalAcres: number;
  totalValue: number;
}

export interface SitesData {
  globalMetrics: GlobalMetrics;
  sites: Site[];
}

export interface ParcelProperties {
  OBJECTID: number;
  APN: string;
  ADDR: string;
  CITY: string;
  STATE: string;
  ZIP: string;
  OWN1_LAST: string;
  OWN1_FRST: string | null;
  OWN2_LAST: string | null;
  TOT_VAL: string | number | null;
  LAN_VAL: string | number | null;
  IMP_VAL: string | number | null;
  ASSD_VAL: number | null;
  MKT_VAL: number | null;
  LAND_ACRES: number;
  LAND_SQ_FT: number;
  TAX_YR: number | null;
  TAX_AMT: number | null;
  LAND_USE: string | null;
  PROP_IND: string | null;
  ZONING: string | null;
  SUB_NAME: string | null;
  YR_BLT: number | null;
  BLD_SQ_FT: number | null;
  LEGAL1: string | null;
  QueryUniqueId: string | null;
  QuerySiteName: string;
  QueryResultType: string;
  STD_ADDR: string | null;
  STD_CITY: string | null;
  STD_STATE: string | null;
  STD_ZIP: string | null;
  FIPS_CODE: string | null;
  CNTY_CODE: string | null;
  _siteId: string;
  _currentName: string | null;
  _metaClusterName: string | null;
  _namingId: number | null;
}

export interface ParcelFeature {
  type: "Feature";
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
  properties: ParcelProperties;
}

export interface ParcelsGeoJSON {
  type: "FeatureCollection";
  features: ParcelFeature[];
}

/* ─── Timeline types ─── */
export interface TimelineMilestone {
  date: string | null;
  year: number | null;
  month: number | null;
  stageGate: string;
  milestone: string;
  type1: string;
  type2: string;
  detail: string;
  actionedBy: string;
  sourceName: string;
  sourceLink: string;
}

/** Map from site ID to array of milestones (sorted chronologically) */
export type TimelineData = Record<string, TimelineMilestone[]>;

/* ─── Phase polygon spatial join types ─── */
export interface PhaseAssignment {
  site: string;
  phase: string;
}

export interface PhaseAggregation {
  parcelCount: number;
  totalAcres: number;
  totalValue: number;
}

export interface PhaseAssignmentsData {
  assignments: Record<string, PhaseAssignment>;  // parcel OBJECTID → phase info
  aggregations: Record<string, Record<string, PhaseAggregation>>;  // site → phase → agg
  phasePolygons: Record<string, { site: string; phase: string; objectid: number }>;
}

export interface PhasePolygonFeature {
  type: "Feature";
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
  properties: {
    OBJECTID: number;
    Site: string;
    Phase: string;
    Shape_Length: number;
    Shape_Area: number;
    Field: number;
  };
}

export interface PhasePolygonsGeoJSON {
  type: "FeatureCollection";
  features: PhasePolygonFeature[];
}

/* ─── Parent company grouping ─── */
export interface CompanyGroup {
  company: string;
  sites: Site[];
}
