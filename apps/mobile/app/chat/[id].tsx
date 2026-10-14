import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Image, ActivityIndicator, Alert, Modal, AppState } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import type { Negotiation, NegotiationRound } from '@zhivago/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_URL } from '@/config/api';

const PAYMENT_METHODS = ['À Vista', 'Financiamento', 'Parcelado', 'Carta de Crédito'];

const ROUND_STATUS_LABEL: Record<string, string> = {
  ACCEPTED: '✅ Proposta aceita',
  REJECTED: '❌ Proposta recusada',
  COUNTERED: '↪ Respondida com contraproposta',
  WITHDRAWN: '↩ Proposta retirada',
  EXPIRED: '⌛ Proposta expirada',
  CANCELLED: 'Proposta cancelada',
};

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

function parseMeta(raw: string | null | undefined): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Junta mensagens sem duplicar — a mesma mensagem pode chegar pelo callback do envio, pelo socket
 * (outro aparelho do remetente) e por uma ressincronização. O `id` do banco é a chave.
 */
function mergeById(prev: any[], incoming: any[]): any[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message });
  return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// "/proposta 450000 financiamento" e aliases (ver CHAT_COMMANDS no backend, socket.ts); "/negociar" só com valor.
const PROPOSAL_COMMAND_RE =
  /^(\/(?:proposta|propor|oferta|ofertar|contraproposta|contrapropor|contra|venda|vender|ofertar-venda|comprar|compra|quero-comprar)(?=\s|$)|\/(?:negociar|negocia[çc][ãa]o|negociando)(?=\s+\S))\s*(.*)$/i;
const SALE_OFFER_RE = /^\/(venda|vender|ofertar-venda)$/i;
const BUY_RE = /^\/(comprar|compra|quero-comprar)$/i;

const PAYMENT_METHOD_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: 'À Vista', pattern: /^(a|à)?\s*vista$|^avista$|^pix$|^dinheiro$/ },
  { label: 'Financiamento', pattern: /^financ/ },
  { label: 'Parcelado', pattern: /^parcel/ },
  { label: 'Carta de Crédito', pattern: /^carta/ },
];

