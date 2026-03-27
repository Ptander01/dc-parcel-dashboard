/*
 * Cartographic Studio — Parent Company Grouping Utility
 * Derives the primary company from the metaClusterName field.
 * Format: "Company1; Company2; Location (Project Name)"
 * We normalize similar names (GDM -> Google, Anthropic (Suspected) -> Anthropic/AWS).
 *
 * Color key matches the official company color template:
 *   Amazon   = Orange (#f97316)
 *   Microsoft = #8dc63f
 *   Google   = #ea4335
 *   Meta     = #0064e0
 *   xAI      = Black (#111111)
 *   OpenAI   = #e3cb03
 *   Oracle   = #c74634
 *   CoreWeave = #2741e7
 *   Anthropic = #c96442ff
 *   SpaceX   = #0064e0
 *   Musk/Elon = #333333 (umbrella for xAI, SpaceX, EdgeConneX Austin)
 */

import type { Site, CompanyGroup } from "@/lib/types";

/** Company display config with colors matching the official color key */
export const COMPANY_CONFIG: Record<
  string,
  { label: string; color: string; order: number }
> = {
  OpenAI: { label: "OpenAI / Stargate", color: "#e3cb03", order: 1 },
  "Anthropic/AWS": { label: "Anthropic / AWS", color: "#c96442", order: 2 },
  Google: { label: "Google / GDM", color: "#ea4335", order: 3 },
  "Musk/Elon": { label: "Musk / Elon", color: "#333333", order: 4 },
  "Core42/G42": { label: "Core42 / G42", color: "#2741e7", order: 6 },
  Microsoft: { label: "Microsoft", color: "#8dc63f", order: 7 },
  Other: { label: "Other", color: "#6b7280", order: 99 },
};

/** Sub-brand colors for sites within the Musk/Elon umbrella */
export const MUSK_SUB_BRANDS: Record<string, { label: string; color: string }> = {
  xAI: { label: "xAI", color: "#111111" },
  SpaceX: { label: "SpaceX", color: "#0064e0" },
  EdgeConneX: { label: "EdgeConneX", color: "#6b7280" },
};

/** Extract the normalized parent company from a site's metaClusterName */
export function getParentCompany(site: Site): string {
  const meta = site.metaClusterName || "";
  if (!meta) return "Other";

  const firstPart = meta.split(";")[0].trim();

  // Normalize company names
  if (firstPart === "GDM" || firstPart === "Google") return "Google";
  if (firstPart === "Anthropic" || firstPart === "Anthropic (Suspected)")
    return "Anthropic/AWS";
  if (firstPart === "OpenAI") return "OpenAI";
  if (firstPart === "xAI") return "Musk/Elon";
  if (firstPart === "SpaceX") return "Musk/Elon";
  if (firstPart.startsWith("EdgeConneX")) return "Musk/Elon";
  if (firstPart === "Core 42") return "Core42/G42";
  if (firstPart === "Microsoft") return "Microsoft";
  if (firstPart === "TBD") return "Other";

  return "Other";
}

/** Get the sub-brand key for Musk/Elon sites */
export function getMuskSubBrand(site: Site): string {
  const meta = site.metaClusterName || "";
  const firstPart = meta.split(";")[0].trim();
  if (firstPart === "xAI") return "xAI";
  if (firstPart === "SpaceX") return "SpaceX";
  if (firstPart.startsWith("EdgeConneX")) return "EdgeConneX";
  return "Other";
}

/** Group sites by parent company, sorted by config order */
export function groupSitesByCompany(sites: Site[]): CompanyGroup[] {
  const groups = new Map<string, Site[]>();

  for (const site of sites) {
    const company = getParentCompany(site);
    if (!groups.has(company)) {
      groups.set(company, []);
    }
    groups.get(company)!.push(site);
  }

  return Array.from(groups.entries())
    .map(([company, companySites]) => ({ company, sites: companySites }))
    .sort((a, b) => {
      const orderA = COMPANY_CONFIG[a.company]?.order ?? 50;
      const orderB = COMPANY_CONFIG[b.company]?.order ?? 50;
      return orderA - orderB;
    });
}
