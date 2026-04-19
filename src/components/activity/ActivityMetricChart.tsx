import React, { useCallback, useMemo, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Line, Path } from "react-native-svg";
import { ChartPoint } from "../../utils/activityCharts";

type ActivityMetricChartProps = {
  title: string;
  emptyLabel: string;
  color: string;
  points: ChartPoint[];
  valueFormatter: (value: number) => string;
  onPointFocus?: (point: ChartPoint | null) => void;
};

const CHART_HEIGHT = 180;
const CHART_PADDING_TOP = 20;
const CHART_PADDING_BOTTOM = 10;
const CHART_PADDING_HORIZONTAL = 0;

export default function ActivityMetricChart({
  title,
  emptyLabel,
  color,
  points,
  valueFormatter,
  onPointFocus,
}: ActivityMetricChartProps) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const hasData = points.length >= 2 && width > 0;

  const yBounds = useMemo(() => {
    if (!hasData) return { min: 0, max: 1 };
    const ys = points.map((point) => point.y);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    if (min === max) return { min: min - 1, max: max + 1 };
    // Adiciona um pouco de padding vertical nos limites
    const range = max - min;
    return { min: Math.max(0, min - range * 0.1), max: max + range * 0.1 };
  }, [hasData, points]);

  const xBounds = useMemo(() => {
    if (!hasData) return { min: 0, max: 1 };
    const xs = points.map((point) => point.x);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    if (min === max) return { min: 0, max: min + 1 };
    return { min, max };
  }, [hasData, points]);

  const plotted = useMemo(() => {
    const usableWidth = width - CHART_PADDING_HORIZONTAL * 2;
    const usableHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    return points.map((point) => {
      const cx = CHART_PADDING_HORIZONTAL + ((point.x - xBounds.min) / (xBounds.max - xBounds.min)) * usableWidth;
      const cy = CHART_HEIGHT - CHART_PADDING_BOTTOM - ((point.y - yBounds.min) / (yBounds.max - yBounds.min)) * usableHeight;
      return { ...point, cx, cy };
    });
  }, [points, width, xBounds.max, xBounds.min, yBounds.max, yBounds.min]);

  const { pathData, areaData } = useMemo(() => {
    if (!hasData) return { pathData: "", areaData: "" };
    
    const line = plotted.map((p, i) => `${i === 0 ? "M" : "L"} ${p.cx} ${p.cy}`).join(" ");
    
    // Para a área, fechamos o polígono na base do gráfico
    const lastPoint = plotted[plotted.length - 1];
    const firstPoint = plotted[0];
    const area = `${line} L ${lastPoint.cx} ${CHART_HEIGHT} L ${firstPoint.cx} ${CHART_HEIGHT} Z`;
    
    return { pathData: line, areaData: area };
  }, [hasData, plotted]);

  const activePoint = activeIndex !== null ? plotted[activeIndex] : null;

  const handleTouchX = useCallback((x: number) => {
    if (!hasData) return;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    plotted.forEach((point, index) => {
      const distance = Math.abs(point.cx - x);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
    onPointFocus?.(plotted[nearestIndex]);
  }, [hasData, onPointFocus, plotted]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => hasData,
        onPanResponderGrant: (event) => handleTouchX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => handleTouchX(event.nativeEvent.locationX),
        onPanResponderRelease: () => {
          setActiveIndex(null);
          onPointFocus?.(null);
        },
      }),
    [handleTouchX, hasData, onPointFocus]
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {activePoint && (
          <Text style={styles.activeValue}>{valueFormatter(activePoint.y)}</Text>
        )}
      </View>
      
      {!hasData ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : (
        <>
          <View style={styles.chartWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...panResponder.panHandlers}>
            <Svg width="100%" height={CHART_HEIGHT}>
              <Defs>
                <SvgLinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity="0.4" />
                  <Stop offset="1" stopColor={color} stopOpacity="0.02" />
                </SvgLinearGradient>
              </Defs>
              
              {/* Área preenchida com gradiente */}
              <Path d={areaData} fill="url(#grad)" />
              
              {/* Linha do gráfico */}
              <Path d={pathData} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
              
              {activePoint ? (
                <>
                  <Line 
                    x1={activePoint.cx} 
                    x2={activePoint.cx} 
                    y1={0} 
                    y2={CHART_HEIGHT} 
                    stroke="rgba(255,255,255,0.3)" 
                    strokeWidth={1} 
                    strokeDasharray="4, 2"
                  />
                  <Circle cx={activePoint.cx} cy={activePoint.cy} r={6} fill="#fff" />
                  <Circle cx={activePoint.cx} cy={activePoint.cy} r={4} fill={color} />
                </>
              ) : null}
            </Svg>
          </View>

          <View style={styles.legendRow}>
            <Text style={styles.legendText}>0 km</Text>
            {activePoint && (
               <Text style={styles.focusedLabel}>{activePoint.label}</Text>
            )}
            <Text style={styles.legendText}>{xBounds.max.toFixed(1)} km</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { color: "#94a3b8", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  activeValue: { color: "#fff", fontSize: 16, fontWeight: "800" },
  emptyText: { color: "#64748b", fontSize: 13, fontStyle: "italic", textAlign: "center", marginVertical: 20 },
  chartWrap: {
    overflow: "hidden",
  },
  legendRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  legendText: { color: "#4b5563", fontSize: 11, fontWeight: "600" },
  focusedLabel: { color: "#f97316", fontSize: 11, fontWeight: "700" },
});
