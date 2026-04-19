export type ActivityPhoto = {
  id: string;
  url: string;
  storagePath?: string;
  createdAt: string;
};

export type Kudo = {
  userId: string;
  userName?: string;
  userPhotoUrl?: string | null;
  createdAt: string;
};

export type Comment = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt?: string;
};

export type FeedPost = {
  id: string;
  postType: "activity_share" | "text_post";
  visibility: "friends" | "public" | "private";
  authorId: string;
  authorName?: string;
  authorPhotoUrl?: string | null;
  activityId?: string | null;
  routeId?: string | null;
  routeName?: string | null;
  activityType?: string;
  distanceKm?: number;
  durationSec?: number;
  caption?: string;
  activityDate?: string;
  createdAt?: string;
  routeSnapshot?: {
    points?: { latitude: number; longitude: number }[];
    startPoint?: { latitude: number; longitude: number } | null;
    endPoint?: { latitude: number; longitude: number } | null;
  };
  photos?: ActivityPhoto[];
  comments?: Comment[];
  commentsCount?: number;
  kudos?: Record<string, Kudo>;
  kudosCount?: number;
};

