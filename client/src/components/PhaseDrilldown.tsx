/*
 * Cartographic Studio Design — Phase Drill-Down Panel
 * Floating glass panel that appears on double-click of a site with phasing data.
 * Shows site-level totals (MW, investment, GPUs) and each phase as a collapsible card with:
 *   - Phase label, color indicator, and status badge
 *   - Enriched details: power, buildings, energization, investment, GPU config, cooling
 *   - Aggregated parcel metrics (count, acres, value)
 *   - List of matched parcels with key attributes
 * Also shows unassigned parcels at the bottom.
 */

import { useState, useCallback } from "react";
import {
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  MapPin,
  Zap,
  Building,
  Calendar,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  DollarSign,
  Cpu,
  Thermometer,
  Info,
  Activity,
} from "lucide-react";
import type { SitePhaseResult, PhaseWithMetrics, SiteTotals } from "@/hooks/usePhases";
import type { ParcelFeature } from "@/lib/types";
import { formatAcres, formatCurrency, safeNumber } from "@/lib/format";

interface PhaseDrilldownProps {
  result: SitePhaseResult;
  onClose: () => void;
  onHighlightPhase: (phaseId: string | null) => void;
  highlightedPhase: string | null;
  onHoverParcel: (objectId: number | null) => void;
}

