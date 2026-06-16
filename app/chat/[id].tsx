import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Image, ActivityIndicator, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import io, { Socket } from 'socket.io-client';

import { API_URL } from '@/config/api';

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<any>(null);
  const [isParticipant, setIsParticipant] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isReported, setIsReported] = useState(false);

  // Estados da proposta de compra
  const [isOfferModalVisible, setIsOfferModalVisible] = useState(false);
  const [offerValue, setOfferValue] = useState('');
  const [offerPaymentMethod, setOfferPaymentMethod] = useState('À Vista');
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchMessagesAndConversation();
    markAsRead();

    // Setup Socket
    const socket = io(API_URL, {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('receiveMessage', (message: any) => {
      if (message.conversationId === id) {
        setMessages(prev => [...prev, message]);
        markAsRead();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [id, token]);

  const fetchMessagesAndConversation = async () => {
    try {
      // Usar a rota de conversa específica
      const convRes = await fetch(`${API_URL}/conversations/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (convRes.ok) {
        const currentConv = await convRes.json();
        setProperty(currentConv.property);
        setIsParticipant(currentConv.participants.some((p: any) => p.id === user?.id));
        setIsClosed(currentConv.isClosed);
        setIsReported(currentConv.isReported);
      }

      const msgRes = await fetch(`${API_URL}/conversations/${id}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (msgRes.ok) {
        const msgs = await msgRes.json();
        setMessages(msgs);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    try {
      await fetch(`${API_URL}/conversations/${id}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      // Ignorar
    }
  };

  const sendOffer = async () => {
    const rawVal = parseFloat(offerValue.replace(/[^0-9]/g, ''));
    if (isNaN(rawVal) || rawVal <= 0) {
      Alert.alert('Valor inválido', 'Digite um valor de proposta válido maior que zero.');
      return;
    }

    setIsSubmittingOffer(true);
    try {
      const res = await fetch(`${API_URL}/listings/${property.id}/offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          value: rawVal,
          paymentMethod: offerPaymentMethod
        })
      });

      if (res.ok) {
        Alert.alert('Sucesso', 'Sua proposta foi enviada!');
        setOfferValue('');
        setIsOfferModalVisible(false);
        fetchMessagesAndConversation();
      } else {
        const err = await res.json();
        Alert.alert('Erro', err.error || 'Não foi possível enviar a proposta.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Verifique sua conexão.');
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || isClosed) return;

    const content = input.trim();
    setInput('');

    socketRef.current.emit('sendMessage', { conversationId: id, content }, (response: any) => {
      if (response.error) {
        Alert.alert('Erro', response.error);
        return;
      }
      if (response.success) {
        setMessages(prev => [...prev, response.message]);
      }
    });
  };

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
          {property.category === 'venda' && property.status !== 'SOLD' && user?.id !== property.ownerId && isParticipant && !isClosed && (
            <TouchableOpacity 
              style={[styles.viewPropertyBtn, { backgroundColor: '#4F46E5', marginLeft: 8 }]}
              onPress={() => setIsOfferModalVisible(true)}
            >
              <Text style={[styles.viewPropertyText, { color: 'white' }]}>Proposta</Text>
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
          const isAuditor = !isParticipant && user?.role === 'ADMIN';
          // Para o admin, colocamos o dono do imóvel na direita e o locatário na esquerda
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
              {item.type === 'OFFER_REQUEST' || item.type === 'OFFER_APPROVED' || item.type === 'OFFER_REJECTED' ? (
                <View>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { fontWeight: 'bold', marginBottom: 8 }]}>
                    🤝 Proposta de Compra
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                    Valor: R$ {item.metadata ? parseFloat(JSON.parse(item.metadata).value).toLocaleString('pt-BR') : ''}
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { marginBottom: 12 }]}>
                    Pagamento: {item.metadata ? JSON.parse(item.metadata).paymentMethod : ''}
                  </Text>
                  
                  {item.type === 'OFFER_APPROVED' && (
                    <Text style={{ color: isMine ? '#E0E7FF' : '#10B981', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>✅ Proposta Aceita</Text>
                  )}
                  {item.type === 'OFFER_REJECTED' && (
                    <Text style={{ color: isMine ? '#FECACA' : '#EF4444', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>❌ Proposta Recusada</Text>
                  )}

                  {/* Se for o dono do imóvel e não for auditor, exibe os botões apenas se for PENDENTE */}
                  {item.type === 'OFFER_REQUEST' && !isAuditor && user?.id === property?.ownerId && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                        onPress={async () => {
                          const offerId = JSON.parse(item.metadata).offerId;
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
                          const offerId = JSON.parse(item.metadata).offerId;
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
              ) : item.type === 'BOOKING_REQUEST' || item.type === 'BOOKING_APPROVED' || item.type === 'BOOKING_REJECTED' ? (
                <View>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { fontWeight: 'bold', marginBottom: 8 }]}>
                    📅 Solicitação de Reserva
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                    De: {item.metadata ? new Date(JSON.parse(item.metadata).startDate).toLocaleDateString() : ''}
                  </Text>
                  <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText, { marginBottom: 12 }]}>
                    Até: {item.metadata ? new Date(JSON.parse(item.metadata).endDate).toLocaleDateString() : ''}
                  </Text>
                  
                  {item.type === 'BOOKING_APPROVED' && (
                    <Text style={{ color: isMine ? '#E0E7FF' : '#10B981', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>✅ Reserva Aprovada</Text>
                  )}
                  {item.type === 'BOOKING_REJECTED' && (
                    <Text style={{ color: isMine ? '#FECACA' : '#EF4444', fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>❌ Reserva Recusada</Text>
                  )}

                  {/* Se for o dono do imóvel e não for auditor, exibe os botões apenas se for PENDENTE */}
                  {item.type === 'BOOKING_REQUEST' && !isAuditor && user?.id === property?.ownerId && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity 
                        style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                        onPress={async () => {
                          const bookingId = JSON.parse(item.metadata).bookingId;
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
                          const bookingId = JSON.parse(item.metadata).bookingId;
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
      ) : (
        <View style={[styles.inputContainer, { justifyContent: 'center', paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={{ color: '#94A3B8' }}>Você está visualizando no modo auditoria (Apenas leitura).</Text>
        </View>
      )}
      
      {/* Modal de Proposta */}
      <Modal visible={isOfferModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enviar Proposta de Compra</Text>
            
            <Text style={styles.inputLabel}>Valor da Proposta (R$)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: 350000"
              keyboardType="numeric"
              value={offerValue}
              onChangeText={setOfferValue}
            />

            <Text style={styles.inputLabel}>Forma de Pagamento</Text>
            <View style={styles.paymentMethodsRow}>
              {['À Vista', 'Financiamento', 'Parcelado', 'Carta de Crédito'].map((method) => (
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
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>Enviar Proposta</Text>
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
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
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
