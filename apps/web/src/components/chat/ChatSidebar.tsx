"use client";

import { useCallback, useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { X, ArrowLeft, MessageCircle, Search, Building2 } from "lucide-react";
import { useChatSocket } from "./ChatSocketProvider";
import { ChatConversation } from "./ChatConversation";
import { avatarUrl, messagePreview } from "./chat-utils";
import { getPublicApiUrl } from "@/lib/public-api";
import type { ConversationListItem, ConversationDetail, ChatMessage } from "@/lib/chat-api";
import styles from "./ChatSidebar.module.css";

function formatTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function ChatParamListener() {
  const searchParams = useSearchParams();
  const { openSidebar } = useChatSocket();

  useEffect(() => {
    const openChatParam = searchParams.get("openChat");
    if (openChatParam) {
      if (openChatParam === "true") {
        openSidebar();
      } else {
        openSidebar(openChatParam);
      }
      // Limpa a URL silenciosamente sem causar reload nem re-render na aplicação
      const url = new URL(window.location.href);
      url.searchParams.delete("openChat");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, [searchParams, openSidebar]);

  return null;
}

function ListSkeleton() {
  return (
    <div className={styles.skeletonContainer}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.skeletonItem}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonContent}>
            <div className={styles.skeletonLineTop} />
            <div className={styles.skeletonLineBottom} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.detailSkeletonContainer}>
      <div className={styles.detailSkeletonHeader} />
      <div className={styles.detailSkeletonBubbles}>
        <div className={`${styles.skeletonBubble} ${styles.left}`} />
        <div className={`${styles.skeletonBubble} ${styles.right}`} />
        <div className={`${styles.skeletonBubble} ${styles.left}`} />
      </div>
    </div>
  );
}

/**
 * Conversa carregada, sempre junto do id que foi pedido. A tela de detalhe só aparece quando o
 * `id` bate com a conversa ativa — antes a conversa anterior continuava montada durante a troca e,
 * como o componente não era remontado, seguia mostrando as mensagens antigas (ou da conversa
 * errada) mesmo depois de os dados novos chegarem.
 */
type LoadedDetail =
  | { id: string; conversation: ConversationDetail; messages: ChatMessage[]; error?: undefined }
  | { id: string; error: string; conversation?: undefined; messages?: undefined };

