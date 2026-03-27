/*
 * Symbology Panel — Mode selector + dynamic legend.
 * Frosted glass floating panel, positioned below KPI cards on the right.
 * Allows switching between categorical and graduated color-coding modes.
 */

import { useState } from "react";
import { Palette, ChevronDown, ChevronUp, ChevronRight, ChevronLeft } from "lucide-react";
import type { SymbologyMode, LegendEntry } from "@/lib/symbology";
import { SYMBOLOGY_OPTIONS } from "@/lib/symbology";

interface SymbologyPanelProps {
  mode: SymbologyMode;
  onModeChange: (mode: SymbologyMode) => void;
  legend: LegendEntry[];
  legendTitle: string;
}

export function SymbologyPanel({
  mode,
  onModeChange,
  legend,
  legendTitle,
}: SymbologyPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const currentOption = SYMBOLOGY_OPTIONS.find((o) => o.id === mode);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="glass-panel rounded-lg p-2 hover:bg-white/60 transition-colors"
        title="Show symbology panel"
      >
        <Palette className="w-5 h-5 text-foreground/70" />
      </button>
    );
  }

  return (
    <div className="glass-panel rounded-xl w-[240px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-border/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-terracotta" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
              Symbology
            </span>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-md hover:bg-black/5 transition-colors"
            title="Collapse panel"
          >
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Mode Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white/60
                       border border-border/50 rounded-lg hover:bg-white/80 transition-colors"
          >
            <div className="text-left min-w-0">
              <div className="font-medium text-foreground text-xs truncate">
                {currentOption?.label || "Select mode"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {currentOption?.description}
              </div>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2 transition-transform ${
                dropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 glass-panel rounded-lg shadow-lg overflow-hidden z-50">
              {SYMBOLOGY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    onModeChange(option.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-black/5 transition-colors border-b border-border/20 last:border-b-0
                    ${mode === option.id ? "bg-terracotta/8" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        mode === option.id ? "bg-terracotta" : "bg-transparent"
                      }`}
                    />
                    <div>
                      <div
                        className={`text-xs font-medium ${
                          mode === option.id ? "text-terracotta" : "text-foreground"
                        }`}
                      >
                        {option.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col">
        <button
          onClick={() => setLegendExpanded(!legendExpanded)}
          className="flex items-center justify-between px-3 py-2 hover:bg-black/3 transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {legendTitle}
          </span>
          {legendExpanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        {legendExpanded && (
          <div className="px-3 pb-3 max-h-[280px] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-1.5">
              {legend.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span
                    className="w-5 h-3 rounded-sm shrink-0 border"
                    style={{
                      backgroundColor: entry.color,
                      borderColor: entry.strokeColor,
                    }}
                  />
                  <span className="text-[11px] text-foreground truncate flex-1 leading-tight">
                    {entry.label}
                  </span>
                  {entry.count !== undefined && (
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {entry.count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
