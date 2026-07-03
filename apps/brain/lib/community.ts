/**
 * lib/community.ts — Tipos y constantes del foro de comunidad Enverde
 *
 * El foro es GLOBAL (compartido entre todos los cafés/bares/restaurantes),
 * no org-scoped: la gracia es que la comunidad se pregunte cosas entre negocios
 * parecidos. Estos tipos los comparten las API routes (servidor) y la página
 * /comunidad (cliente), por eso este archivo es puro: sin imports de servidor.
 */

export const TOPICS = [
  { id: "general", label: "General", emoji: "💬" },
  { id: "cafeteria", label: "Cafeterías", emoji: "☕" },
  { id: "bar", label: "Bares", emoji: "🍺" },
  { id: "restaurante", label: "Restaurantes", emoji: "🍽️" },
] as const;

export type Topic = (typeof TOPICS)[number]["id"];
export type PostType = "question" | "announcement";

export const TOPIC_IDS = TOPICS.map((t) => t.id) as readonly Topic[];

export function isTopic(v: unknown): v is Topic {
  return typeof v === "string" && (TOPIC_IDS as readonly string[]).includes(v);
}

export function topicLabel(id: string): string {
  return TOPICS.find((t) => t.id === id)?.label ?? "General";
}

export function topicEmoji(id: string): string {
  return TOPICS.find((t) => t.id === id)?.emoji ?? "💬";
}

/** Límites de longitud (defensa básica, no moderación). */
export const LIMITS = {
  TITLE_MAX: 140,
  BODY_MAX: 4000,
  ANSWER_MAX: 4000,
} as const;

export interface CommunityPost {
  id: string;
  type: PostType;
  topic: Topic;
  title: string;
  body: string;
  authorUid: string;
  authorOrgId: string | null;
  authorName: string;
  createdAt: number | null; // epoch ms (serializado desde Firestore Timestamp)
  answerCount: number;
  pinned: boolean;
  status: "open" | "resolved";
  reportCount?: number; // solo se expone a staff (moderación)
}

export interface CommunityAnswer {
  id: string;
  body: string;
  authorUid: string;
  authorOrgId: string | null;
  authorName: string;
  isStaff: boolean;
  createdAt: number | null;
  upvotes: number;
  voted: boolean; // si el usuario actual ha votado esta respuesta
  reportCount?: number; // solo se expone a staff (moderación)
}

export interface CommunityReportGroup {
  key: string; // postId__answerId|post — identifica el objeto reportado
  postId: string;
  answerId: string | null;
  targetType: "post" | "answer";
  title: string; // título del hilo (contexto)
  excerpt: string; // cuerpo del hilo o de la respuesta reportada
  topic: Topic;
  authorName: string; // autor del contenido reportado
  reportCount: number;
  reasons: string[];
  lastAt: number | null;
}

export interface CommunityNotification {
  id: string;
  postId: string;
  postTitle: string;
  answerAuthorName: string;
  createdAt: number | null;
  read: boolean;
}