export function ChatSidebar() {
  const {
    isSidebarOpen,
    activeConversationId,
    token,
    user,
    closeSidebar,
    selectConversation,
    socket,
  } = useChatSocket();

  const [conversations, setConversations] = useState<ConversationListItem[] | null>(null);
  const [detail, setDetail] = useState<LoadedDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadConversations = useCallback(() => {
    if (!token) return;
    fetch(`${getPublicApiUrl()}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ConversationListItem[] | null) => {
        if (data) setConversations(data);
      })
      .catch(() => {});
  }, [token]);

  // Lista de conversas: recarrega toda vez que a sidebar abre (não só na primeira).
  useEffect(() => {
    if (!isSidebarOpen) return;
    loadConversations();
  }, [isSidebarOpen, loadConversations]);

  // Atualiza a lista com mensagem nova e na reconexão (o que chegou durante a queda não vem pelo
  // socket). O contador de não lidas já é atualizado pelo provider nesses mesmos eventos.
  useEffect(() => {
    if (!socket || !isSidebarOpen) return;
    socket.on("receiveMessage", loadConversations);
    socket.on("connect", loadConversations);
    return () => {
      socket.off("receiveMessage", loadConversations);
      socket.off("connect", loadConversations);
    };
  }, [socket, isSidebarOpen, loadConversations]);

  // Detalhe da conversa ativa: busca de novo a cada abertura da sidebar e a cada troca de
  // conversa. O cleanup descarta o que estava carregado, então a tela mostra o skeleton em vez da
  // conversa anterior enquanto a nova chega.
  useEffect(() => {
    if (!isSidebarOpen || !activeConversationId || !token) return;

    let ignore = false;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${getPublicApiUrl()}/conversations/${activeConversationId}`, { headers }).then((res) =>
        res.ok ? res.json() : null
      ),
      fetch(`${getPublicApiUrl()}/conversations/${activeConversationId}/messages`, { headers }).then((res) =>
        res.ok ? res.json() : null
      ),
    ])
      .then(([conversation, messages]: [ConversationDetail | null, ChatMessage[] | null]) => {
        if (ignore) return;
        if (!conversation || !messages) {
          setDetail({ id: activeConversationId, error: "Conversa não encontrada." });
        } else {
          setDetail({ id: activeConversationId, conversation, messages });
        }
      })
      .catch(() => {
        if (!ignore) setDetail({ id: activeConversationId, error: "Erro ao carregar a conversa." });
      });

    return () => {
      ignore = true;
      setDetail(null);
    };
  }, [isSidebarOpen, activeConversationId, token]);

  // Atalho ESC para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSidebarOpen) {
        closeSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarOpen, closeSidebar]);

  // Filtro de busca na lista de conversas
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const other = c.participants.find((p) => p.id !== user?.id);
      const nameMatch = other?.name?.toLowerCase().includes(q);
      const propMatch = c.property?.name?.toLowerCase().includes(q);
      return nameMatch || propMatch;
    });
  }, [conversations, searchQuery, user?.id]);

  const currentDetail = detail && detail.id === activeConversationId ? detail : null;
  const activeConversation = currentDetail?.conversation ?? null;
  const activeOther = activeConversation?.participants.find((p) => p.id !== user?.id);

  return (
    <>
      {/* O ouvinte de parâmetro de URL deve ficar sempre montado */}
      <Suspense fallback={null}>
        <ChatParamListener />
      </Suspense>

      {isSidebarOpen && (
        <div className={styles.overlay} onClick={closeSidebar}>
          <aside className={styles.drawer} onClick={(e) => e.stopPropagation()} aria-label="Mensagens">
            {/* Cabeçalho da Sidebar */}
            <header className={styles.header}>
              <div className={styles.headerLeft}>
                {activeConversationId && (
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => selectConversation(null)}
                    title="Voltar às conversas"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                {activeConversationId && activeConversation && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl(activeOther?.name, activeOther?.avatar)}
                    alt=""
                    className={styles.headerAvatar}
                  />
                )}
                <div className={styles.headerTitleGroup}>
                  <h2 className={styles.title}>
                    {activeConversationId
                      ? activeConversation
                        ? activeOther?.name ?? "Aguardando atendimento"
                        : "Carregando…"
                      : "Mensagens"}
                  </h2>
                  {!activeConversationId && conversations && conversations.length > 0 && (
                    <span className={styles.subtitle}>
                      {conversations.length} {conversations.length === 1 ? "conversa" : "conversas"}
                    </span>
                  )}
                  {activeConversationId && activeConversation && !activeOther && (
                    <span className={styles.subtitle}>Um corretor vai responder em breve</span>
                  )}
                </div>
              </div>

              <button type="button" className={styles.closeButton} onClick={closeSidebar} title="Fechar chat (ESC)">
                <X size={20} />
              </button>
            </header>

            {/* Conteúdo Principal da Sidebar */}
            <div className={styles.content}>
              {!token ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyBadgeIcon}>
                    <MessageCircle size={32} />
                  </div>
                  <h3 className={styles.emptyTitle}>Conversas Zhivago</h3>
                  <p className={styles.emptyText}>Faça login para acessar e responder suas mensagens.</p>
                </div>
              ) : activeConversationId ? (
                /* Visualização da Conversa Ativa — só renderiza com o usuário carregado: sem ele
                   `currentUser.id` vinha vazio, o viewer não era reconhecido como participante e o
                   campo de mensagem nem aparecia. */
                !currentDetail || !user ? (
                  <DetailSkeleton />
                ) : !currentDetail.conversation ? (
                  <div className={styles.errorContainer}>
                    <p>{currentDetail.error ?? "Conversa não encontrada."}</p>
                    <button type="button" onClick={() => selectConversation(null)} className={styles.retryButton}>
                      Voltar para lista
                    </button>
                  </div>
                ) : (
                  <div className={styles.conversationWrapper}>
                    <ChatConversation
                      key={currentDetail.id}
                      conversation={currentDetail.conversation}
                      initialMessages={currentDetail.messages}
                      token={token}
                      currentUser={{ id: user.id, role: user.role ?? "USER", name: user.name ?? "Usuário" }}
                    />
                  </div>
                )
              ) : (
                /* Visualização da Lista de Conversas com Busca */
                <div className={styles.listContainer}>
                  <div className={styles.searchWrapper}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                      type="text"
                      placeholder="Buscar por pessoa ou imóvel…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={styles.searchInput}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className={styles.clearSearch}
                        onClick={() => setSearchQuery("")}
                        title="Limpar busca"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {conversations === null ? (
                    <ListSkeleton />
                  ) : filteredConversations.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyBadgeIcon}>
                        <MessageCircle size={32} />
                      </div>
                      {searchQuery ? (
                        <p className={styles.emptyText}>
                          Nenhuma conversa encontrada para &quot;{searchQuery}&quot;.
                        </p>
                      ) : (
                        <>
                          <h3 className={styles.emptyTitle}>Sua caixa de entrada está vazia</h3>
                          <span className={styles.emptySubtext}>
                            Inicie uma conversa diretamente na página de um imóvel de seu interesse.
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className={styles.list}>
                      {filteredConversations.map((c) => {
                        const other = c.participants.find((p) => p.id !== user?.id);
                        const lastMessage = c.messages[0];
                        const unread = c._count?.messages ?? 0;

                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`${styles.item} ${unread > 0 ? styles.itemUnread : ""}`}
                            onClick={() => selectConversation(c.id)}
                          >
                            <div className={styles.avatarWrapper}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={avatarUrl(other?.name, other?.avatar)} alt="" className={styles.avatar} />
                              {c.property.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.property.image} alt="" className={styles.propertyThumb} />
                              )}
                            </div>

                            <div className={styles.itemBody}>
                              <div className={styles.itemRow}>
                                <span className={styles.itemName}>{other?.name ?? "Aguardando atendimento"}</span>
                                {lastMessage && (
                                  <span className={styles.itemTime}>{formatTime(lastMessage.createdAt)}</span>
                                )}
                              </div>

                              <div className={styles.itemRow}>
                                <span className={styles.itemPreview}>
                                  {c.isReported && <span className={styles.reportedBadge}>Denunciada</span>}
                                  <span className={styles.itemPreviewText}>
                                    {lastMessage ? messagePreview(lastMessage, user?.id) : "Nenhuma mensagem ainda"}
                                  </span>
                                </span>
                                {unread > 0 && <span className={styles.unreadBadge}>{unread > 99 ? "99+" : unread}</span>}
                              </div>

                              <div className={styles.propertyTag}>
                                <Building2 size={12} />
                                <span>{c.property.name}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
