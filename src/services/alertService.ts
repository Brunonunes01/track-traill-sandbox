import {
  equalTo,
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  runTransaction,
  update,
} from "firebase/database";
import { User } from "firebase/auth";
import { database, normalizeFirebaseErrorMessage } from "../../services/connectionFirebase";
import {
  AlertCategory,
  AlertLifecycleStatus,
  AlertReport,
  AlertReportReason,
  AlertStatus,
  AlertType,
  TrailAlert,
} from "../models/alerts";
import { calculateDistanceKm } from "./routeService";
import { loadOfflineCache, saveOfflineCache } from "../storage/offlineCache";

type CreateAlertInput = {
  type: AlertType;
  category?: AlertCategory;
  description: string;
  latitude: number;
  longitude: number;
  routeId?: string | null;
  routeName?: string | null;
  status?: AlertStatus;
  photoUrl?: string | null;
};

type SubscribeAlertOptions = {
  includeExpired?: boolean;
  includeRemoved?: boolean;
  includeResolved?: boolean;
};

const ALERT_TTL_MS = 6 * 60 * 60 * 1000;
const ALERT_PERSISTENT_PLACEHOLDER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTO_REVIEW_REPORT_THRESHOLD = 5;
const NOT_FOUND_AUTO_ARCHIVE_THRESHOLD = 5;
const FEEDBACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const RECENT_CONFIRM_WINDOW_MS = 72 * 60 * 60 * 1000;
const alertsRef = ref(database, "alerts");
const attemptedExpireSync = new Set<string>();
const OFFLINE_CACHE_ALERTS_KEY = "alerts";
const isPermissionDeniedMessage = (message?: string | null) => {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("permission_denied") || normalized.includes("permissão");
};
const ALERT_SEVERITY_WEIGHT: Record<AlertType, number> = {
  acidente: 1,
  assalto_risco: 1,
  animal_perigoso: 0.88,
  trilha_bloqueada: 0.8,
  enchente: 0.85,
  queda_arvore: 0.72,
  pista_escorregadia: 0.64,
  lama: 0.58,
  outro: 0.5,
};

const isKnownStatus = (value: unknown): value is AlertStatus =>
  value === "ativo" || value === "resolvido" || value === "expirado" || value === "removido";

const isKnownCategory = (value: unknown): value is AlertCategory =>
  value === "temporario" || value === "persistente";

const isKnownLifecycleStatus = (value: unknown): value is AlertLifecycleStatus =>
  value === "pending" ||
  value === "active" ||
  value === "rejected" ||
  value === "resolved" ||
  value === "archived";

const normalizeReportReason = (value: unknown): AlertReportReason => {
  if (
    value === "informacao_falsa" ||
    value === "duplicado" ||
    value === "ja_resolvido" ||
    value === "conteudo_inadequado"
  ) {
    return value;
  }
  return "informacao_falsa";
};

const inferCategoryFromType = (type: AlertType): AlertCategory => {
  if (
    type === "trilha_bloqueada" ||
    type === "queda_arvore" ||
    type === "lama" ||
    type === "pista_escorregadia"
  ) {
    return "persistente";
  }
  return "temporario";
};

const resolveCategory = (rawCategory: unknown, type: AlertType): AlertCategory => {
  if (isKnownCategory(rawCategory)) return rawCategory;
  return inferCategoryFromType(type);
};

