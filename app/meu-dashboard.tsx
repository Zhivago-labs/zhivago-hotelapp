import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, TouchableOpacity, Alert, TextInput } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { API_URL } from '@/config/api';
const screenWidth = Dimensions.get('window').width;

type ReceivedBooking = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  listing: { name: string; image: string; price: number };
  user: { name: string; avatar: string; email: string; phone: string };
};

export default function UserDashboardScreen() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingsData, setBookingsData] = useState<{bookings: ReceivedBooking[], totalPages: number, page: number, total: number}>({bookings: [], totalPages: 1, page: 1, total: 0});
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingBookings, setLoadingBookings] = useState(false);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_URL}/users/me/stats`, { headers: { Authorization: `Bearer ${token}` } });
      const statsData = await res.json();
      setStats(statsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    setLoadingBookings(true);
    try {
      const res = await fetch(`${API_URL}/users/me/received-bookings?page=${page}&search=${encodeURIComponent(searchQuery)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setBookingsData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBookings(false);
    }
  };

  const handleCancel = (bookingId: string) => {
    Alert.alert(
      'Cancelar Reserva',
      'Tem certeza que deseja cancelar esta reserva do seu imóvel?',
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

  useFocusEffect(useCallback(() => {
    loadStats();
  }, []));

  React.useEffect(() => {
    loadBookings();
  }, [page, searchQuery]);

  const handleSearch = () => {
    setPage(1);
    setSearchQuery(searchInput);
  };

  if (loading || !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff385c" />
      </View>
    );
  }

  // 1. Minhas Reservas (Gráfico de Linha)
  const labels = Object.keys(stats.bookingsByMonth || {}).sort();
  const bookingsChartData = labels.map(l => stats.bookingsByMonth[l]);
  
  const lineData = {
    labels: labels.length ? labels.map(l => l.split('-')[1] + '/' + l.split('-')[0].slice(2)) : ['Nenhum'],
    datasets: [{ data: bookingsChartData.length ? bookingsChartData : [0] }]
  };

  // 3. Receita Estimada (Gráfico de Linha Verde)
  const revenueData = labels.map(l => stats.revenueByMonth[l]);
  const revenueLineData = {
    labels: labels.length ? labels.map(l => l.split('-')[1] + '/' + l.split('-')[0].slice(2)) : ['Nenhum'],
    datasets: [{ data: revenueData.length ? revenueData : [0] }]
  };

  const chartConfig = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    color: (opacity = 1) => `rgba(255, 56, 92, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
    decimalPlaces: 0,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <Text style={styles.title}>Meu Dashboard</Text>
      
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.statusCounts?.approved || 0}</Text>
          <Text style={styles.statLabel}>Imóveis Ativos</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>R$ {(revenueData.reduce((a, b) => a + b, 0) || 0).toLocaleString('pt-BR')}</Text>
          <Text style={styles.statLabel}>Receita Total (6m)</Text>
        </View>
      </View>

      <Text style={styles.chartTitle}>Reservas Mensais</Text>
      <View style={styles.chartContainer}>
        <LineChart
          data={lineData}
          width={screenWidth > 600 ? 500 : screenWidth - 32}
          height={220}
          chartConfig={chartConfig}
          bezier
          style={{ borderRadius: 16 }}
        />
      </View>

      <Text style={styles.chartTitle}>Receita Estimada (R$)</Text>
      <View style={styles.chartContainer}>
        <LineChart
          data={revenueLineData}
          width={screenWidth > 600 ? 500 : screenWidth - 32}
          height={220}
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`, // Verde
          }}
          bezier
          style={{ borderRadius: 16 }}
        />
      </View>
      <Text style={styles.chartTitle}>Reservas Recebidas</Text>
      
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" />
        <TextInput 
          style={styles.searchInput} 
          placeholder="Buscar por hóspede ou imóvel..." 
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {loadingBookings ? (
        <ActivityIndicator size="small" color="#ff385c" style={{marginVertical: 20}} />
      ) : bookingsData.bookings.length === 0 ? (
        <Text style={{color: '#666', textAlign: 'center', marginVertical: 20}}>Nenhuma reserva encontrada.</Text>
      ) : (
        <>
          {bookingsData.bookings.map((item) => {
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
              <View key={item.id} style={styles.bookingCard}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10}}>
                  <Image source={{ uri: item.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.user.name)}&background=f0f0f0` }} style={{width: 40, height: 40, borderRadius: 20}} />
                  <View style={{flex: 1}}>
                    <Text style={{fontWeight: 'bold', fontSize: 16}}>{item.user.name}</Text>
                    <Text style={{color: '#666', fontSize: 13}}>{item.listing.name}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                    <Text style={[styles.statusText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                  </View>
                </View>
                
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={16} color="#666" />
                  <Text style={styles.dateText}>{formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>
                </View>

                {canCancel && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item.id)}>
                    <Text style={styles.cancelBtnText}>Cancelar Reserva</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          
          {bookingsData.totalPages > 1 && (
            <View style={styles.paginationContainer}>
              <TouchableOpacity 
                style={[styles.pageBtn, page === 1 && {opacity: 0.5}]} 
                disabled={page === 1}
                onPress={() => setPage(p => p - 1)}
              >
                <Ionicons name="chevron-back" size={20} color="#333" />
              </TouchableOpacity>
              <Text style={{fontWeight: 'bold', color: '#666'}}>Página {page} de {bookingsData.totalPages}</Text>
              <TouchableOpacity 
                style={[styles.pageBtn, page === bookingsData.totalPages && {opacity: 0.5}]} 
                disabled={page === bookingsData.totalPages}
                onPress={() => setPage(p => p + 1)}
              >
                <Ionicons name="chevron-forward" size={20} color="#333" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
  statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#ff385c' },
  statLabel: { fontSize: 13, color: '#666', marginTop: 4, fontWeight: '500', textAlign: 'center' },
  chartTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12, marginTop: 8 },
  chartContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  bookingCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 8, alignSelf: 'flex-start' },
  dateText: { fontSize: 13, color: '#333', marginLeft: 6, fontWeight: '500' },
  cancelBtn: { marginTop: 15, paddingVertical: 10, backgroundColor: '#ffebee', borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { color: '#d32f2f', fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: '#eee' },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#333' },
  paginationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, marginTop: 10, marginBottom: 20 },
  pageBtn: { padding: 10, backgroundColor: '#fff', borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
});
