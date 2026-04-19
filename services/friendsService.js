import {
  get,
  onValue,
  push,
  ref,
  set,
  update,
} from "firebase/database";
import { database } from "./connectionFirebase";

const FRIENDSHIPS_PATH = "friendships";

const isPairMatch = (item, userA, userB) => {
  return (
    (item.senderId === userA && item.receiverId === userB) ||
    (item.senderId === userB && item.receiverId === userA)
  );
};

const mapFriendshipsSnapshot = (snapshot) => {
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.keys(data).map((id) => ({ id, ...data[id] }));
};

export const subscribeFriendships = (onChange, onError) => {
  return onValue(
    ref(database, FRIENDSHIPS_PATH),
    (snapshot) => {
      onChange(mapFriendshipsSnapshot(snapshot));
    },
    (error) => {
      console.warn("[friends] subscribeFriendships failed:", error?.message || String(error));
      if (typeof onError === "function") {
        onError(error);
      }
    }
  );
};

export const subscribeUsers = (onChange, onError) => {
  return onValue(
    ref(database, "users"),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        return;
      }

      const data = snapshot.val();
      const users = Object.keys(data).map((uid) => ({
        uid,
        ...data[uid],
        username: data[uid]?.username || `user_${uid.slice(0, 6)}`,
      }));
      onChange(users);
    },
    (error) => {
      console.warn("[friends] subscribeUsers failed:", error?.message || String(error));
      if (typeof onError === "function") {
        onError(error);
      }
    }
  );
};

export const sendFriendRequest = async ({ senderId, receiverId }) => {
  if (!senderId || !receiverId) {
    throw new Error("Usuários inválidos para solicitação de amizade.");
  }

  if (senderId === receiverId) {
    throw new Error("Você não pode adicionar a si mesmo.");
  }

  const friendshipsSnapshot = await get(ref(database, FRIENDSHIPS_PATH));
  const friendships = mapFriendshipsSnapshot(friendshipsSnapshot);

  const existing = friendships.find((item) =>
    isPairMatch(item, senderId, receiverId)
  );

  if (existing?.status === "accepted") {
    throw new Error("Este usuário já está na sua lista de amigos.");
  }

  if (existing?.status === "pending") {
    throw new Error("Já existe uma solicitação pendente entre vocês.");
  }

  if (existing?.id) {
    await update(ref(database, `${FRIENDSHIPS_PATH}/${existing.id}`), {
      senderId,
      receiverId,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    return existing.id;
  }

  const requestRef = push(ref(database, FRIENDSHIPS_PATH));
  await set(requestRef, {
    senderId,
    receiverId,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  return requestRef.key;
};

export const acceptFriendRequest = async (requestId) => {
  if (!requestId) throw new Error("Solicitação inválida.");

  await update(ref(database, `${FRIENDSHIPS_PATH}/${requestId}`), {
    status: "accepted",
    respondedAt: new Date().toISOString(),
  });
};

export const rejectFriendRequest = async (requestId) => {
  if (!requestId) throw new Error("Solicitação inválida.");

  await update(ref(database, `${FRIENDSHIPS_PATH}/${requestId}`), {
    status: "rejected",
    respondedAt: new Date().toISOString(),
  });
};