const getExpiresAtMsFromRaw = (raw: any, createdAtMs: number, category: AlertCategory): number => {
  if (typeof raw?.expiresAtMs === "number" && Number.isFinite(raw.expiresAtMs)) {
    return raw.expiresAtMs;
  }

  if (typeof raw?.expiresAt === "string") {
    const parsed = new Date(raw.expiresAt).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (category === "persistente") {
    return createdAtMs + ALERT_PERSISTENT_PLACEHOLDER_TTL_MS;
  }

  return createdAtMs + ALERT_TTL_MS;
};

const resolveStatus = (
  category: AlertCategory,
  rawStatus: unknown,
  expiresAtMs: number,
  now: number
): { status: AlertStatus; shouldPersistExpiration: boolean } => {
  if (rawStatus === "removido") return { status: "removido", shouldPersistExpiration: false };
  if (rawStatus === "resolvido") return { status: "resolvido", shouldPersistExpiration: false };
  if (rawStatus === "expirado") return { status: "expirado", shouldPersistExpiration: false };

  const expiredByTime = category === "temporario" && now >= expiresAtMs;
  if (expiredByTime) {
    return {
      status: "expirado",
      shouldPersistExpiration: rawStatus !== "expirado",
    };
  }

  return { status: "ativo", shouldPersistExpiration: false };
};

const resolveLifecycleStatus = (
  rawLifecycleStatus: unknown,
  status: AlertStatus,
  moderationStatus: unknown
): AlertLifecycleStatus => {
  if (isKnownLifecycleStatus(rawLifecycleStatus)) {
    return rawLifecycleStatus;
  }

  if (status === "resolvido") return "resolved";
  if (status === "removido") return "rejected";
  if (status === "expirado") return "archived";
  if (moderationStatus === "review_pending") return "pending";
  return "active";
};

const normalizeReports = (rawReports: any): Record<string, AlertReport> => {
  if (!rawReports || typeof rawReports !== "object") {
    return {};
  }

  const entries = Object.entries(rawReports).map(([uid, item]) => {
    const safeItem = item as any;
    const createdAt =
      typeof safeItem?.createdAt === "string" ? safeItem.createdAt : new Date().toISOString();
    const createdAtMs =
      typeof safeItem?.createdAtMs === "number"
        ? safeItem.createdAtMs
        : new Date(createdAt).getTime() || Date.now();

    return [
      uid,
      {
        userId: String(safeItem?.userId || uid),
        reason: normalizeReportReason(safeItem?.reason),
        createdAt,
        createdAtMs,
        userDisplayName: safeItem?.userDisplayName || null,
        userEmail: safeItem?.userEmail || null,
      } as AlertReport,
    ] as const;
  });

  return Object.fromEntries(entries);
};

const normalizeAlert = (
  id: string,
  raw: any,
  now: number
): { alert: TrailAlert | null; shouldPersistExpiration: boolean } => {
  const latitude = Number(raw?.latitude);
  const longitude = Number(raw?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { alert: null, shouldPersistExpiration: false };
  }

  const createdAt =
    typeof raw?.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const createdAtMs =
    typeof raw?.createdAtMs === "number"
      ? raw.createdAtMs
      : new Date(createdAt).getTime() || Date.now();

  const type = (raw?.type || "outro") as AlertType;
  const category = resolveCategory(raw?.category, type);
  const expiresAtMs = getExpiresAtMsFromRaw(raw, createdAtMs, category);
  const expiresAt =
    typeof raw?.expiresAt === "string" && new Date(raw.expiresAt).getTime() > 0
      ? raw.expiresAt
      : new Date(expiresAtMs).toISOString();

  const { status, shouldPersistExpiration } = resolveStatus(category, raw?.status, expiresAtMs, now);
  const reports = normalizeReports(raw?.reports);

  const reportCount =
    typeof raw?.reportCount === "number" && raw.reportCount >= 0
      ? Math.floor(raw.reportCount)
      : Object.keys(reports).length;
  const lifecycleStatus = resolveLifecycleStatus(raw?.lifecycleStatus, status, raw?.moderationStatus);
  const ageHours = Math.max(0, (now - createdAtMs) / (60 * 60 * 1000));
  const recencyScore = Math.max(0.2, 1 - Math.min(ageHours, 24) / 28);
  const communitySignal = Math.max(
    0,
    Math.min(1.25, 0.55 + Number(raw?.confirmations || 0) * 0.08 - reportCount * 0.11)
  );
  const statusMultiplier =
    status === "ativo" ? 1 : status === "resolvido" ? 0.45 : status === "expirado" ? 0.35 : 0.2;
  const confidenceScore = Math.round(
    Math.max(8, Math.min(100, recencyScore * communitySignal * statusMultiplier * 100))
  );
  const baseSeverity = ALERT_SEVERITY_WEIGHT[type] || ALERT_SEVERITY_WEIGHT.outro;
  const riskScore = Math.round(Math.max(4, Math.min(100, baseSeverity * confidenceScore)));

  return {
    shouldPersistExpiration,
    alert: {
      id,
      type,
      category,
      description: String(raw?.description || "Sem descrição."),
      latitude,
      longitude,
      routeId: raw?.routeId || null,
      routeName: raw?.routeName || null,
      createdAt,
      createdAtMs,
      expiresAt,
      expiresAtMs,
      userId: String(raw?.userId || "unknown"),
      userDisplayName: raw?.userDisplayName || null,
      userEmail: raw?.userEmail || null,
      status,
      photoUrl: raw?.photoUrl || null,
      confirmations: Number(raw?.confirmations || 0),
      reportCount,
      confidenceScore,
      riskScore,
      reports,
      resolvedAt: typeof raw?.resolvedAt === "string" ? raw.resolvedAt : null,
      removedAt: typeof raw?.removedAt === "string" ? raw.removedAt : null,
      removedBy: typeof raw?.removedBy === "string" ? raw.removedBy : null,
      moderationStatus:
        raw?.moderationStatus === "review_pending" || raw?.moderationStatus === "reviewed"
          ? raw.moderationStatus
          : "none",
      reviewRequestedAt:
        typeof raw?.reviewRequestedAt === "string" ? raw.reviewRequestedAt : null,
      reviewRequestedBy:
        typeof raw?.reviewRequestedBy === "string" ? raw.reviewRequestedBy : null,
      lifecycleStatus,
      archivedAt: typeof raw?.archivedAt === "string" ? raw.archivedAt : null,
      expiredAt: typeof raw?.expiredAt === "string" ? raw.expiredAt : null,
      lastConfirmedAt: typeof raw?.lastConfirmedAt === "string" ? raw.lastConfirmedAt : null,
      notFoundCount:
        typeof raw?.notFoundCount === "number" && raw.notFoundCount > 0
          ? Math.floor(raw.notFoundCount)
          : 0,
      feedbackByUser:
        raw?.feedbackByUser && typeof raw.feedbackByUser === "object"
          ? raw.feedbackByUser
          : {},
    },
  };
};

const shouldIncludeAlert = (alert: TrailAlert, options?: SubscribeAlertOptions): boolean => {
  const includeResolved = options?.includeResolved ?? false;
  if (alert.status === "removido" && !options?.includeRemoved) {
    return false;
  }

  if (alert.status === "expirado" && !options?.includeExpired) {
    return false;
  }

  if (alert.status === "resolvido" && !includeResolved) {
    return false;
  }

  return true;
};

const normalizeDescription = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const hasRecentDuplicate = async (
  userId: string,
  input: CreateAlertInput
): Promise<boolean> => {
  const userAlertsQuery = query(
    alertsRef,
    orderByChild("userId"),
    equalTo(userId),
    limitToLast(12)
  );

  const snapshot = await get(userAlertsQuery);
  if (!snapshot.exists()) {
    return false;
  }

  const normalizedDescription = normalizeDescription(input.description);
  const now = Date.now();

  const duplicate = Object.values(snapshot.val()).find((raw: any) => {
    const rawCreatedAtMs =
      typeof raw?.createdAtMs === "number"
        ? raw.createdAtMs
        : new Date(raw?.createdAt || 0).getTime();

    const isRecent = now - rawCreatedAtMs <= 15 * 60 * 1000;
    if (!isRecent) return false;

    const sameType = raw?.type === input.type;
    const normalizedRawStatus = isKnownStatus(raw?.status) ? raw.status : "ativo";
    const requestedStatus = input.status || "ativo";
    const sameStatus = normalizedRawStatus === requestedStatus;
    const sameRoute = (raw?.routeId || null) === (input.routeId || null);
    const sameDescription =
      normalizeDescription(String(raw?.description || "")) === normalizedDescription;

    const lat = Number(raw?.latitude);
    const lon = Number(raw?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return false;
    }

    const distanceMeters =
      calculateDistanceKm(input.latitude, input.longitude, lat, lon) * 1000;

    return sameType && sameStatus && sameRoute && sameDescription && distanceMeters < 25;
  });

  return Boolean(duplicate);
};

const syncExpiredAlertsInBackground = (toExpireIds: string[]) => {
  toExpireIds.forEach((alertId) => {
    if (attemptedExpireSync.has(alertId)) return;
    attemptedExpireSync.add(alertId);

    update(ref(database, `alerts/${alertId}`), {
      status: "expirado",
      expiredAt: new Date().toISOString(),
      lifecycleStatus: "archived",
      archivedAt: new Date().toISOString(),
    }).catch(() => {
      attemptedExpireSync.delete(alertId);
    });
  });
};

export const subscribeAlerts = (
  onChange: (alerts: TrailAlert[]) => void,
  onError?: (message: string) => void,
  options?: SubscribeAlertOptions
) => {
  // Carrega cache local imediatamente
  loadOfflineCache<TrailAlert[]>(OFFLINE_CACHE_ALERTS_KEY).then((cache) => {
    if (cache?.data?.length) {
      const cachedAlerts = cache.data
        .filter((item) => shouldIncludeAlert(item, options))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onChange(cachedAlerts);
    }
  }).catch(() => {});

  return onValue(
    alertsRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        return;
      }

      const data = snapshot.val();
      const now = Date.now();
      const toExpireIds: string[] = [];

      const normalizedAlerts = Object.keys(data)
        .map((id) => {
          const normalized = normalizeAlert(id, data[id], now);
          if (normalized.shouldPersistExpiration) {
            toExpireIds.push(id);
          }
          return normalized.alert;
        })
        .filter((item): item is TrailAlert => Boolean(item));

      const alerts = normalizedAlerts
        .filter((item) => shouldIncludeAlert(item, options))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

      onChange(alerts);
      saveOfflineCache(OFFLINE_CACHE_ALERTS_KEY, normalizedAlerts);

      if (toExpireIds.length > 0) {
        syncExpiredAlertsInBackground(toExpireIds);
      }
    },
    async (error) => {
      const fallback = await loadOfflineCache<TrailAlert[]>(OFFLINE_CACHE_ALERTS_KEY);
      if (fallback?.data?.length) {
        const cachedAlerts = fallback.data
          .filter((item) => shouldIncludeAlert(item, options))
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        onChange(cachedAlerts);
        
        // Só reporta erro se for algo crítico (permissão)
        const errorMessage = normalizeFirebaseErrorMessage(error);
        if (isPermissionDeniedMessage(errorMessage)) {
          onError?.(errorMessage);
        } else {
          // Mensagem padronizada para silenciar na UI
          onError?.("Sem conexão. Exibindo alertas em cache offline.");
          console.log("[alerts] Falling back to offline cache due to connection issue.");
        }
        return;
      }
      onError?.(normalizeFirebaseErrorMessage(error, "Falha ao carregar alertas."));
    }
  );
};

