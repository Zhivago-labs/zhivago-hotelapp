import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, FlatList, ActivityIndicator, 
  TouchableOpacity, Image, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

import { API_URL } from '@/config/api';

type Booking = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  listing: {
    id: string;
    name: string;
    image: string;
    location: string;
    price: number;
  };
};

export default function MinhasViagensScreen() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const { token, user } = useAuth();
  const isFocused = useIsFocused();
  const router = useRouter();

  const loadBookings = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/me/bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBookings(data);
      }
    } catch (error) {
      console.error('Erro ao carregar viagens:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadBookings();
    }
  }, [isFocused, token]);

  const handleCancel = (bookingId: string) => {
    Alert.alert(
      'Cancelar Reserva',
      'Tem certeza que deseja cancelar esta reserva?',
      [
        { text: 'Não', style: 'cancel' },
        { 
          text: 'Sim, Cancelar', 
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/bookings/${bookingId}/cancel`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                Alert.alert('Sucesso', 'Reserva cancelada com sucesso.');
                loadBookings();
              } else {
                const err = await res.json();
                Alert.alert('Erro', err.error || 'Não foi possível cancelar.');
              }
            } catch (error) {
              Alert.alert('Erro', 'Falha na conexão.');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderBooking = ({ item }: { item: Booking }) => {
    const isPast = new Date(item.endDate) < new Date();
    
    const getStatusInfo = () => {
      if (item.status === 'CANCELLED') return { label: 'Cancelada', bg: '#f5f5f5', text: '#d32f2f' };
      if (item.status === 'REJECTED') return { label: 'Recusada', bg: '#f5f5f5', text: '#d32f2f' };
      if (item.status === 'PENDING') return { label: 'Pendente', bg: '#fff3e0', text: '#e65100' };
      if (isPast) return { label: 'Concluída', bg: '#f5f5f5', text: '#666' };
      return { label: 'Confirmada', bg: '#e8f5e9', text: '#2e7d32' };
    };

    const statusInfo = getStatusInfo();
    const canCancel = !isPast && (item.status === 'PENDING' || item.status === 'CONFIRMED');

    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push(`/imovel/${item.listing.id}` as never)}
      >
        <Image source={{ uri: item.listing.image }} style={styles.cardImage} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.name}</Text>
          <Text style={styles.cardLocation}>{item.listing.location}</Text>
          
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={16} color="#666" />
            <Text style={styles.dateText}>
              {formatDate(item.startDate)} - {formatDate(item.endDate)}
            </Text>
          </View>

          <View style={styles.bottomRow}>
            <Text style={styles.priceText}>
              R$ {item.listing.price.toLocaleString('pt-BR')} <Text style={{ fontSize: 12, fontWeight: 'normal', color: '#666' }}>/ noite</Text>
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <Text style={[styles.statusText, { color: statusInfo.text }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>

          {canCancel && (
            <TouchableOpacity 
              style={styles.cancelBtn}
              onPress={() => handleCancel(item.id)}
            >
              <Text style={styles.cancelBtnText}>Cancelar Reserva</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Minhas Viagens</Text>
        <Text style={styles.headerSubtitle}>Acompanhe o seu histórico de reservas</Text>
      </View>

      {loading && bookings.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ff385c" />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={renderBooking}
          contentContainerStyle={styles.listContainer}
          refreshing={loading}
          onRefresh={loadBookings}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="airplane-outline" size={60} color="#ddd" />
              <Text style={styles.emptyTitle}>Nenhuma viagem encontrada</Text>
              <Text style={styles.emptySubtitle}>Você ainda não possui reservas concluídas ou agendadas. Que tal explorar novos destinos?</Text>
              <TouchableOpacity style={styles.exploreBtn} onPress={() => router.push('/(tabs)/')}>
                <Text style={styles.exploreBtnText}>Explorar Destinos</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 60, 
    paddingBottom: 20, 
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: '#666' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { padding: 15, paddingBottom: 100 },
  
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 3,
    boxShadow: '0px 2px 10px rgba(0,0,0,0.08)'
  },
  cardImage: { width: '100%', height: 160 },
  cardInfo: { padding: 15 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  cardLocation: { fontSize: 14, color: '#666', marginBottom: 12 },
  
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 15 },
  dateText: { fontSize: 13, color: '#333', marginLeft: 6, fontWeight: '500' },
  
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 12 },
  priceText: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeActive: { backgroundColor: '#e8f5e9' },
  statusBadgePast: { backgroundColor: '#f5f5f5' },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  statusTextActive: { color: '#2e7d32' },
  statusTextPast: { color: '#666' },

  cancelBtn: { marginTop: 15, paddingVertical: 10, backgroundColor: '#ffebee', borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { color: '#d32f2f', fontWeight: 'bold' },

  emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 25 },
  exploreBtn: { backgroundColor: '#ff385c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25 },
  exploreBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
