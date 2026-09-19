"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { X, ArrowLeft, MessageCircle, Search, Building2 } from "lucide-react";
import { useChatSocket } from "./ChatSocketProvider";
import { ChatConversation } from "./ChatConversation";
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

export function ChatSidebar() {
  const {
    isSidebarOpen,
    activeConversationId,
    token,
    user,
    closeSidebar,
    selectConversation,
    socket,
    refreshUnreadCount,
  } = useChatSocket();

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Carrega a lista de conversas ao abrir a sidebar
  useEffect(() => {
    if (!isSidebarOpen || !token) return;

    let ignore = false;
    fetch(`${getPublicApiUrl()}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!ignore) {
          setConversations(data);
          setLoadingList(false);
        }
      })
      .catch(() => {
        if (!ignore) setLoadingList(false);
      });

    return () => {
      ignore = true;
    };
  }, [isSidebarOpen, token]);

  // Atualiza a lista quando recebe mensagem via socket em tempo real
  useEffect(() => {
    if (!socket || !token) return;
    const handleReceive = () => {
      fetch(`${getPublicApiUrl()}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setConversations(data))
        .catch(() => {});
      refreshUnreadCount();
    };
    socket.on("receiveMessage", handleReceive);
    return () => {
      socket.off("receiveMessage", handleReceive);
    };
  }, [socket, token, refreshUnreadCount]);

  // Carrega os detalhes e mensagens da conversa selecionada
  useEffect(() => {
    if (!activeConversationId || !token) return;

    let ignore = false;
    Promise.all([
      fetch(`${getPublicApiUrl()}/conversations/${activeConversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : null)),
      fetch(`${getPublicApiUrl()}/conversations/${activeConversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([conv, msgs]) => {
        if (!ignore) {
          if (!conv) {
            setDetailError("Conversa não encontrada.");
          } else {
            setActiveConversation(conv);
            setActiveMessages(msgs);
          }
          setLoadingDetail(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setDetailError("Erro ao carregar a conversa.");
          setLoadingDetail(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeConversationId, token]);

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
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const other = c.participants.find((p) => p.id !== user?.id);
      const nameMatch = other?.name?.toLowerCase().includes(q);
      const propMatch = c.property?.name?.toLowerCase().includes(q);
      return nameMatch || propMatch;
    });
  }, [conversations, searchQuery, user?.id]);

  return (
    <>
      {/* O ouvinte de parâmetro de URL deve ficar sempre montado */}
      <Suspense fallback={null}>
        <ChatParamListener />
      </Suspense>

      {isSidebarOpen && (
        <div className={styles.overlay} onClick={closeSidebar}>
          <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
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
                <div className={styles.headerTitleGroup}>
                  <h2 className={styles.title}>
                    {activeConversationId && activeConversation
                      ? activeConversation.participants.find((p) => p.id !== user?.id)?.name ?? "Conversa"
                      : "Mensagens"}
                  </h2>
                  {activeConversationId && activeConversation?.property && (
                    <span className={styles.subtitle}>{activeConversation.property.name}</span>
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
                /* Visualização da Conversa Ativa */
                loadingDetail ? (
                  <DetailSkeleton />
                ) : detailError ? (
                  <div className={styles.errorContainer}>
                    <p>{detailError}</p>
                    <button type="button" onClick={() => selectConversation(null)} className={styles.retryButton}>
                      Voltar para lista
                    </button>
                  </div>
                ) : activeConversation ? (
                  <div className={styles.conversationWrapper}>
                    <ChatConversation
                      conversation={activeConversation}
                      initialMessages={activeMessages}
                      token={token}
                      currentUser={{ id: user?.id ?? "", role: user?.role ?? "USER", name: user?.name ?? "Usuário" }}
                    />
                  </div>
                ) : (
                  <DetailSkeleton />
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

                  {loadingList ? (
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
                        const isActive = activeConversationId === c.id;

                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
                            onClick={() => selectConversation(c.id)}
                          >
                            <div className={styles.avatarWrapper}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  other?.avatar ??
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(other?.name ?? "?")}&background=E2E8F0&color=1E293B`
                                }
                                alt={other?.name ?? "Usuário"}
                                className={styles.avatar}
                              />
                              <span className={styles.onlineDot} />
                            </div>

                            <div className={styles.itemBody}>
                              <div className={styles.itemRow}>
                                <span className={styles.itemName}>{other?.name ?? "Usuário"}</span>
                                {lastMessage && (
                                  <span className={styles.itemTime}>{formatTime(lastMessage.createdAt)}</span>
                                )}
                              </div>

                              <div className={styles.itemRow}>
                                <span className={styles.itemPreview}>
                                  {c.isReported && <span className={styles.reportedBadge}>Denunciada</span>}
                                  {lastMessage ? lastMessage.content : c.property.name}
                                </span>
                                {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
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