export const subscribeRouteAlerts = (
  routeId: string,
  onChange: (alerts: TrailAlert[]) => void,
  onError?: (message: string) => void
) =>
  subscribeAlerts(
    (alerts) => {
      onChange(alerts.filter((alert) => alert.routeId === routeId));
    },
    onError,
    { includeResolved: false }
  );

export const subscribeAllAlertsForAdmin = (
  onChange: (alerts: TrailAlert[]) => void,
  onError?: (message: string) => void
) =>
  subscribeAlerts(onChange, onError, {
    includeExpired: true,
    includeRemoved: true,
    includeResolved: true,
  });

export const createAlert = async (input: CreateAlertInput, user: User | null) => {
  if (!user) {
    throw new Error("Você precisa estar logado para registrar um alerta.");
  }

  if (!input.description?.trim()) {
    throw new Error("Descrição obrigatória.");
  }

  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error("Latitude e longitude são obrigatórias.");
  }

  const safeStatus: AlertStatus =
    input.status === "resolvido" || input.status === "expirado" || input.status === "removido"
      ? input.status
      : "ativo";
  const category = resolveCategory(input.category, input.type);

  try {
    const duplicate = await hasRecentDuplicate(user.uid, input);
    if (duplicate) {
      throw new Error(
        "Já existe um alerta muito parecido criado recentemente. Aguarde alguns minutos."
      );
    }

    const createdAt = new Date().toISOString();
    const createdAtMs = Date.now();
    const expiresAtMs =
      category === "persistente"
        ? createdAtMs + ALERT_PERSISTENT_PLACEHOLDER_TTL_MS
        : createdAtMs + ALERT_TTL_MS;
    const lifecycleStatus: AlertLifecycleStatus =
      safeStatus === "resolvido"
        ? "resolved"
        : safeStatus === "removido"
          ? "rejected"
          : safeStatus === "expirado"
            ? "archived"
            : "active";

    const alertPayload = {
      type: input.type,
      category,
      description: input.description.trim(),
      latitude: input.latitude,
      longitude: input.longitude,
      routeId: input.routeId || null,
      routeName: input.routeName || null,
      createdAt,
      createdAtMs,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      userId: user.uid,
      userDisplayName: user.displayName || null,
      userEmail: user.email || null,
      status: safeStatus,
      photoUrl: input.photoUrl || null,
      confirmations: 0,
      reportCount: 0,
      reports: {},
      resolvedAt: safeStatus === "resolvido" ? createdAt : null,
      removedAt: null,
      removedBy: null,
      moderationStatus: "none",
      reviewRequestedAt: null,
      reviewRequestedBy: null,
      lifecycleStatus,
      archivedAt: lifecycleStatus === "archived" || lifecycleStatus === "rejected" ? createdAt : null,
      expiredAt: safeStatus === "expirado" ? createdAt : null,
      lastConfirmedAt: null,
      notFoundCount: 0,
      feedbackByUser: {},
    };

    const newAlertRef = push(alertsRef);
    await set(newAlertRef, alertPayload);

    return {
      id: newAlertRef.key,
      ...alertPayload,
    };
  } catch (error: any) {
    const message = normalizeFirebaseErrorMessage(error, "Não foi possível registrar o alerta.");
    console.warn("[alerts] createAlert failed:", message);
    throw new Error(message);
  }
};

