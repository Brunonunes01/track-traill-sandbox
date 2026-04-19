import {
  get,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
} from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { auth, database, normalizeFirebaseErrorMessage, storage } from "./connectionFirebase";
import { getUserPrivacyZone, sanitizeRouteForPublicView } from "../src/services/privacyZoneService";

const COMMUNITY_POSTS_PATH = "communityPosts";

const assertAuthenticatedActor = (expectedUserId, operation) => {
  const currentUid = auth.currentUser?.uid || "";
  if (!currentUid || !expectedUserId || currentUid !== String(expectedUserId)) {
    throw new Error(`Operação não autorizada para ${operation}.`);
  }
};

const mapPostsSnapshot = (snapshot) => {
  if (!snapshot.exists()) return [];

  const data = snapshot.val();

  return Object.keys(data)
    .map((id) => {
      const post = data[id] || {};

      const commentsObj = post.comments || {};
      const comments = Object.keys(commentsObj)
        .map((commentId) => ({ id: commentId, ...commentsObj[commentId] }))
        .sort(
          (a, b) =>
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        );

      const photosObj = post.photos || {};
      const photos = Object.keys(photosObj)
        .map((photoId) => ({ id: photoId, ...photosObj[photoId] }))
        .sort(
          (a, b) =>
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        );

      const kudos = post.kudos || {};
      const kudosCount =
        typeof post.kudosCount === "number" ? post.kudosCount : Object.keys(kudos).length;

      return {
        id,
        ...post,
        photos,
        comments,
        commentsCount:
          typeof post.commentsCount === "number" ? post.commentsCount : comments.length,
        kudos,
        kudosCount,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
};

export const subscribeCommunityPosts = (onChange, onError) => {
  return onValue(
    ref(database, COMMUNITY_POSTS_PATH),
    (snapshot) => {
      onChange(mapPostsSnapshot(snapshot));
    },
    (error) => {
      const message = normalizeFirebaseErrorMessage(error, "Falha ao carregar a comunidade.");
      console.warn("[community] subscribeCommunityPosts failed:", message);
      if (typeof onError === "function") {
        onError(new Error(message));
      }
    }
  );
};

const uploadPhotoToStorage = async (photoUri, ownerId, postId, index) => {
  const response = await fetch(photoUri);
  const blob = await response.blob();
  const extension =
    String(photoUri || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "jpg";

  const safePostId = postId || `draft_${Date.now()}`;
  const path = `community/photos/${ownerId}/${safePostId}/${Date.now()}_${index}.${extension}`;
  const fileRef = storageRef(storage, path);

  await uploadBytes(fileRef, blob);
  const url = await getDownloadURL(fileRef);

  return {
    id: `${Date.now()}_${index}`,
    url,
    storagePath: path,
    createdAt: new Date().toISOString(),
  };
};

const uploadPostPhotos = async ({ photoUris, ownerId, postId }) => {
  if (!Array.isArray(photoUris) || photoUris.length === 0) return {};

  const uploaded = [];
  for (let index = 0; index < photoUris.length; index += 1) {
    const photoUri = photoUris[index];
    if (!photoUri) continue;

    const item = await uploadPhotoToStorage(photoUri, ownerId, postId, index);
    uploaded.push(item);
  }

  return uploaded.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
};

export const createCommunityPost = async ({
  authorId,
  authorName,
  text,
  imageUri,
  photoUris,
  route,
}) => {
  assertAuthenticatedActor(authorId, "publicar na comunidade");
  if (!authorId) throw new Error("Usuário inválido para publicação.");
  if (!text?.trim()) throw new Error("Digite um texto para o post.");

  try {
    const postRef = push(ref(database, COMMUNITY_POSTS_PATH));
    const postId = postRef.key;

    const normalizedPhotoUris = [imageUri, ...(photoUris || [])].filter(Boolean);
    const photos = await uploadPostPhotos({ photoUris: normalizedPhotoUris, ownerId: authorId, postId });

    await set(postRef, {
      postType: "text_post",
      visibility: "friends",
      authorId,
      authorName: authorName || "Usuário",
      text: text.trim(),
      route: route || null,
      photos,
      comments: {},
      commentsCount: 0,
      kudos: {},
      kudosCount: 0,
      createdAt: new Date().toISOString(),
    });

    return postId;
  } catch (error) {
    throw new Error(normalizeFirebaseErrorMessage(error, "Não foi possível criar o post."));
  }
};

export const addCommunityComment = async ({
  postId,
  authorId,
  authorName,
  text,
}) => {
  assertAuthenticatedActor(authorId, "comentar");
  if (!postId) throw new Error("Post inválido.");
  if (!authorId) throw new Error("Usuário inválido.");
  if (!text?.trim()) throw new Error("Digite um comentário.");

  try {
    const commentRef = push(ref(database, `${COMMUNITY_POSTS_PATH}/${postId}/comments`));

    await set(commentRef, {
      authorId,
      authorName: authorName || "Usuário",
      text: text.trim(),
      createdAt: new Date().toISOString(),
    });

    await runTransaction(ref(database, `${COMMUNITY_POSTS_PATH}/${postId}/commentsCount`), (current) => {
      const currentValue = typeof current === "number" ? current : 0;
      return currentValue + 1;
    });

    return commentRef.key;
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível adicionar o comentário.")
    );
  }
};

export const toggleCommunityKudo = async ({
  postId,
  userId,
  userName,
  userPhotoUrl,
}) => {
  assertAuthenticatedActor(userId, "curtir");
  if (!postId) throw new Error("Post inválido.");
  if (!userId) throw new Error("Usuário inválido para kudo.");

  const kudoRef = ref(database, `${COMMUNITY_POSTS_PATH}/${postId}/kudos/${userId}`);
  const countRef = ref(database, `${COMMUNITY_POSTS_PATH}/${postId}/kudosCount`);

  try {
    const existing = await get(kudoRef);
    const hasKudo = existing.exists();

    if (hasKudo) {
      await set(kudoRef, null);
      await runTransaction(countRef, (current) => {
        const currentValue = typeof current === "number" ? current : 0;
        return Math.max(0, currentValue - 1);
      });
      return { liked: false };
    }

    await set(kudoRef, {
      userId,
      userName: userName || "Usuário",
      userPhotoUrl: userPhotoUrl || null,
      createdAt: new Date().toISOString(),
    });

    await runTransaction(countRef, (current) => {
      const currentValue = typeof current === "number" ? current : 0;
      return currentValue + 1;
    });

    return { liked: true };
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível atualizar o kudo agora.")
    );
  }
};

export const getLatestUserActivity = async (uid) => {
  if (!uid) return null;

  let snapshot;
  try {
    snapshot = await get(ref(database, `users/${uid}/atividades`));
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível carregar a última atividade.")
    );
  }

  if (!snapshot.exists()) return null;

  const activities = Object.keys(snapshot.val()).map((id) => ({
    id,
    ...snapshot.val()[id],
  }));

  if (!activities.length) return null;

  const latest = activities.sort(
    (a, b) =>
      new Date(b.criadoEm || b.data || 0).getTime() -
      new Date(a.criadoEm || a.data || 0).getTime()
  )[0];

  return {
    id: latest.id,
    tipo: latest.tipo || "Atividade",
    distancia: latest.distancia || 0,
    data: latest.data || "",
    cidade: latest.cidade || "",
    coordenadas:
      Array.isArray(latest.rota) && latest.rota[0]
        ? {
            latitude: latest.rota[0].latitude,
            longitude: latest.rota[0].longitude,
          }
        : null,
  };
};

const calculateSessionDurationSeconds = (session) => {
  if (!session) return 0;

  const finishTimestamp =
    session.status === "finished"
      ? session.endedAt || Date.now()
      : session.status === "paused_manual" || session.status === "paused_auto"
        ? session.pausedAt || Date.now()
        : Date.now();

  const elapsedMs = Math.max(
    0,
    finishTimestamp - (session.startedAt || Date.now()) - (session.pausedDurationMs || 0)
  );

  return Math.floor(elapsedMs / 1000);
};

const getAuthorProfile = async (uid) => {
  if (!uid) {
    return { authorName: "Usuário", authorPhotoUrl: null };
  }

  let snapshot;
  try {
    snapshot = await get(ref(database, `users/${uid}`));
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível carregar o perfil do autor.")
    );
  }
  const data = snapshot.exists() ? snapshot.val() : {};

  return {
    authorName: data.fullName || data.username || data.email || "Usuário",
    authorPhotoUrl: data.photoUrl || data.avatarUrl || null,
  };
};

