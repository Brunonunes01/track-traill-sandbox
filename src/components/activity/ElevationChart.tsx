import React from "react";
import ActivityMetricChart from "./ActivityMetricChart";
import { ChartPoint } from "../../utils/activityCharts";

export default function ElevationChart({
  points,
  onPointFocus,
}: {
  points: ChartPoint[];
  onPointFocus?: (point: ChartPoint | null) => void;
}) {
  return (
    <ActivityMetricChart
      title="Altimetria"
      emptyLabel="Sem dados de altitude para esta atividade."
      color="#22d3ee"
      points={points}
      onPointFocus={onPointFocus}
      valueFormatter={(value) => `${value.toFixed(0)} m`}
    />
  );
}