type AlertFeedbackKind = "confirm" | "not_found";

const getFeedbackCount = (rawValue: unknown): number => {
  const parsed = Number(rawValue || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const applyAlertFeedback = async (
  alertId: string,
  kind: AlertFeedbackKind,
  user: User | null
) => {
  if (!user) {
    throw new Error("Você precisa estar logado para enviar feedback.");
  }

  const alertRef = ref(database, `alerts/${alertId}`);
  const snapshot = await get(alertRef);
  if (!snapshot.exists()) {
    throw new Error("Alerta não encontrado.");
  }

  const rawAlert = snapshot.val() || {};
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const previousFeedback = rawAlert?.feedbackByUser?.[user.uid];
  const previousAtMs =
    typeof previousFeedback?.createdAtMs === "number"
      ? previousFeedback.createdAtMs
      : new Date(previousFeedback?.createdAt || 0).getTime();

  if (Number.isFinite(previousAtMs) && now - previousAtMs < FEEDBACK_COOLDOWN_MS) {
    const remainingMs = FEEDBACK_COOLDOWN_MS - (now - previousAtMs);
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    throw new Error(`Aguarde ${remainingHours}h para enviar novo feedback neste alerta.`);
  }

  const type = (rawAlert?.type || "outro") as AlertType;
  const category = resolveCategory(rawAlert?.category, type);
  const nextConfirmations =
    kind === "confirm" ? getFeedbackCount(rawAlert?.confirmations) + 1 : undefined;
  const nextNotFoundCount =
    kind === "not_found" ? getFeedbackCount(rawAlert?.notFoundCount) + 1 : undefined;
  const lastConfirmedAtMs =
    typeof rawAlert?.lastConfirmedAt === "string"
      ? new Date(rawAlert.lastConfirmedAt).getTime()
      : Number.NaN;
  const hasRecentConfirm =
    Number.isFinite(lastConfirmedAtMs) && now - lastConfirmedAtMs <= RECENT_CONFIRM_WINDOW_MS;
  const shouldAutoResolvePersistent =
    category === "persistente" &&
    kind === "not_found" &&
    (nextNotFoundCount || 0) >= NOT_FOUND_AUTO_ARCHIVE_THRESHOLD &&
    !hasRecentConfirm;

  const payload: Record<string, unknown> = {
    [`feedbackByUser/${user.uid}`]: {
      kind,
      createdAt: nowIso,
      createdAtMs: now,
      userId: user.uid,
      userDisplayName: user.displayName || null,
      userEmail: user.email || null,
    },
  };

  if (kind === "confirm") {
    payload.confirmations = nextConfirmations;
    payload.lastConfirmedAt = nowIso;
    payload.lifecycleStatus = "active";
    if (rawAlert?.status !== "resolvido" && rawAlert?.status !== "removido") {
      payload.status = "ativo";
      payload.archivedAt = null;
    }
  }

  if (kind === "not_found") {
    payload.notFoundCount = nextNotFoundCount;
  }

  if (shouldAutoResolvePersistent) {
    payload.status = "resolvido";
    payload.lifecycleStatus = "resolved";
    payload.resolvedAt = nowIso;
    payload.archivedAt = nowIso;
  }

  await update(alertRef, payload);
};

export const confirmAlert = async (alertId: string, user?: User | null) => {
  try {
    if (user) {
      await applyAlertFeedback(alertId, "confirm", user);
      return;
    }

    const confirmationsRef = ref(database, `alerts/${alertId}/confirmations`);
    await runTransaction(confirmationsRef, (current) => {
      const value = typeof current === "number" ? current : 0;
      return value + 1;
    });
  } catch (error) {
    throw new Error(normalizeFirebaseErrorMessage(error, "Não foi possível confirmar o alerta."));
  }
};

export const markAlertAsNotFound = async (alertId: string, user: User | null) => {
  try {
    await applyAlertFeedback(alertId, "not_found", user);
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível registrar esse feedback.")
    );
  }
};

export const reportAlert = async (
  alertId: string,
  reason: AlertReportReason,
  user: User | null
) => {
  if (!user) {
    throw new Error("Você precisa estar logado para denunciar um alerta.");
  }

  const alertRef = ref(database, `alerts/${alertId}`);
  const reportRef = ref(database, `alerts/${alertId}/reports/${user.uid}`);

  try {
    const [alertSnapshot, reportSnapshot] = await Promise.all([get(alertRef), get(reportRef)]);

    if (!alertSnapshot.exists()) {
      throw new Error("Alerta não encontrado.");
    }

    const rawAlert = alertSnapshot.val() || {};
    if (String(rawAlert?.userId || "") === user.uid) {
      throw new Error("Você não pode denunciar um alerta criado por você.");
    }

    const now = Date.now();
    const type = (rawAlert?.type || "outro") as AlertType;
    const category = resolveCategory(rawAlert?.category, type);
    const createdAtMs =
      typeof rawAlert?.createdAtMs === "number"
        ? rawAlert.createdAtMs
        : new Date(rawAlert?.createdAt || 0).getTime() || now;
    const expiresAtMs = getExpiresAtMsFromRaw(rawAlert, createdAtMs, category);
    const derived = resolveStatus(category, rawAlert?.status, expiresAtMs, now);
    if (derived.status === "removido") {
      throw new Error("Este alerta já foi removido pela moderação.");
    }

    if (reportSnapshot.exists()) {
      throw new Error("Você já denunciou este alerta.");
    }

    const createdAt = new Date().toISOString();
    await set(reportRef, {
      userId: user.uid,
      userDisplayName: user.displayName || null,
      userEmail: user.email || null,
      reason,
      createdAt,
      createdAtMs: Date.now(),
    });

    const reportCountRef = ref(database, `alerts/${alertId}/reportCount`);
    const reportResult = await runTransaction(reportCountRef, (current) => {
      const currentCount = typeof current === "number" ? current : 0;
      return currentCount + 1;
    });

    const nextReportCount = Number(reportResult.snapshot.val() || 0);

    if (nextReportCount >= AUTO_REVIEW_REPORT_THRESHOLD && derived.status === "ativo") {
      await update(alertRef, {
        moderationStatus: "review_pending",
        reviewRequestedAt: new Date().toISOString(),
        reviewRequestedBy: "auto_reports_threshold",
      });
    }
  } catch (error: any) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível registrar a denúncia agora.")
    );
  }
};

