export type POIType =
  | "cachoeira"
  | "academia_ar_livre"
  | "mirante"
  | "ponto_agua";

export type POICoordinate = {
  latitude: number;
  longitude: number;
};

export type PointOfInterest = {
  id: string;
  titulo: string;
  descricao: string;
  tipo: POIType;
  coordenadas: POICoordinate;
  criadoPor: string;
  dataCriacao: string;
};

export const POI_TYPE_META: Record<
  POIType,
  {
    label: string;
    icon: string;
    color: string;
  }
> = {
  cachoeira: { label: "Cachoeira", icon: "water-outline", color: "#38bdf8" },
  academia_ar_livre: { label: "Academia ao ar livre", icon: "barbell-outline", color: "#22c55e" },
  mirante: { label: "Mirante", icon: "camera-outline", color: "#a78bfa" },
  ponto_agua: { label: "Ponto de água", icon: "water", color: "#0ea5e9" },
};

export const POI_TYPES: POIType[] = ["cachoeira", "academia_ar_livre", "mirante", "ponto_agua"];
