import { getApiUrl } from "@/lib/api";

export interface ChatParticipant {
  id: string;
  name: string;
  avatar: string | null;
}

export interface ChatMessage {
  id: string;
  content: string;
  type: string;
  metadata: string | null;
  senderId: string;
  conversationId: string;
  isRead: boolean;
  createdAt: string;
  sender: ChatParticipant;
}

export interface ConversationListItem {
  id: string;
  propertyId: string;
  isReported: boolean;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
  property: { id: string; name: string; price: number; image: string };
  participants: ChatParticipant[];
  messages: ChatMessage[]; // só a última mensagem (preview do inbox)
  _count: { messages: number };
}

export interface ConversationDetail {
  id: string;
  propertyId: string;
  isReported: boolean;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
  property: {
    id: string;
    name: string;
    price: number;
    image: string;
    ownerId: string | null;
    category: string;
    status: string;
  };
  participants: ChatParticipant[];
}

export async function getConversations(token: string): Promise<ConversationListItem[]> {
  const res = await fetch(`${getApiUrl()}/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar conversas (${res.status})`);
  return res.json();
}

export async function getConversation(token: string, id: string): Promise<ConversationDetail | null> {
  const res = await fetch(`${getApiUrl()}/conversations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Falha ao buscar conversa (${res.status})`);
  return res.json();
}

export async function getMessages(token: string, id: string): Promise<ChatMessage[]> {
  const res = await fetch(`${getApiUrl()}/conversations/${id}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar mensagens (${res.status})`);
  return res.json();
}