export const markAlertAsResolved = async (alertId: string) => {
  const alertRef = ref(database, `alerts/${alertId}`);
  try {
    await update(alertRef, {
      status: "resolvido",
      resolvedAt: new Date().toISOString(),
      lifecycleStatus: "resolved",
      archivedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível atualizar o status do alerta.")
    );
  }
};

export const removeAlertByAdmin = async (alertId: string, adminUserId?: string | null) => {
  const alertRef = ref(database, `alerts/${alertId}`);

  try {
    await update(alertRef, {
      status: "removido",
      lifecycleStatus: "rejected",
      removedAt: new Date().toISOString(),
      removedBy: adminUserId || null,
      archivedAt: new Date().toISOString(),
      moderationStatus: "reviewed",
    });
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível remover o alerta.")
    );
  }
};

export const updateAlertStatus = async (alertId: string, status: AlertStatus) => {
  const alertRef = ref(database, `alerts/${alertId}`);

  const payload: Record<string, unknown> = { status };
  if (status === "resolvido") {
    payload.resolvedAt = new Date().toISOString();
    payload.lifecycleStatus = "resolved";
    payload.archivedAt = new Date().toISOString();
  }

  if (status === "removido") {
    payload.removedAt = new Date().toISOString();
    payload.lifecycleStatus = "rejected";
    payload.archivedAt = new Date().toISOString();
  }

  if (status === "expirado") {
    payload.expiredAt = new Date().toISOString();
    payload.lifecycleStatus = "archived";
    payload.archivedAt = new Date().toISOString();
  }

  if (status === "ativo") {
    payload.lifecycleStatus = "active";
  }

  try {
    await update(alertRef, payload);
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível atualizar o status do alerta.")
    );
  }
};
