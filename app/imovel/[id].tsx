import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform, Linking, TextInput, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, LocaleConfig } from 'react-native-calendars';

// Configuração pt-br do Calendário
LocaleConfig.locales['pt-br'] = {
  monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  monthNamesShort: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
  dayNames: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
  dayNamesShort: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
  today: 'Hoje'
};
LocaleConfig.defaultLocale = 'pt-br';

import { API_URL } from '@/config/api';

interface ListingDetail {
  id: string;
  name: string;
  description?: string;
  price: number;
  type: string;
  category: string;
  status: string;
  billingCycle?: string;
  image: string;
  location: string;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  owner?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
  };
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Estados de Reserva
  const [bookedDates, setBookedDates] = useState<Record<string, any>>({});
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Estados de Avaliação
  const [reviews, setReviews] = useState<any[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Estado do Modal do WhatsApp
  const [isWhatsAppModalVisible, setIsWhatsAppModalVisible] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/listings/${id}`);
        if (!response.ok) throw new Error('Não foi possível buscar os dados do imóvel.');
        const data = await response.json();
        setListing(data);

        // Se for aluguel, buscar reservas e avaliações
        if (data.category === 'aluguel') {
          fetchExtras(data.id);
        }
      } catch (error) {
        Alert.alert('Erro', 'Ocorreu um erro ao carregar os detalhes.');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
  }, [id]);

  const fetchExtras = async (listingId: string) => {
    try {
      const [bookingsRes, reviewsRes] = await Promise.all([
        fetch(`${API_URL}/listings/${listingId}/bookings`),
        fetch(`${API_URL}/listings/${listingId}/reviews`)
      ]);
      
      if (bookingsRes.ok) {
        const bData = await bookingsRes.json();
        const marks: any = {};
        bData.forEach((b: any) => {
          let start = new Date(b.startDate);
          let end = new Date(b.endDate);
          for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateString = d.toISOString().split('T')[0];
            marks[dateString] = { disabled: true, disableTouchEvent: true, color: '#ffaaaa', textColor: 'white' };
          }
        });
        setBookedDates(marks);
      }

      if (reviewsRes.ok) {
        const rData = await reviewsRes.json();
        setReviews(rData);
      }
    } catch(e) {
      console.error(e);
    }
  };

  if (loading || !listing) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#ff385c" />
      </View>
    );
  }


  const handleContactOrBook = async () => {
    setIsWhatsAppModalVisible(true);
  };

  const openWhatsApp = (start?: string, end?: string) => {
    if (!listing.owner?.phone) {
      Alert.alert('Aviso', 'Este anunciante não possui número de WhatsApp cadastrado.');
      return;
    }
    const phoneNum = listing.owner.phone.replace(/\D/g, '');
    let message = `Olá ${listing.owner.name}, tenho interesse no imóvel "${listing.name}"!`;
    
    if (start) {
      const formatDate = (ds: string) => ds.split('-').reverse().join('/');
      message = `Olá ${listing.owner.name}, fiz uma reserva para o imóvel "${listing.name}" pelo app!\nPeríodo: ${formatDate(start)} até ${formatDate(end || start)}. Como procedemos com o pagamento?`;
    }

    const url = `whatsapp://send?phone=55${phoneNum}&text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url);
      else Linking.openURL(`https://wa.me/55${phoneNum}?text=${encodeURIComponent(message)}`);
    });
  };

  const handleInAppChat = async () => {
    if (!token) {
      Alert.alert('Acesso negado', 'Você precisa fazer login para usar o chat.');
      return;
    }
    if (user?.id === listing?.owner?.id) {
      Alert.alert('Atenção', 'Você não pode iniciar um chat consigo mesmo.');
      return;
    }

    if (listing?.category === 'aluguel') {
      if (!selectedStartDate) {
        Alert.alert('Atenção', 'Selecione pelo menos uma data no calendário para reservar e iniciar o chat.');
        return;
      }

      const endDate = selectedEndDate || selectedStartDate;
      setIsBooking(true);

      try {
        const res = await fetch(`${API_URL}/listings/${id}/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            startDate: new Date(selectedStartDate).toISOString(),
            endDate: new Date(endDate).toISOString(),
          })
        });

        if (res.ok) {
          const data = await res.json();
          Alert.alert('Solicitação Enviada!', 'O proprietário recebeu seu pedido de reserva. Você pode acompanhar pelo chat.');
          fetchExtras(listing.id); // Atualiza calendário
          setSelectedStartDate(null);
          setSelectedEndDate(null);
          
          if (data.conversationId) {
            router.push(`/chat/${data.conversationId}`);
          }
        } else {
          const err = await res.json();
          Alert.alert('Erro', err.error || 'Não foi possível reservar.');
        }
      } catch {
        Alert.alert('Erro', 'Verifique sua conexão.');
      } finally {
        setIsBooking(false);
      }
    } else {
      // Se for apenas venda, apenas inicia a conversa normalmente
      try {
        const res = await fetch(`${API_URL}/conversations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ listingId: id })
        });

        if (res.ok) {
          const conv = await res.json();
          router.push(`/chat/${conv.id}`);
        } else {
          const err = await res.json();
          Alert.alert('Erro', err.message || 'Não foi possível iniciar o chat.');
        }
      } catch (e) {
        Alert.alert('Erro', 'Verifique sua conexão.');
      }
    }
  };

  // CALENDÁRIO LOGIC
  const onDayPress = (day: any) => {
    const dateString = day.dateString;
    if (bookedDates[dateString]) return; // Disabled

    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
      setSelectedStartDate(dateString);
      setSelectedEndDate(null);
    } else {
      if (new Date(dateString) < new Date(selectedStartDate)) {
        setSelectedStartDate(dateString);
      } else {
        // Valida se há bloqueio no meio
        let start = new Date(selectedStartDate);
        let end = new Date(dateString);
        let hasBlocked = false;
        for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          if (bookedDates[d.toISOString().split('T')[0]]) {
            hasBlocked = true;
            break;
          }
        }
        if (hasBlocked) {
          Alert.alert('Período Inválido', 'Há dias já reservados neste intervalo.');
          setSelectedStartDate(dateString);
          setSelectedEndDate(null);
        } else {
          setSelectedEndDate(dateString);
        }
      }
    }
  };

  const getMarkedDates = () => {
    const marks = { ...bookedDates };
    if (selectedStartDate) {
      marks[selectedStartDate] = { ...marks[selectedStartDate], startingDay: true, color: '#ff385c', textColor: 'white' };
      if (selectedEndDate) {
        let start = new Date(selectedStartDate);
        let end = new Date(selectedEndDate);
        for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const ds = d.toISOString().split('T')[0];
          if (ds === selectedStartDate) continue;
          if (ds === selectedEndDate) {
            marks[ds] = { endingDay: true, color: '#ff385c', textColor: 'white' };
          } else {
            marks[ds] = { color: '#ffc1cc', textColor: 'white' };
          }
        }
      }
    }
    return marks;
  };

  // REVIEWS LOGIC
  const submitReview = async () => {
    if (!token) return Alert.alert('Aviso', 'Faça login para avaliar.');
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`${API_URL}/listings/${id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment })
      });
      if (res.ok) {
        Alert.alert('Sucesso', 'Avaliação enviada!');
        setComment('');
        setRating(5);
        fetchExtras(listing.id);
      } else {
        const err = await res.json();
        Alert.alert('Erro', err.error || 'Erro ao enviar.');
      }
    } catch {
      Alert.alert('Erro', 'Falha na conexão.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 120 }}>
        <Image source={{ uri: listing.image }} style={styles.coverImage} contentFit="cover" />

        <View style={styles.content}>
          <Text style={styles.title}>{listing.name}</Text>
          <Text style={styles.location}><Ionicons name="location-outline" size={16} /> {listing.location}</Text>

          <View style={styles.divider} />

          {/* Anfitrião */}
          {listing.owner && (
            <TouchableOpacity 
              style={styles.ownerCard} 
              onPress={() => router.push(`/perfil/${listing.owner?.id}` as never)}
              activeOpacity={0.7}
            >
              <View style={styles.ownerAvatar}>
                <Image 
                  source={listing.owner.avatar ? { uri: listing.owner.avatar } : { uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(listing.owner.name)}&background=f0f0f0` }} 
                  style={styles.avatarImage} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerName}>Anunciado por {listing.owner.name}</Text>
                <Text style={styles.ownerContact}>Ver perfil completo</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          {/* Características */}
          <Text style={styles.sectionTitle}>Características</Text>
          <View style={styles.amenitiesContainer}>
            <View style={styles.amenityBox}><Ionicons name="bed-outline" size={24} color="#333" /><Text>{listing.bedrooms} Quartos</Text></View>
            <View style={styles.amenityBox}><Ionicons name="water-outline" size={24} color="#333" /><Text>{listing.bathrooms} Banh.</Text></View>
            <View style={styles.amenityBox}><Ionicons name="car-outline" size={24} color="#333" /><Text>{listing.parking} Vagas</Text></View>
            <View style={styles.amenityBox}><Ionicons name={listing.type === 'casa' ? 'home-outline' : 'business-outline'} size={24} color="#333" /><Text>{listing.type === 'casa' ? 'Casa' : 'Apto'}</Text></View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Sobre o espaço</Text>
          <Text style={styles.description}>{listing.description || 'Nenhuma descrição fornecida.'}</Text>

          {/* SÓ PARA ALUGUEL: CALENDÁRIO E AVALIAÇÕES */}
          {listing.category === 'aluguel' && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Disponibilidade e Reservas</Text>
              <Text style={{color: '#666', marginBottom: 15}}>Selecione a data de chegada e partida no calendário abaixo:</Text>
              
              <Calendar
                markingType={'period'}
                minDate={new Date().toISOString().split('T')[0]}
                markedDates={getMarkedDates()}
                onDayPress={onDayPress}
                theme={{
                  todayTextColor: '#ff385c',
                  arrowColor: '#ff385c',
                }}
              />

              <View style={styles.divider} />
              
              <Text style={styles.sectionTitle}>Avaliações ({reviews.length})</Text>
              
              {/* Escrever Avaliação */}
              {user && (
                <View style={styles.reviewForm}>
                  <Text style={{fontWeight: 'bold', marginBottom: 10}}>Sua Avaliação:</Text>
                  <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
                    {[1,2,3,4,5].map(star => (
                      <TouchableOpacity key={star} onPress={() => setRating(star)}>
                        <Ionicons name={star <= rating ? "star" : "star-outline"} size={30} color="#f59e0b" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput 
                    style={styles.reviewInput} 
                    placeholder="Deixe um comentário..." 
                    value={comment} 
                    onChangeText={setComment} 
                    multiline
                  />
                  <TouchableOpacity style={styles.reviewBtn} onPress={submitReview} disabled={isSubmittingReview}>
                    {isSubmittingReview ? <ActivityIndicator color="#fff"/> : <Text style={{color: '#fff', fontWeight: 'bold'}}>Enviar Avaliação</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {/* Lista de Avaliações */}
              {reviews.map(rev => (
                <View key={rev.id} style={styles.reviewItem}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5}}>
                    <Image source={rev.user.avatar ? {uri: rev.user.avatar} : {uri: `https://ui-avatars.com/api/?name=${rev.user.name}`}} style={{width: 30, height: 30, borderRadius: 15}}/>
                    <Text style={{fontWeight: 'bold'}}>{rev.user.name}</Text>
                    <View style={{flexDirection: 'row', marginLeft: 'auto'}}>
                      {[...Array(rev.rating)].map((_, i) => <Ionicons key={i} name="star" size={14} color="#f59e0b" />)}
                    </View>
                  </View>
                  {rev.comment ? <Text style={{color: '#444'}}>{rev.comment}</Text> : null}
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* Footer Flutuante */}
      <View style={[styles.footer, { bottom: Math.max(insets.bottom, 16) }]}>
        <View style={{ flex: 0.7 }}>
          <Text style={styles.priceValue} numberOfLines={1} adjustsFontSizeToFit>R$ {listing.price.toLocaleString('pt-BR')}</Text>
          <Text style={styles.priceSuffix}>{listing.category === 'aluguel' ? `/ ${listing.billingCycle || 'noite'}` : 'venda'}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flex: 1.3, justifyContent: 'flex-end' }}>
          <TouchableOpacity 
            style={[
              styles.contactButton, 
              styles.whatsappButton,
              (!listing.owner?.phone) && { backgroundColor: '#ccc' }, 
              { width: 48, height: 48, paddingHorizontal: 0, justifyContent: 'center', alignItems: 'center' }
            ]} 
            onPress={handleContactOrBook}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-whatsapp" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.contactButton, 
              (listing.category === 'aluguel' && !selectedStartDate) && { backgroundColor: '#ccc' },
              listing.status === 'SOLD' && { backgroundColor: '#64748B' },
              { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48 }
            ]} 
            onPress={handleInAppChat}
            disabled={isBooking}
            activeOpacity={0.7}
          >
            {isBooking ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={listing.category === 'aluguel' ? "calendar" : "chatbubbles"} size={20} color="#fff" />
                <Text style={styles.contactButtonText} numberOfLines={1}>
                  {listing.category === 'aluguel' ? 'Solicitar' : (listing.status === 'SOLD' ? 'Chat (Vendido)' : 'Chat')}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal WhatsApp */}
      <Modal visible={isWhatsAppModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10}}>
              <Ionicons name="warning" size={28} color="#f59e0b" />
              <Text style={{fontSize: 18, fontWeight: 'bold', flex: 1, color: '#1a1a1a'}}>ATENÇÃO</Text>
            </View>
            <Text style={styles.modalText}>
              Você está deixando um ambiente protegido e monitorado.{'\n\n'}
              A partir deste momento, não podemos mais garantir a integridade, a confidencialidade e a segurança dos seus dados, nem assegurar a estabilidade e a proteção da hospedagem utilizada.{'\n\n'}
              Qualquer informação transmitida ou armazenada fora deste ambiente poderá estar sujeita a riscos, incluindo acesso não autorizado, perda de dados, indisponibilidade do serviço e exposição de informações sensíveis.{'\n\n'}
              Recomendamos que prossiga apenas se estiver ciente e de acordo com esses riscos.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#eee', flex: 1}]} onPress={() => setIsWhatsAppModalVisible(false)}>
                <Text style={{fontWeight: 'bold', color: '#333'}}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#25D366', flex: 1.2}]} onPress={() => {
                setIsWhatsAppModalVisible(false);
                openWhatsApp(selectedStartDate || undefined, selectedEndDate || undefined);
              }}>
                <Text style={{color: '#fff', fontWeight: 'bold', textAlign: 'center'}}>Concordar e Ir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#fff' },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 20 },
  coverImage: { width: '100%', height: 300 },
  content: { padding: 20 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 24, fontWeight: '800', flex: 1, color: '#1a1a1a', lineHeight: 30 },
  location: { fontSize: 14, color: '#666', marginTop: 8 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 24 },
  ownerCard: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  ownerAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  ownerName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  ownerContact: { fontSize: 13, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  amenitiesContainer: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  amenityBox: { width: '47%', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, alignItems: 'center', gap: 8 },
  amenityLabel: { fontSize: 14, fontWeight: '600', color: '#444' },
  description: { fontSize: 15, lineHeight: 24, color: '#444' },
  footer: { position: 'absolute', left: 16, right: 16, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 15 },
  priceValue: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  priceSuffix: { fontSize: 12, color: '#666', marginTop: -2 },
  contactButton: { backgroundColor: '#ff385c', borderRadius: 24 },
  contactButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  whatsappButton: { backgroundColor: '#25D366' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10 },
  modalText: { fontSize: 14, color: '#444', lineHeight: 22, textAlign: 'justify', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  modalBtn: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  adminActionsRow: { flexDirection: 'row', gap: 10 },
  adminBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  approveBtn: { backgroundColor: '#22c55e' },
  rejectBtn: { backgroundColor: '#f59e0b' },
  deleteBtn: { borderWidth: 1.5, borderColor: '#ef4444' },
  reviewForm: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 12, marginBottom: 20 },
  reviewInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, height: 80, textAlignVertical: 'top', marginBottom: 10 },
  reviewBtn: { backgroundColor: '#1a1a1a', padding: 12, borderRadius: 8, alignItems: 'center' },
  reviewItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }
});