export const createActivitySharePost = async ({
  userId,
  session,
  activityId,
  routeId,
  routeName,
  caption,
  activityType,
  photoUris,
  visibility,
}) => {
  assertAuthenticatedActor(userId, "compartilhar atividade");
  if (!userId) throw new Error("Usuário inválido para compartilhar atividade.");
  if (!session?.points?.length || session.points.length < 2) {
    throw new Error("Trajeto insuficiente para compartilhar.");
  }

  const { authorName, authorPhotoUrl } = await getAuthorProfile(userId);
  const durationSec = calculateSessionDurationSeconds(session);
  const fullPath = session.points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    altitude: typeof point.altitude === "number" ? point.altitude : null,
  }));
  const privacyZone = await getUserPrivacyZone(userId);
  const sanitizedRoute = sanitizeRouteForPublicView(fullPath, privacyZone);
  const path = sanitizedRoute.publicPoints;
  const elevation = session?.elevation || {};
  const paceMedioMinKm =
    durationSec > 0 && Number(session.distanceKm || 0) > 0
      ? durationSec / 60 / Number(session.distanceKm || 0)
      : null;
  const velocidadeMediaKmh =
    durationSec > 0 ? Number(session.distanceKm || 0) / (durationSec / 3600) : 0;
  const normalizedVisibility =
    visibility === "public" || visibility === "friends" || visibility === "private"
      ? visibility
      : "friends";

  try {
    const postRef = push(ref(database, COMMUNITY_POSTS_PATH));
    const postId = postRef.key;

    const photos = await uploadPostPhotos({
      photoUris: Array.isArray(photoUris) ? photoUris : [],
      ownerId: userId,
      postId,
    });

    await set(postRef, {
      postType: "activity_share",
      visibility: normalizedVisibility,
      authorId: userId,
      authorName,
      authorPhotoUrl,
      activityId: activityId || session.id,
      routeId: routeId || null,
      routeName: routeName || null,
      activityType: activityType || session.activityType || "trilha",
      distanceKm: Number(session.distanceKm || 0),
      durationSec,
      caption: (caption || "").trim(),
      activityDate: new Date(session.endedAt || Date.now()).toISOString(),
      velocidadeMediaKmh: Number(velocidadeMediaKmh.toFixed(2)),
      paceMedioMinKm: Number.isFinite(paceMedioMinKm) ? Number(paceMedioMinKm.toFixed(3)) : null,
      elevacaoGanhoM: Number(Number(elevation.gainMeters || 0).toFixed(1)),
      elevacaoPerdaM: Number(Number(elevation.lossMeters || 0).toFixed(1)),
      altitudeMinM:
        typeof elevation.minAltitude === "number" ? Number(elevation.minAltitude.toFixed(1)) : null,
      altitudeMaxM:
        typeof elevation.maxAltitude === "number" ? Number(elevation.maxAltitude.toFixed(1)) : null,
      privacySanitized: sanitizedRoute.sanitized,
      privacyTrimStartPoints: sanitizedRoute.removedFromStart,
      privacyTrimEndPoints: sanitizedRoute.removedFromEnd,
      routeSnapshot: {
        points: path,
        startPoint: path[0] || null,
        endPoint: path[path.length - 1] || null,
      },
      photos,
      comments: {},
      commentsCount: 0,
      kudos: {},
      kudosCount: 0,
      createdAt: new Date().toISOString(),
    });

    return postRef.key;
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível compartilhar a atividade.")
    );
  }
};

