import React from "react";
import {
  Zap,
  Shield,
  Cpu,
  TrendingUp,
  Database,
  Clock,
  CheckCircle,
  Star,
  Sparkles,
  Flame,
  Rocket,
  Server,
  Code,
  DollarSign,
  Activity,
  Layers,
  Lock,
  BarChart,
  Gauge,
  LucideProps,
} from "lucide-react";

const ICON_MAP: Record<string, React.FC<LucideProps>> = {
  zap: Zap,
  bolt: Zap,
  shield: Shield,
  security: Shield,
  cpu: Cpu,
  chip: Cpu,
  processor: Cpu,
  trend: TrendingUp,
  "trending-up": TrendingUp,
  growth: TrendingUp,
  database: Database,
  storage: Database,
  clock: Clock,
  speed: Clock,
  time: Clock,
  latency: Gauge,
  check: CheckCircle,
  success: CheckCircle,
  star: Star,
  sparkles: Sparkles,
  ai: Sparkles,
  flame: Flame,
  hot: Flame,
  rocket: Rocket,
  launch: Rocket,
  server: Server,
  infra: Server,
  code: Code,
  dev: Code,
  dollar: DollarSign,
  cost: DollarSign,
  money: DollarSign,
  price: DollarSign,
  activity: Activity,
  layers: Layers,
  lock: Lock,
  chart: BarChart,
  gauge: Gauge,
};

export const IconResolver: React.FC<{
  name?: string;
  size?: number;
  color?: string;
}> = ({ name, size = 48, color = "#FFFFFF" }) => {
  const normalized = (name ?? "sparkles").toLowerCase().trim();
  const IconComponent = ICON_MAP[normalized] ?? Sparkles;

  return <IconComponent size={size} color={color} strokeWidth={2.2} />;
};