/* ─── Site Totals Banner ─── */
function SiteTotalsBanner({ totals }: { totals: SiteTotals }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 mt-3">
      {totals.estimatedMW && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-amber-700/70 font-medium">Power</div>
            <div className="text-xs font-bold text-amber-800">{totals.estimatedMW}</div>
          </div>
        </div>
      )}
      {totals.investmentTotal && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-emerald-700/70 font-medium">Investment</div>
            <div className="text-xs font-bold text-emerald-800">{totals.investmentTotal}</div>
          </div>
        </div>
      )}
      {totals.gpuTotal && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Cpu className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-blue-700/70 font-medium">GPUs</div>
            <div className="text-xs font-bold text-blue-800">{totals.gpuTotal}</div>
          </div>
        </div>
      )}
      {totals.energizationWindow && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <div>
            <div className="text-[9px] uppercase tracking-wider text-purple-700/70 font-medium">Timeline</div>
            <div className="text-xs font-bold text-purple-800">{totals.energizationWindow}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Phase Card ─── */
function PhaseCard({
  phase,
  isHighlighted,
  onToggleHighlight,
  onHoverParcel,
}: {
  phase: PhaseWithMetrics;
  isHighlighted: boolean;
  onToggleHighlight: () => void;
  onHoverParcel: (objectId: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = (() => {
    const s = (phase.details.status || "").toLowerCase();
    if (s.includes("completion") || s.includes("operational") || s.includes("active")) return "bg-emerald-500";
    if (s.includes("construction") || s.includes("started")) return "bg-blue-500";
    if (s.includes("progress") || s.includes("approved")) return "bg-amber-500";
    if (s.includes("not started") || s.includes("awaiting")) return "bg-gray-400";
    return "bg-gray-400";
  })();

  const d = phase.details;

  return (
    <div
      className={`rounded-lg border transition-all duration-200 ${
        isHighlighted
          ? "border-current shadow-md"
          : "border-border/40 hover:border-border/60"
      }`}
      style={isHighlighted ? { borderColor: phase.color + "80" } : undefined}
    >
      {/* Phase Header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/50"
          style={{ backgroundColor: phase.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {phase.label}
            </span>
            {d.status && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-medium text-white uppercase tracking-wider ${statusColor}`}
              >
                {d.status.length > 40 ? d.status.slice(0, 38) + "…" : d.status}
              </span>
            )}
          </div>
          {/* Quick stats under label */}
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-foreground/50">
            {d.power && <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{d.power}</span>}
            {d.buildings && <span className="flex items-center gap-0.5"><Building className="w-2.5 h-2.5" />{d.buildings}</span>}
          </div>
        </div>

        {/* Metrics summary */}
        <div className="flex items-center gap-3 text-xs font-mono text-foreground/60 shrink-0">
          <span>{phase.parcelCount} parcels</span>
          <span>{formatAcres(phase.totalAcres)}</span>
        </div>

        {/* Highlight toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleHighlight();
          }}
          className={`p-1 rounded transition-colors ${
            isHighlighted
              ? "text-white"
              : "text-foreground/40 hover:text-foreground/70"
          }`}
          style={isHighlighted ? { color: phase.color } : undefined}
          title={isHighlighted ? "Hide phase on map" : "Show phase on map"}
        >
          {isHighlighted ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
        </button>

        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30">
          {/* Description */}
          <p className="text-xs text-foreground/60 mt-2 mb-3 leading-relaxed">
            {phase.description}
          </p>

          {/* Enriched detail pills — 2 columns */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {d.power && (
              <DetailPill icon={Zap} label="Power" value={d.power} />
            )}
            {d.buildings && (
              <DetailPill icon={Building} label="Buildings" value={d.buildings} />
            )}
            {d.energization && (
              <DetailPill icon={Calendar} label="Energization" value={d.energization} />
            )}
            {d.investment && (
              <DetailPill icon={DollarSign} label="Investment" value={d.investment} />
            )}
            {d.gpuConfig && (
              <DetailPill icon={Cpu} label="GPU Config" value={d.gpuConfig} />
            )}
            {d.cooling && d.cooling !== "TBD" && (
              <DetailPill icon={Thermometer} label="Cooling" value={d.cooling} />
            )}
            {d.operator && (
              <DetailPill icon={User} label="Operator" value={d.operator} />
            )}
            {d.acreage && (
              <DetailPill icon={MapPin} label="Expansion" value={d.acreage} />
            )}
          </div>

          {/* Source attribution */}
          {d.source && (
            <div className="flex items-center gap-1.5 text-[9px] text-foreground/35 mb-3 italic">
              <Info className="w-2.5 h-2.5 shrink-0" />
              Source: {d.source}
            </div>
          )}

          {/* Aggregated metrics bar */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MetricBox label="Parcels" value={String(phase.parcelCount)} />
            <MetricBox label="Acres" value={formatAcres(phase.totalAcres)} />
            <MetricBox
              label="Value"
              value={phase.totalValue > 0 ? formatCurrency(phase.totalValue) : "\u2014"}
            />
          </div>

          {/* Parcel list */}
          {phase.matchedParcels.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-foreground/40 mb-1.5">
                Parcels in this phase
              </div>
              <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar">
                {phase.matchedParcels.map((p) => (
                  <ParcelRow
                    key={p.properties.OBJECTID}
                    parcel={p}
                    phaseColor={phase.color}
                    onHover={onHoverParcel}
                  />
                ))}
              </div>
            </div>
          )}

          {phase.unmatchedCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600">
              <AlertCircle className="w-3 h-3" />
              {phase.unmatchedCount} parcel(s) in phase data not found in current dataset
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-foreground/5 text-[11px]">
      <Icon className="w-3 h-3 text-foreground/40 shrink-0" />
      <span className="text-foreground/50">{label}:</span>
      <span className="text-foreground/80 font-medium leading-tight">{value}</span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-foreground/[0.03] px-2.5 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-foreground/40 mb-0.5">
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground font-mono">{value}</div>
    </div>
  );
}

function ParcelRow({
  parcel,
  phaseColor,
  onHover,
}: {
  parcel: ParcelFeature;
  phaseColor: string;
  onHover: (objectId: number | null) => void;
}) {
  const p = parcel.properties;
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-foreground/[0.03] transition-colors cursor-pointer"
      onMouseEnter={() => onHover(p.OBJECTID)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: phaseColor }}
      />
      <span className="text-[11px] font-mono text-foreground/50 w-[90px] truncate">
        {p.APN || "\u2014"}
      </span>
      <span className="text-[11px] text-foreground/70 flex-1 truncate">
        {p.OWN1_LAST || "\u2014"}
      </span>
      <span className="text-[11px] font-mono text-foreground/50">
        {formatAcres(p.LAND_ACRES || 0)}
      </span>
      <span className="text-[11px] font-mono text-foreground/50">
        {safeNumber(p.TOT_VAL) > 0 ? formatCurrency(safeNumber(p.TOT_VAL)) : "\u2014"}
      </span>
    </div>
  );
}

export function PhaseDrilldown({
  result,
  onClose,
  onHighlightPhase,
  highlightedPhase,
  onHoverParcel,
}: PhaseDrilldownProps) {
  const [showUnassigned, setShowUnassigned] = useState(false);

  const handleToggleHighlight = useCallback(
    (phaseId: string) => {
      onHighlightPhase(highlightedPhase === phaseId ? null : phaseId);
    },
    [highlightedPhase, onHighlightPhase]
  );

  return (
    <div className="glass-panel rounded-xl w-[440px] max-h-[calc(100vh-7rem)] flex flex-col shadow-xl">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/40 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-terracotta" />
            <h2 className="text-sm font-bold text-foreground">
              Phase Drill-Down
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4 text-foreground/50" />
          </button>
        </div>
        <p className="text-xs text-foreground/60 leading-relaxed">
          {result.displayName} — {result.phases.length} phases, {result.totalParcels} parcels,{" "}
          {formatAcres(result.totalAcres)}
        </p>

        {/* Site-level totals banner */}
        {result.totals && <SiteTotalsBanner totals={result.totals} />}

        {/* Parcel summary metrics */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <MetricBox label="Total Parcels" value={String(result.totalParcels)} />
          <MetricBox label="Total Acres" value={formatAcres(result.totalAcres)} />
          <MetricBox
            label="Total Value"
            value={result.totalValue > 0 ? formatCurrency(result.totalValue) : "\u2014"}
          />
        </div>

        {/* Sources */}
        {result.totals?.sources && result.totals.sources.length > 0 && (
          <div className="flex items-center gap-1.5 text-[9px] text-foreground/35 mt-2 italic">
            <Info className="w-2.5 h-2.5 shrink-0" />
            Sources: {result.totals.sources.join("; ")}
          </div>
        )}
      </div>

      {/* Phase cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {result.phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            isHighlighted={highlightedPhase === phase.id}
            onToggleHighlight={() => handleToggleHighlight(phase.id)}
            onHoverParcel={onHoverParcel}
          />
        ))}

        {/* Unassigned parcels section */}
        {result.unassignedParcels.length > 0 && (
          <div className="rounded-lg border border-border/30 mt-2">
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              onClick={() => setShowUnassigned(!showUnassigned)}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-gray-400/50 shrink-0" />
              <span className="text-sm font-medium text-foreground/60 flex-1">
                Unassigned Parcels
              </span>
              <span className="text-xs font-mono text-foreground/40">
                {result.unassignedParcels.length}
              </span>
              {showUnassigned ? (
                <ChevronDown className="w-3.5 h-3.5 text-foreground/40" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-foreground/40" />
              )}
            </button>
            {showUnassigned && (
              <div className="px-3 pb-3 border-t border-border/20">
                <p className="text-[10px] text-foreground/40 mt-2 mb-2">
                  These parcels belong to the site but aren't assigned to a specific phase yet.
                </p>
                <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
                  {result.unassignedParcels.map((p) => (
                    <ParcelRow
                      key={p.properties.OBJECTID}
                      parcel={p}
                      phaseColor="#9ca3af"
                      onHover={onHoverParcel}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2.5 border-t border-border/40 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-foreground/40">
          <MapPin className="w-3 h-3" />
          Click the eye icon to highlight a phase's parcels on the map
        </div>
      </div>
    </div>
  );
}
