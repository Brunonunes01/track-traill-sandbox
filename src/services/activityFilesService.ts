import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ActivityPoint } from "../models/activity";
import { buildGpxContent, parseGpxContent } from "../utils/gpx";

export const importGpxFile = async () => {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/gpx+xml", "text/xml", "application/xml", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (picked.canceled) {
    return null;
  }

  const file = picked.assets?.[0];
  if (!file?.uri) {
    throw new Error("Não foi possível acessar o arquivo selecionado.");
  }

  const content = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return {
    fileName: file.name || "atividade.gpx",
    parsed: parseGpxContent(content),
  };
};

export const exportActivityToGpxFile = async ({
  fileName,
  title,
  description,
  points,
}: {
  fileName?: string;
  title: string;
  description?: string;
  points: ActivityPoint[];
}) => {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("Sem pontos suficientes para exportar GPX.");
  }

  const gpxContent = buildGpxContent({ title, description, points });
  const safeName = (fileName || title || "atividade")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .toLowerCase();
  const uri = `${FileSystem.cacheDirectory}${safeName || "atividade"}.gpx`;

  await FileSystem.writeAsStringAsync(uri, gpxContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    return { uri, shared: false };
  }

  await Sharing.shareAsync(uri, {
    mimeType: "application/gpx+xml",
    dialogTitle: "Exportar atividade em GPX",
    UTI: "public.xml",
  });

  return { uri, shared: true };
};

export const parseFitPlaceholder = async () => {
  throw new Error(
    "Importação FIT ainda não suportada em Expo Managed. Arquitetura preparada para plugin nativo futuro."
  );
};
