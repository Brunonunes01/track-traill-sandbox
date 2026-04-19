import { ActivityPoint } from "../models/activity";
import { calculateDistance3DMeters } from "./activityMetrics";

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const parseTagValue = (block: string, tag: string) => {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  return match?.[1] ? decodeXmlEntities(match[1].trim()) : "";
};

const parseTrackPoints = (xml: string): ActivityPoint[] => {
  const trackPointRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
  const points: ActivityPoint[] = [];
  let match: RegExpExecArray | null;

  while ((match = trackPointRegex.exec(xml))) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const latMatch = attrs.match(/lat="([^"]+)"/i);
    const lonMatch = attrs.match(/lon="([^"]+)"/i);
    const latitude = latMatch ? Number(latMatch[1]) : NaN;
    const longitude = lonMatch ? Number(lonMatch[1]) : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const eleText = parseTagValue(body, "ele");
    const timeText = parseTagValue(body, "time");
    const altitude = Number.isFinite(Number(eleText)) ? Number(eleText) : null;
    const timestamp = Date.parse(timeText || "") || Date.now();

    points.push({ latitude, longitude, altitude, timestamp });
  }

  return points;
};

export const parseGpxContent = (xml: string) => {
  if (!xml || !xml.includes("<gpx")) {
    throw new Error("Arquivo GPX inválido.");
  }

  const points = parseTrackPoints(xml);
  if (points.length < 2) {
    throw new Error("GPX sem trilha válida (mínimo de 2 pontos).");
  }

  const title = parseTagValue(xml, "name") || `Importado em ${new Date().toLocaleDateString("pt-BR")}`;
  const description = parseTagValue(xml, "desc") || "Atividade importada de arquivo GPX.";

  const distanceMeters = points.slice(1).reduce((acc, point, index) => {
    const previous = points[index];
    return (
      acc +
      calculateDistance3DMeters(
        previous.latitude,
        previous.longitude,
        previous.altitude,
        point.latitude,
        point.longitude,
        point.altitude
      )
    );
  }, 0);

  const durationSec = Math.max(
    0,
    Math.floor((points[points.length - 1].timestamp - points[0].timestamp) / 1000)
  );

  return {
    title,
    description,
    points,
    distanceKm: distanceMeters / 1000,
    durationSec,
  };
};

export const buildGpxContent = ({
  title,
  description,
  points,
}: {
  title: string;
  description?: string;
  points: ActivityPoint[];
}) => {
  const safeTitle = title?.trim() || "Track-Traill Activity";
  const safeDescription = description?.trim() || "Exportado pelo app Track-Traill";

  const trkpts = points
    .map((point) => {
      const eleTag = Number.isFinite(point.altitude as number) ? `<ele>${Number(point.altitude).toFixed(1)}</ele>` : "";
      const timeTag = `<time>${new Date(point.timestamp || Date.now()).toISOString()}</time>`;
      return `<trkpt lat="${point.latitude}" lon="${point.longitude}">${eleTag}${timeTag}</trkpt>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Track-Traill" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeTitle}</name>
    <desc>${safeDescription}</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${safeTitle}</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;
};
