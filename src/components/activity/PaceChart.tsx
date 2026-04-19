import React from "react";
import ActivityMetricChart from "./ActivityMetricChart";
import { ChartPoint } from "../../utils/activityCharts";

const formatPace = (paceMinPerKm: number) => {
  const sec = Math.round(paceMinPerKm * 60);
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return `${min}:${String(rest).padStart(2, "0")} min/km`;
};

export default function PaceChart({
  points,
  onPointFocus,
}: {
  points: ChartPoint[];
  onPointFocus?: (point: ChartPoint | null) => void;
}) {
  return (
    <ActivityMetricChart
      title="Pace"
      emptyLabel="Sem dados suficientes para calcular pace."
      color="#f97316"
      points={points}
      onPointFocus={onPointFocus}
      valueFormatter={(value) => formatPace(value)}
    />
  );
}