/** Mesma leitura do backend (parseProposalArgument em socket.ts): valor + forma de pagamento opcional. */
function parseProposalArgument(raw: string) {
  const match = raw.match(/\d[\d.,]*/);
  let value: number | null = null;
  if (match) {
    const cleaned = match[0];
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
        ? cleaned.replace(/\./g, '')
        : cleaned;
    const parsed = Number(normalized);
    value = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const rest = (match ? raw.replace(match[0], ' ') : raw)
    .replace(/r\$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^(via|no|na|em|com|,|-)\s+/, '');
  const method = rest ? PAYMENT_METHOD_PATTERNS.find((m) => m.pattern.test(rest)) : undefined;
  return { value, valueText: match?.[0] ?? '', paymentMethod: method?.label ?? null };
}

function upsertNegotiation(list: Negotiation[], next: Negotiation): Negotiation[] {
  return list.some((n) => n.id === next.id) ? list.map((n) => (n.id === next.id ? next : n)) : [...list, next];
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { token, user } = useAuth();
  const { socket } = useChat();
  const insets = useSafeAreaInsets();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<any>(null);
  const [canManage, setCanManage] = useState(false);
  const [availableCommands, setAvailableCommands] = useState<{ trigger: string; aliases: string[]; label: string; description: string; argument?: string }[]>([]);
  const [isParticipant, setIsParticipant] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isReported, setIsReported] = useState(false);

  // Negociação de valor (lib/negotiations.ts no backend) — mesmas regras do web.
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [isOfferModalVisible, setIsOfferModalVisible] = useState(false);
  const [counterTo, setCounterTo] = useState<NegotiationRound | null>(null);
  const [offerMode, setOfferMode] = useState<'propose' | 'sale' | 'buy'>('propose');
  const [offerValue, setOfferValue] = useState('');
  const [offerPaymentMethod, setOfferPaymentMethod] = useState('À Vista');
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [busyRoundId, setBusyRoundId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  const viewerSide = canManage ? 'LISTING' : 'CUSTOMER';
  const openNegotiation = negotiations.find((n) => n.status === 'OPEN');
  const pendingRound = openNegotiation?.rounds.find((r) => r.status === 'PENDING');
  const waitingOnOther = !!pendingRound && pendingRound.side === viewerSide;
  const canNegotiate =
    !!property && isParticipant && !isClosed && property.acceptsNegotiation && property.status === 'APPROVED';
  // Venda dá pra fechar mesmo sem negociação: anunciante oferece (/venda), comprador compra pelo
  // valor anunciado (/comprar). Contraproposta só se o anúncio aceitar negociar (ou pro anunciante).
  const canCloseSale = !!property && isParticipant && !isClosed && property.operationType === 'SALE' && property.status === 'APPROVED';
  const canCounter = !!property?.acceptsNegotiation || canManage;

  const markAsRead = useCallback(async () => {
    try {
      await fetch(`${API_URL}/conversations/${id}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      // Ignorar
    }
  }, [id, token]);

  const loadConversation = useCallback(async () => {
    const convRes = await fetch(`${API_URL}/conversations/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!convRes.ok) return;
    const currentConv = await convRes.json();
    setProperty(currentConv.property);
    setCanManage(!!currentConv.canManage);
    setAvailableCommands(currentConv.availableCommands ?? []);
    setIsParticipant(currentConv.participants.some((p: any) => p.id === user?.id));
    setIsClosed(currentConv.isClosed);
    setIsReported(currentConv.isReported);
  }, [id, token, user?.id]);

  /**
   * Busca de novo conversa, mensagens e negociações. Chamada ao abrir a tela, ao reconectar o
   * socket e ao voltar o app pro primeiro plano: o servidor não reenvia o que foi emitido enquanto
   * a conexão estava caída, então sem isso essas mensagens "sumiam" até reabrir a conversa.
   */
  const fetchMessagesAndConversation = useCallback(async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [, msgRes, negRes] = await Promise.all([
        loadConversation(),
        fetch(`${API_URL}/conversations/${id}/messages`, { headers }),
        fetch(`${API_URL}/conversations/${id}/negotiations`, { headers }),
      ]);
      if (msgRes.ok) {
        const msgs = await msgRes.json();
        setMessages(msgs);
      }
      if (negRes.ok) {
        setNegotiations(await negRes.json());
      }
      markAsRead();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [id, token, loadConversation, markAsRead]);

  useEffect(() => {
    fetchMessagesAndConversation();
  }, [fetchMessagesAndConversation]);

  // App voltou pro primeiro plano — a conexão pode ter ficado suspensa em segundo plano.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchMessagesAndConversation();
    });
    return () => subscription.remove();
  }, [fetchMessagesAndConversation]);

  /**
   * ─── ESCUTA DE MENSAGENS NO SOCKET GLOBAL ──────────────────────────────────────────
   * Reusa o socket único e persistente do ChatContext em vez de abrir uma conexão própria
   * por tela — evita conexões duplicadas ao servidor por usuário.
   */
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message: any) => {
      // Filtro de Segurança: Garante que a mensagem recebida pertence a ESTA conversa aberta
      if (message.conversationId !== id) return;
      setMessages(prev => mergeById(prev, [message]));
      // Se o usuário está com o chat aberto e ativo, marca automaticamente a mensagem como lida no servidor
      if (message.senderId !== user?.id) markAsRead();
      if (message.type !== 'TEXT') loadConversation().catch(() => {});
    };

    // Card de reserva respondido pelo outro lado.
    const handleMessageUpdated = (update: { id: string; type: string; conversationId: string }) => {
      if (update.conversationId !== id) return;
      setMessages(prev => prev.map(m => (m.id === update.id ? { ...m, type: update.type } : m)));
      loadConversation().catch(() => {});
    };

    // Rodada de negociação nova/aceita/recusada/expirada.
    const handleNegotiationUpdated = (negotiation: Negotiation) => {
      if (negotiation.conversationId !== id) return;
      setNegotiations(prev => upsertNegotiation(prev, negotiation));
      loadConversation().catch(() => {});
    };

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('messageUpdated', handleMessageUpdated);
    socket.on('negotiationUpdated', handleNegotiationUpdated);
    socket.on('connect', fetchMessagesAndConversation);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('messageUpdated', handleMessageUpdated);
      socket.off('negotiationUpdated', handleNegotiationUpdated);
      socket.off('connect', fetchMessagesAndConversation);
    };
  }, [socket, id, user?.id, markAsRead, loadConversation, fetchMessagesAndConversation]);

  // 'sale' = oferta de venda do anunciante (valor do anúncio pré-preenchido); 'buy' = compra pelo
  // valor anunciado (valor fixo).
  const openOfferModal = (round: NegotiationRound | null, mode: 'propose' | 'sale' | 'buy' = 'propose') => {
    setCounterTo(round);
    setOfferMode(round ? 'propose' : mode);
    setOfferValue(mode === 'sale' && property ? String(Math.round(property.price)) : '');
    setOfferPaymentMethod(round?.paymentMethod ?? PAYMENT_METHODS[0]!);
    setIsOfferModalVisible(true);
  };

  const sendOffer = async () => {
    const rawVal = offerMode === 'buy' ? Number(property?.price) : parseFloat(offerValue.replace(/[^0-9]/g, ''));
    if (isNaN(rawVal) || rawVal <= 0) {
      Alert.alert('Valor inválido', 'Digite um valor de proposta válido maior que zero.');
      return;
    }

    setIsSubmittingOffer(true);
    try {
      // Mesmo endpoint do web (proposta nova ou contraproposta, conforme a rodada pendente).
      const res = await fetch(`${API_URL}/conversations/${id}/negotiations/rounds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          value: rawVal,
          paymentMethod: property?.operationType === 'SALE' ? offerPaymentMethod : null,
        })
      });

      const data = await res.json().catch(() => null);
      if (res.ok) {
        if (data?.negotiation) setNegotiations(prev => upsertNegotiation(prev, data.negotiation));
        if (data?.message) setMessages(prev => mergeById(prev, [data.message]));
        setOfferValue('');
        setIsOfferModalVisible(false);
        setCounterTo(null);
      } else {
        Alert.alert('Erro', data?.error || 'Não foi possível enviar a proposta.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Verifique sua conexão.');
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const respondToRound = async (roundId: string, action: 'accept' | 'reject' | 'withdraw') => {
    setBusyRoundId(roundId);
    try {
      const res = await fetch(`${API_URL}/offers/${roundId}/${action}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        Alert.alert('Erro', data?.error || 'Não foi possível concluir a ação.');
        fetchMessagesAndConversation();
        return;
      }
      if (data?.id) setNegotiations(prev => upsertNegotiation(prev, data));
    } catch (e) {
      Alert.alert('Erro', 'Verifique sua conexão.');
    } finally {
      setBusyRoundId(null);
    }
  };

  const confirmAccept = (roundId: string) => {
    const round = negotiations.flatMap((n) => n.rounds).find((r) => r.id === roundId);
    const isSaleDeal = property?.operationType === 'SALE' && round;
    const buying = isSaleDeal && viewerSide === 'CUSTOMER';
    Alert.alert(
      buying ? 'Confirmar compra' : 'Aceitar proposta',
      isSaleDeal
        ? `${buying ? 'Comprar' : 'Vender'} por ${formatBRL(round.value)}? O imóvel será marcado como vendido.`
        : 'O valor passa a valer como acordado. Deseja aceitar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: buying ? 'Comprar' : 'Aceitar', onPress: () => respondToRound(roundId, 'accept') },
      ]
    );
  };

  const sendContent = (content: string) => {
    if (!content.trim() || !socket || isClosed) return;
    if (!socket.connected) {
      Alert.alert('Sem conexão', 'Não foi possível enviar agora. Tente novamente em instantes.');
      return;
    }

    setInput('');

    socket.timeout(15000).emit('sendMessage', { conversationId: id, content: content.trim() }, (err: Error | null, response: any) => {
      if (err || !response) {
        setInput(content);
        Alert.alert('Erro', 'O servidor não respondeu. Tente novamente.');
        return;
      }
      if (response.error) {
        Alert.alert('Erro', response.error);
        return;
      }
      if (response.message) {
        setMessages(prev => mergeById(prev, [response.message]));
      } else {
        loadConversation().catch(() => {});
      }
    });
  };

  const sendMessage = () => sendContent(input);

  // Menu de "/" (autocomplete de comandos) — mesma lista que o backend calcula pra esta conversa
  // (`availableCommands`, ver computeAvailableCommands em chat.controller.ts), filtrada pelo texto
  // digitado depois da "/".
  const slashQuery = input.startsWith('/') ? input.toLowerCase() : null;
  const matchingCommands = slashQuery
    ? availableCommands.filter(
        (cmd) => cmd.trigger.startsWith(slashQuery) || cmd.aliases.some((alias) => alias.startsWith(slashQuery))
      )
    : [];

  // Prévia de "/proposta <valor> [forma de pagamento]" — mesma leitura do backend.
  const isSale = property?.operationType === 'SALE';
  const proposalMatch = canNegotiate || canCloseSale ? input.match(PROPOSAL_COMMAND_RE) : null;
  const proposalDraft = proposalMatch
    ? {
        command: proposalMatch[1]!,
        kind: SALE_OFFER_RE.test(proposalMatch[1]!) ? 'sale' : BUY_RE.test(proposalMatch[1]!) ? 'buy' : 'propose',
        ...parseProposalArgument(proposalMatch[2] ?? ''),
      }
    : null;
  const proposalHintText = !proposalDraft
    ? ''
    : proposalDraft.kind === 'buy'
      ? `Compra pelo valor anunciado de ${formatBRL(Number(property?.price))}${proposalDraft.paymentMethod ? ` · ${proposalDraft.paymentMethod}` : ''}`
      : proposalDraft.kind === 'sale'
        ? `Oferta de venda de ${formatBRL(proposalDraft.value ?? Number(property?.price))}${proposalDraft.value === null ? ' (valor do anúncio)' : ''}${proposalDraft.paymentMethod ? ` · ${proposalDraft.paymentMethod}` : ''}`
        : proposalDraft.value === null
          ? `Digite o valor${isSale ? ' e, se quiser, a forma de pagamento' : ''} — ex.: ${proposalDraft.command} 450000${isSale ? ' financiamento' : ''}`
          : `${pendingRound ? 'Contraproposta' : 'Proposta'} de ${formatBRL(proposalDraft.value)}${property?.operationType === 'MONTHLY_RENT' ? '/mês' : ''}${isSale && proposalDraft.paymentMethod ? ` · ${proposalDraft.paymentMethod}` : ''}`;

  const handleReport = () => {
    Alert.alert(
      'Suporte',
      'Deseja reportar esta conversa para a moderação?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Reportar ao Admin', 
          style: 'destructive', 
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/conversations/${id}/report`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res.ok) {
                setIsReported(true);
                Alert.alert('Sucesso', 'O Administrador foi notificado e já tem acesso para auditar esta conversa.');
              }
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível reportar.');
            }
          } 
        }
      ]
    );
  };

  const handleToggleClose = () => {
    const action = isClosed ? 'reopen' : 'close';
    const confirmMessage = isClosed ? 'Deseja reabrir esta conversa?' : 'Deseja fechar esta conversa e bloquear novas mensagens?';
    
    Alert.alert(
      'Moderação',
      confirmMessage,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar', 
          style: 'destructive', 
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/conversations/${id}/${action}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (res.ok) {
                setIsClosed(!isClosed);
                Alert.alert('Sucesso', `Conversa ${isClosed ? 'reaberta' : 'fechada'} com sucesso.`);
              }
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível alterar o status da conversa.');
            }
          } 
        }
      ]
    );
  };

  /**
   * Card de rodada de negociação — antes o app não conhecia esse tipo e mostrava só o texto
   * ("Proposta: R$ …"), sem botões: a proposta feita pelo app ficava sem como ser respondida aqui.
   */
  const renderNegotiationRound = (item: any, isMine: boolean, isAuditor: boolean) => {
    const meta = parseMeta(item.metadata) ?? {};
    const negotiation = negotiations.find((n) => n.id === meta.negotiationId);
    const round = negotiation?.rounds.find((r) => r.id === meta.offerId);
    const textStyle = [styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText];
    const mutedColor = isMine ? '#E0E7FF' : '#64748B';

    if (!negotiation || !round) {
      return (
        <View>
          <Text style={[...textStyle, { fontWeight: 'bold', marginBottom: 6 }]}>🤝 Negociação</Text>
          <Text style={textStyle}>{item.content}</Text>
        </View>
      );
    }

    const suffix = round.unit === 'MONTHLY' ? '/mês' : '';
    const isPending = round.status === 'PENDING';
    const fromOtherSide = round.side !== viewerSide;
    const canAct = isParticipant && !isAuditor && !isClosed && isPending;
    const busy = busyRoundId === round.id;
    // Venda: pro comprador, aceitar = comprar.
    const isSaleRound = negotiation.operationType === 'SALE';

    return (
      <View>
        <Text style={[...textStyle, { fontWeight: 'bold', marginBottom: 6 }]}>
          🤝{' '}
          {round.previousOfferId
            ? 'Contraproposta'
            : isSaleRound && round.side === 'LISTING'
              ? 'Oferta de venda'
              : isSaleRound && round.value === negotiation.referencePrice
                ? 'Compra pelo valor anunciado'
                : 'Proposta de valor'}
        </Text>
        <Text style={[...textStyle, { fontSize: 18, fontWeight: '800', marginBottom: 4 }]}>
          {formatBRL(round.value)}{suffix}
        </Text>
        <Text style={{ fontSize: 12, color: mutedColor }}>
          Anúncio: {formatBRL(negotiation.referencePrice)}{suffix}
        </Text>
        {round.paymentMethod && (
          <Text style={{ fontSize: 12, color: mutedColor }}>Pagamento: {round.paymentMethod}</Text>
        )}
        <Text style={{ fontSize: 12, color: mutedColor }}>
          Por {round.proposedById === user?.id ? 'você' : round.proposedByName}
        </Text>
        {isPending && round.expiresAt && (
          <Text style={{ fontSize: 12, color: mutedColor, marginTop: 4 }}>
            {fromOtherSide ? 'Responda até' : 'Aguardando resposta até'}{' '}
            {new Date(round.expiresAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        {!isPending && ROUND_STATUS_LABEL[round.status] && (
          <Text style={{ color: mutedColor, fontWeight: 'bold', fontSize: 12, marginTop: 6 }}>
            {ROUND_STATUS_LABEL[round.status]}
          </Text>
        )}

        {canAct && fromOtherSide && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
              disabled={busy}
              onPress={() => confirmAccept(round.id)}
            >
              <Text style={styles.actionBtnText}>{isSaleRound && viewerSide === 'CUSTOMER' ? 'Comprar' : 'Aceitar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
              disabled={busy}
              onPress={() => respondToRound(round.id, 'reject')}
            >
              <Text style={styles.actionBtnText}>Recusar</Text>
            </TouchableOpacity>
            {canCounter && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]}
                disabled={busy}
                onPress={() => openOfferModal(round)}
              >
                <Text style={styles.actionBtnText}>Contrapropor</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {canAct && !fromOtherSide && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : '#F1F5F9', marginTop: 10, flex: 0 }]}
            disabled={busy}
            onPress={() => respondToRound(round.id, 'withdraw')}
          >
            <Text style={[styles.actionBtnText, { color: isMine ? 'white' : '#475569' }]}>Retirar proposta</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen options={{ title: 'Mensagens', headerTintColor: '#4F46E5', headerBackTitle: 'Voltar' }} />
      {/* Header Property Context */}
      {property && (
        <View style={styles.propertyHeader}>
          <Image source={{ uri: property.image }} style={styles.propertyImage} />
          <View style={styles.propertyInfo}>
            <Text style={styles.propertyTitle} numberOfLines={1}>{property.name}</Text>
            <Text style={styles.propertyPrice}>R$ {property.price}</Text>
          </View>
          <TouchableOpacity 
            style={styles.viewPropertyBtn}
            onPress={() => router.push(`/imovel/${property.id}`)}
          >
            <Text style={styles.viewPropertyText}>Ver</Text>
          </TouchableOpacity>
          {/* Negociação: aluguel/venda que aceitam negociar; venda sempre pode fechar (oferta do
              anunciante ou compra pelo valor anunciado). Rodada do outro lado se responde no card. */}
          {(canNegotiate || canCloseSale) && !(pendingRound && !waitingOnOther && !canCounter) && (
            <TouchableOpacity
              style={[styles.viewPropertyBtn, { backgroundColor: waitingOnOther ? '#A5B4FC' : '#4F46E5', marginLeft: 8 }]}
              disabled={waitingOnOther}
              onPress={() =>
                pendingRound
                  ? openOfferModal(pendingRound.side !== viewerSide ? pendingRound : null)
                  : canCloseSale && canManage
                    ? openOfferModal(null, 'sale')
                    : canCloseSale && !property.acceptsNegotiation
                      ? openOfferModal(null, 'buy')
                      : openOfferModal(null)
              }
            >
              <Text style={[styles.viewPropertyText, { color: 'white' }]}>
                {waitingOnOther
                  ? 'Aguardando'
                  : pendingRound
                    ? 'Contrapropor'
                    : canCloseSale && canManage
                      ? 'Oferta de venda'
                      : canCloseSale && !property.acceptsNegotiation
                        ? 'Comprar'
                        : 'Proposta'}
              </Text>
            </TouchableOpacity>
          )}
          {/* Opção para o Proprietário */}
          {user?.id === property.ownerId && isParticipant && (
            <TouchableOpacity 
              style={{ marginLeft: 12, padding: 4 }}
              onPress={handleReport}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={isReported ? "#EF4444" : "#64748B"} />
            </TouchableOpacity>
          )}
          {/* Opção para o Admin */}
          {user?.role === 'ADMIN' && (
            <TouchableOpacity 
              style={{ marginLeft: 12, padding: 4 }}
              onPress={handleToggleClose}
            >
              <Ionicons name={isClosed ? "lock-closed" : "lock-open"} size={20} color={isClosed ? "#EF4444" : "#10B981"} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={styles.messageList}
      renderItem={({ item }) => {
          /**
           * MODO DE AUDITORIA DE ADMINS:
           * Se um Administrador estiver na conversa via denúncia (`isReported: true`), ele 
           * é considerado um 'Auditor' (Apenas Leitura). Para que ele consiga ler o chat 
           * de forma intuitiva, o app simula o fluxo: as mensagens do Dono do Imóvel vão 
           * para a DIREITA (`isMine = true`) e as do Interessado/Comprador vão para a ESQUERDA.
           * Para usuários comuns participantes, comparamos simplesmente com seu próprio ID.
           */
          const isAuditor = !isParticipant && user?.role === 'ADMIN';
          const isMine = isAuditor 
            ? item.senderId === property?.ownerId 
            : item.senderId === user?.id;

          return (
            <View style={[styles.messageBubble, isMine ? styles.myMessage : styles.theirMessage]}>
              {isAuditor && item.sender?.name && (
                <Text style={{ fontSize: 10, color: isMine ? '#E0E7FF' : '#94A3B8', marginBottom: 4, fontWeight: 'bold' }}>
                  {item.sender.name}
                </Text>
              )}
              
              {/* RENDERIZAÇÃO CONDICIONAL DE EVENTOS ESPECIAIS (NEGOCIAÇÃO, PROPOSTAS, RESERVAS) */}
              {item.type === 'NEGOTIATION_ROUND' ? (
                renderNegotiationRound(item, isMine, isAuditor)
              ) : item.type === 'OFFER_REQUEST' || item.type === 'OFFER_APPROVED' || item.type === 'OFFER_REJECTED' ? (
                <View>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { fontWeight: 'bold', marginBottom: 8 }]}>
                    🤝 Proposta de Compra
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                    Valor: R$ {item.metadata ? parseFloat(parseMeta(item.metadata)?.value).toLocaleString('pt-BR') : ''}
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { marginBottom: 12 }]}>
                    Pagamento: {item.metadata ? parseMeta(item.metadata)?.paymentMethod : ''}
                  </Text>
                  
                  {item.type === 'OFFER_APPROVED' && (
                    <Text style={{ color: isMine ? '#E0E7FF' : '#10B981', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>✅ Proposta Aceita</Text>
                  )}
                  {item.type === 'OFFER_REJECTED' && (
                    <Text style={{ color: isMine ? '#FECACA' : '#EF4444', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>❌ Proposta Recusada</Text>
                  )}

                  {/* 
                      BOTÕES DE AÇÃO INTERATIVA (ACEITAR/RECUSAR):
                      São exibidos de forma exclusiva no corpo do chat apenas para o Proprietário 
                      do imóvel, caso a proposta ainda esteja pendente (`OFFER_REQUEST`) e ele não 
                      esteja visualizando no modo de auditoria administrativa.
                  */}
                  {item.type === 'OFFER_REQUEST' && !isAuditor && canManage && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                        onPress={async () => {
                          const offerId = parseMeta(item.metadata)?.offerId;
                          try {
                            const res = await fetch(`${API_URL}/offers/${offerId}/approve`, {
                              method: 'PATCH',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (res.ok) {
                              Alert.alert('Sucesso', 'Proposta aceita com sucesso!');
                              setMessages(prev => prev.map(m => m.id === item.id ? { ...m, type: 'OFFER_APPROVED' } : m));
                            } else {
                              Alert.alert('Erro', 'Não foi possível aceitar a proposta.');
                            }
                          } catch (e) {
                            Alert.alert('Erro', 'Verifique sua conexão.');
                          }
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Aceitar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                        onPress={async () => {
                          const offerId = parseMeta(item.metadata)?.offerId;
                          try {
                            const res = await fetch(`${API_URL}/offers/${offerId}/reject`, {
                              method: 'PATCH',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (res.ok) {
                              Alert.alert('Sucesso', 'Proposta recusada.');
                              setMessages(prev => prev.map(m => m.id === item.id ? { ...m, type: 'OFFER_REJECTED' } : m));
                            } else {
                              Alert.alert('Erro', 'Não foi possível recusar a proposta.');
                            }
                          } catch (e) {
                            Alert.alert('Erro', 'Verifique sua conexão.');
                          }
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Recusar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : item.type === 'BOOKING_REQUEST' || item.type === 'BOOKING_APPROVED' || item.type === 'BOOKING_REJECTED' || item.type === 'BOOKING_CANCELLED' ? (
                <View>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { fontWeight: 'bold', marginBottom: 8 }]}>
                    📅 Solicitação de Reserva
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                    De: {item.metadata ? new Date(parseMeta(item.metadata)?.startDate).toLocaleDateString() : ''}
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { marginBottom: 12 }]}>
                    Até: {item.metadata ? new Date(parseMeta(item.metadata)?.endDate).toLocaleDateString() : ''}
                  </Text>
                  
                  {item.type === 'BOOKING_APPROVED' && (
                    <Text style={{ color: isMine ? '#E0E7FF' : '#10B981', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>✅ Reserva Aprovada</Text>
                  )}
                  {item.type === 'BOOKING_REJECTED' && (
                    <Text style={{ color: isMine ? '#FECACA' : '#EF4444', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>❌ Reserva Recusada</Text>
                  )}
                  {item.type === 'BOOKING_CANCELLED' && (
                    <Text style={{ color: isMine ? '#E0E7FF' : '#64748B', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>🚫 Reserva Cancelada</Text>
                  )}

                  {/* Se for o dono do imóvel e não for auditor, exibe os botões apenas se for PENDENTE */}
                  {item.type === 'BOOKING_REQUEST' && !isAuditor && canManage && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                        onPress={async () => {
                          const bookingId = parseMeta(item.metadata)?.bookingId;
                          try {
                            const res = await fetch(`${API_URL}/bookings/${bookingId}/approve`, {
                              method: 'PATCH',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (res.ok) {
                              Alert.alert('Sucesso', 'Reserva aprovada com sucesso!');
                              setMessages(prev => prev.map(m => m.id === item.id ? { ...m, type: 'BOOKING_APPROVED' } : m));
                            } else {
                              Alert.alert('Erro', 'Não foi possível aprovar a reserva.');
                            }
                          } catch (e) {
                            Alert.alert('Erro', 'Verifique sua conexão.');
                          }
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Aprovar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                        onPress={async () => {
                          const bookingId = parseMeta(item.metadata)?.bookingId;
                          try {
                            const res = await fetch(`${API_URL}/bookings/${bookingId}/reject`, {
                              method: 'PATCH',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (res.ok) {
                              Alert.alert('Sucesso', 'Reserva recusada.');
                              setMessages(prev => prev.map(m => m.id === item.id ? { ...m, type: 'BOOKING_REJECTED' } : m));
                            } else {
                              Alert.alert('Erro', 'Não foi possível recusar a reserva.');
                            }
                          } catch (e) {
                            Alert.alert('Erro', 'Verifique sua conexão.');
                          }
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>Recusar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                  {item.content}
                </Text>
              )}
            </View>
          );
        }}
      />

      {/* Input */}
      {isClosed ? (
        <View style={[styles.inputContainer, { justifyContent: 'center', paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={{ color: '#EF4444', fontWeight: 'bold' }}>Esta conversa foi encerrada pelo administrador.</Text>
        </View>
      ) : isParticipant ? (
        <View>
          {proposalDraft && (
            <View style={styles.proposalHint}>
              <Text style={styles.proposalHintText}>
                {proposalHintText}
              </Text>
              {isSale && (
                <View style={styles.paymentMethodsRow}>
                  {PAYMENT_METHODS.map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[styles.methodBadge, proposalDraft.paymentMethod === method && styles.methodBadgeSelected]}
                      onPress={() => setInput(`${proposalDraft.command} ${proposalDraft.valueText}${proposalDraft.valueText ? ' ' : ''}${method}`)}
                    >
                      <Text style={[styles.methodBadgeText, proposalDraft.paymentMethod === method && styles.methodBadgeTextSelected]}>
                        {method}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
          {matchingCommands.length > 0 && (
            <View style={styles.commandMenu}>
              {matchingCommands.map((command) => (
                <TouchableOpacity
                  key={command.trigger}
                  style={styles.commandMenuItem}
                  // Comando que precisa de valor ("/proposta 450000") preenche o campo em vez de
                  // enviar vazio — antes tocar em "/negociar" mandava sem valor e dava erro.
                  onPress={() => (command.argument ? setInput(`${command.trigger} `) : sendContent(command.trigger))}
                >
                  <Text style={styles.commandMenuTrigger}>{command.trigger}</Text>
                  <Text style={styles.commandMenuLabel}>{command.label}</Text>
                  <Text style={styles.commandMenuDescription} numberOfLines={1}>{command.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TextInput
              style={styles.input}
              placeholder="Digite sua mensagem..."
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
              <Ionicons name="send" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.inputContainer, { justifyContent: 'center', paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={{ color: '#94A3B8' }}>Você está visualizando no modo auditoria (Apenas leitura).</Text>
        </View>
      )}
      
      {/* Modal de Proposta */}
      <Modal visible={isOfferModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {counterTo
                ? 'Enviar contraproposta'
                : offerMode === 'sale'
                  ? 'Oferta de venda'
                  : offerMode === 'buy'
                    ? 'Comprar pelo valor anunciado'
                    : 'Negociar valor'}
            </Text>
            {counterTo && (
              <Text style={{ color: '#64748B', textAlign: 'center', marginBottom: 4 }}>
                Proposta atual: {formatBRL(counterTo.value)}{counterTo.unit === 'MONTHLY' ? '/mês' : ''}
              </Text>
            )}

            {offerMode === 'buy' && !counterTo ? (
              <>
                <Text style={styles.inputLabel}>Valor anunciado</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>
                  {formatBRL(Number(property?.price))}
                </Text>
                <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 12 }}>
                  O anunciante tem 48h para aceitar — se aceitar, o imóvel é marcado como vendido.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>
                  {property?.operationType === 'MONTHLY_RENT'
                    ? 'Aluguel mensal (R$)'
                    : property?.operationType === 'DAILY_RENT'
                      ? 'Valor total da reserva (R$)'
                      : 'Valor total (R$)'}
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ex: 350000"
                  keyboardType="numeric"
                  value={offerValue}
                  onChangeText={setOfferValue}
                />
                <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: -8, marginBottom: 12 }}>
                  A outra parte tem 48h para responder.
                </Text>
              </>
            )}

            {property?.operationType === 'SALE' && (
            <>
            <Text style={styles.inputLabel}>Forma de Pagamento</Text>
            <View style={styles.paymentMethodsRow}>
              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity 
                  key={method} 
                  style={[
                    styles.methodBadge, 
                    offerPaymentMethod === method && styles.methodBadgeSelected
                  ]}
                  onPress={() => setOfferPaymentMethod(method)}
                >
                  <Text style={[
                    styles.methodBadgeText,
                    offerPaymentMethod === method && styles.methodBadgeTextSelected
                  ]}>{method}</Text>
                </TouchableOpacity>
              ))}
            </View>
            </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: '#F1F5F9', flex: 1 }]} 
                onPress={() => setIsOfferModalVisible(false)}
                disabled={isSubmittingOffer}
              >
                <Text style={{ color: '#64748B', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: '#4F46E5', flex: 1.5 }]} 
                onPress={sendOffer}
                disabled={isSubmittingOffer}
              >
                {isSubmittingOffer ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>
                    {counterTo ? 'Enviar contraproposta' : offerMode === 'sale' ? 'Enviar oferta' : offerMode === 'buy' ? 'Confirmar compra' : 'Enviar proposta'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  propertyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  propertyImage: { width: 40, height: 40, borderRadius: 8, marginRight: 12 },
  propertyInfo: { flex: 1 },
  propertyTitle: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  propertyPrice: { fontSize: 12, color: '#4F46E5' },
  viewPropertyBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewPropertyText: { color: '#4F46E5', fontSize: 12, fontWeight: 'bold' },
  messageList: { padding: 16, paddingBottom: 32 },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  messageText: { fontSize: 14 },
  myMessageText: { color: 'white' },
  theirMessageText: { color: '#1E293B' },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposalHint: {
    backgroundColor: '#EEF2FF',
    borderTopWidth: 1,
    borderTopColor: '#E0E7FF',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  proposalHintText: { fontSize: 13, color: '#1E293B', marginBottom: 8 },
  commandMenu: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  commandMenuItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  commandMenuTrigger: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5',
  },
  commandMenuLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  commandMenuDescription: {
    flex: 1,
    fontSize: 12,
    color: '#94A3B8',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionBtnText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 20,
    textAlign: 'center'
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginTop: 12
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#0F172A',
    marginBottom: 16
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24
  },
  methodBadge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC'
  },
  methodBadgeSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF'
  },
  methodBadgeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500'
  },
  methodBadgeTextSelected: {
    color: '#4F46E5',
    fontWeight: '700'
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  modalBtn: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
