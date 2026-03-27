/*
 * Cartographic Studio Design — KPI Summary Cards
 * Frosted glass cards floating over the map.
 * Terracotta accent icons, warm stone backgrounds.
 * 4 cards: Parcel Count, Land Size, Land Value, Cost per Acre.
 */

import { useEffect, useRef, useState } from "react";
import { Grid3X3, Maximize2, DollarSign, TrendingUp } from "lucide-react";
import { formatCurrencyFull, formatAcres, formatNumber, formatCurrencyPerAcre } from "@/lib/format";

interface KpiCardsProps {
  parcelCount: number;
  totalAcres: number;
  totalValue: number;
  costPerAcre: number;
}

function AnimatedValue({
  value,
  formatter,
}: {
  value: number;
  formatter: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = performance.now();
    const duration = 600;

    function animate(now: number) {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span>{formatter(Math.round(display))}</span>;
}

export function KpiCards({ parcelCount, totalAcres, totalValue, costPerAcre }: KpiCardsProps) {
  const cards = [
    {
      label: "Parcel Count",
      value: parcelCount,
      formatter: formatNumber,
      icon: Grid3X3,
      color: "text-terracotta",
      bgColor: "bg-terracotta/8",
    },
    {
      label: "Land Size",
      value: totalAcres,
      formatter: formatAcres,
      icon: Maximize2,
      color: "text-sage",
      bgColor: "bg-sage/8",
    },
    {
      label: "Land Value",
      value: totalValue,
      formatter: formatCurrencyFull,
      icon: DollarSign,
      color: "text-amber-value",
      bgColor: "bg-amber-value/8",
    },
    {
      label: "Avg Cost / Acre",
      value: costPerAcre,
      formatter: formatCurrencyPerAcre,
      icon: TrendingUp,
      color: "text-blue-600",
      bgColor: "bg-blue-600/8",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass-panel rounded-xl px-5 py-4 w-[220px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-md ${card.bgColor}`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {card.label}
            </span>
          </div>
          <div className="text-2xl font-bold text-foreground font-mono leading-none">
            <AnimatedValue value={card.value} formatter={card.formatter} />
          </div>
        </div>
      ))}
    </div>
  );
}
