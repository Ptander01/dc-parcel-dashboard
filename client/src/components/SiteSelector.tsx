/*
 * Cartographic Studio Design — Site Selector Panel (Multi-Select)
 * Frosted glass floating panel with search and site list.
 * Groups sites by parent company with collapsible sections.
 * Shows Current Name as primary label, Meta Cluster Name as subtitle.
 * Supports multi-select with checkboxes for combining related sites.
 * Terracotta accent on selected state, warm stone background.
 */

import { useState, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  ChevronDown,
  Building2,
} from "lucide-react";
import type { Site } from "@/lib/types";
import { formatCurrency, formatAcres } from "@/lib/format";
import { groupSitesByCompany, COMPANY_CONFIG } from "@/lib/companies";

interface SiteSelectorProps {
  sites: Site[];
  selectedSiteIds: Set<string>;
  onToggleSite: (siteId: string) => void;
  onClearSelection: () => void;
  onSelectAll: (siteIds: string[]) => void;
}

export function SiteSelector({
  sites,
  selectedSiteIds,
  onToggleSite,
  onClearSelection,
  onSelectAll,
}: SiteSelectorProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(Object.keys(COMPANY_CONFIG))
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return sites;
    const q = search.toLowerCase();
    return sites.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.primaryOwner.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        (s.currentName && s.currentName.toLowerCase().includes(q)) ||
        (s.metaClusterName && s.metaClusterName.toLowerCase().includes(q))
    );
  }, [sites, search]);

  const companyGroups = useMemo(() => {
    return groupSitesByCompany(filtered);
  }, [filtered]);

  const selectionCount = selectedSiteIds.size;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedSiteIds.has(s.id));

  const toggleGroup = (company: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(company)) {
        next.delete(company);
      } else {
        next.add(company);
      }
      return next;
    });
  };

  const toggleSelectGroup = (groupSites: Site[]) => {
    const allSelected = groupSites.every((s) => selectedSiteIds.has(s.id));
    if (allSelected) {
      groupSites.forEach((s) => {
        if (selectedSiteIds.has(s.id)) onToggleSite(s.id);
      });
    } else {
      onSelectAll(groupSites.map((s) => s.id));
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="glass-panel rounded-lg p-2 hover:bg-white/60 transition-colors"
        title="Expand site selector"
      >
        <div className="relative">
          <ChevronRight className="w-5 h-5 text-foreground/70" />
          {selectionCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-terracotta text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {selectionCount}
            </span>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="glass-panel rounded-xl w-[340px] max-h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground/70">
            Site Selection
          </h2>
          <div className="flex items-center gap-1">
            {selectionCount > 0 && (
              <button
                onClick={onClearSelection}
                className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
                title="Clear all selections"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
              title="Collapse panel"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search sites or companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white/60 border border-border/50 rounded-lg
                       placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-terracotta/30
                       focus:border-terracotta/50 transition-all"
          />
        </div>

        {/* Select all / clear filtered */}
        {filtered.length > 1 && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                if (allFilteredSelected) {
                  filtered.forEach((s) => {
                    if (selectedSiteIds.has(s.id)) onToggleSite(s.id);
                  });
                } else {
                  onSelectAll(filtered.map((s) => s.id));
                }
              }}
              className="text-[11px] text-terracotta hover:text-terracotta/80 font-medium transition-colors"
            >
              {allFilteredSelected
                ? "Deselect all"
                : `Select all ${filtered.length} results`}
            </button>
          </div>
        )}
      </div>

      {/* Site List — Grouped by Company */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {companyGroups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No sites match your search
          </div>
        ) : (
          companyGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.company);
            const config = COMPANY_CONFIG[group.company] || COMPANY_CONFIG.Other;
            const groupSelectedCount = group.sites.filter((s) =>
              selectedSiteIds.has(s.id)
            ).length;
            const allGroupSelected =
              group.sites.length > 0 &&
              group.sites.every((s) => selectedSiteIds.has(s.id));

            return (
              <div key={group.company} className="border-b border-border/20 last:border-b-0">
                {/* Company Group Header */}
                <button
                  onClick={() => toggleGroup(group.company)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-black/3 transition-colors"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${
                      isExpanded ? "" : "-rotate-90"
                    }`}
                  />
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-xs font-semibold text-foreground/80 tracking-wide flex-1 text-left">
                    {config.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {group.sites.length}
                  </span>
                  {groupSelectedCount > 0 && (
                    <span className="text-[10px] text-terracotta font-medium">
                      ({groupSelectedCount})
                    </span>
                  )}
                  {/* Group checkbox */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectGroup(group.sites);
                    }}
                    className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center transition-all cursor-pointer
                      ${
                        allGroupSelected
                          ? "bg-terracotta border-terracotta"
                          : groupSelectedCount > 0
                          ? "bg-terracotta/30 border-terracotta/50"
                          : "border-muted-foreground/30 hover:border-muted-foreground/50"
                      }`}
                  >
                    {allGroupSelected && (
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    )}
                    {!allGroupSelected && groupSelectedCount > 0 && (
                      <div className="w-1.5 h-0.5 bg-white rounded-full" />
                    )}
                  </div>
                </button>

                {/* Sites within group */}
                {isExpanded && (
                  <div className="pb-1">
                    {group.sites.map((site) => {
                      const isSelected = selectedSiteIds.has(site.id);
                      const displayName =
                        site.currentName || site.primaryOwner;
                      const subtitle =
                        site.metaClusterName ||
                        `${site.location}, ${site.state}`;
                      return (
                        <button
                          key={site.id}
                          onClick={() => onToggleSite(site.id)}
                          className={`w-full text-left pl-10 pr-4 py-2.5 transition-all duration-200 border-l-3
                            ${
                              isSelected
                                ? "bg-terracotta/8 border-l-terracotta"
                                : "border-l-transparent hover:bg-black/3"
                            }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {/* Checkbox */}
                            <div
                              className={`w-4 h-4 mt-0.5 shrink-0 rounded border-2 flex items-center justify-center transition-all
                                ${
                                  isSelected
                                    ? "bg-terracotta border-terracotta"
                                    : "border-muted-foreground/30 hover:border-muted-foreground/50"
                                }`}
                            >
                              {isSelected && (
                                <Check
                                  className="w-3 h-3 text-white"
                                  strokeWidth={3}
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className={`text-sm font-medium leading-tight ${
                                  isSelected
                                    ? "text-terracotta"
                                    : "text-foreground"
                                }`}
                              >
                                {displayName}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-1">
                                {subtitle}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground/80 font-mono">
                                <span>{site.metrics.parcelCount} parcels</span>
                                <span className="text-muted-foreground/30">
                                  |
                                </span>
                                <span>
                                  {formatAcres(site.metrics.totalAcres)}
                                </span>
                                <span className="text-muted-foreground/30">
                                  |
                                </span>
                                <span>
                                  {formatCurrency(site.metrics.totalValue)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer — selection count + site count */}
      <div className="px-4 py-2.5 border-t border-border/40">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Building2 className="w-3 h-3" />
            {companyGroups.length} companies · {filtered.length} sites
          </div>
          {selectionCount > 0 && (
            <div className="text-xs font-medium text-terracotta">
              {selectionCount} selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