export const getCommunityPostById = async (postId) => {
  if (!postId) throw new Error("Post inválido.");

  try {
    const snapshot = await get(ref(database, `${COMMUNITY_POSTS_PATH}/${postId}`));
    if (!snapshot.exists()) {
      throw new Error("Post não encontrado.");
    }

    const list = mapPostsSnapshot({
      exists: () => true,
      val: () => ({ [postId]: snapshot.val() }),
    });

    return list[0];
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível carregar o post agora.")
    );
  }
};

export const deleteCommunityPost = async ({ postId, requesterId }) => {
  assertAuthenticatedActor(requesterId, "excluir post");
  if (!postId) throw new Error("Post inválido.");
  if (!requesterId) throw new Error("Usuário inválido.");

  try {
    const postRef = ref(database, `${COMMUNITY_POSTS_PATH}/${postId}`);
    const snapshot = await get(postRef);
    if (!snapshot.exists()) throw new Error("Post não encontrado.");

    const post = snapshot.val() || {};
    if (String(post.authorId || "") !== String(requesterId)) {
      throw new Error("Somente o autor pode excluir este post.");
    }

    await remove(postRef);
    return true;
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível excluir o post.")
    );
  }
};

export const deleteCommunityComment = async ({ postId, commentId, requesterId }) => {
  assertAuthenticatedActor(requesterId, "excluir comentário");
  if (!postId) throw new Error("Post inválido.");
  if (!commentId) throw new Error("Comentário inválido.");
  if (!requesterId) throw new Error("Usuário inválido.");

  try {
    const postRef = ref(database, `${COMMUNITY_POSTS_PATH}/${postId}`);
    const postSnapshot = await get(postRef);
    if (!postSnapshot.exists()) throw new Error("Post não encontrado.");
    const post = postSnapshot.val() || {};

    const commentRef = ref(database, `${COMMUNITY_POSTS_PATH}/${postId}/comments/${commentId}`);
    const commentSnapshot = await get(commentRef);
    if (!commentSnapshot.exists()) throw new Error("Comentário não encontrado.");
    const comment = commentSnapshot.val() || {};

    const isPostAuthor = String(post.authorId || "") === String(requesterId);
    const isCommentAuthor = String(comment.authorId || "") === String(requesterId);
    if (!isPostAuthor && !isCommentAuthor) {
      throw new Error("Você não tem permissão para excluir este comentário.");
    }

    await remove(commentRef);
    await runTransaction(ref(database, `${COMMUNITY_POSTS_PATH}/${postId}/commentsCount`), (current) => {
      const currentValue = typeof current === "number" ? current : 0;
      return Math.max(0, currentValue - 1);
    });
    return true;
  } catch (error) {
    throw new Error(
      normalizeFirebaseErrorMessage(error, "Não foi possível excluir o comentário.")
    );
  }
};
