import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, RefreshControl, Image, TextInput, Platform, Dimensions
} from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

import { API_URL } from '@/config/api';
import type { ListingImage } from '@zhivago/shared';

interface AdminListing {
  id: string;
  name: string;
  location: string;
  price: number;
  category: string;
  status: string;
  images: ListingImage[];
  owner?: {
    name: string;
    email: string;
  };
  createdAt: string;
}

interface AdminAgencyUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  creci: string | null;
  document: string | null;
  verified: boolean;
  createdAt: string;
}

interface AdminBooking {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  listing: { id: string; name: string };
  user: { id: string; name: string; email: string };
}

interface AdminOffer {
  id: string;
  value: number;
  paymentMethod: string;
  status: string;
  listing: { id: string; name: string };
  buyer: { id: string; name: string; email: string };
}

interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  listing: { id: string; name: string };
  user: { id: string; name: string; email: string };
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  APPROVED: { label: 'Aprovado', color: '#22c55e' },
  PENDING:  { label: 'Pendente', color: '#f59e0b' },
  REJECTED: { label: 'Rejeitado', color: '#ef4444' },
};

const BOOKING_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: '#f59e0b' },
  CONFIRMED: { label: 'Confirmada', color: '#22c55e' },
  CANCELLED: { label: 'Cancelada', color: '#999' },
  REJECTED: { label: 'Rejeitada', color: '#ef4444' },
};

const OFFER_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: '#f59e0b' },
  ACCEPTED: { label: 'Aceita', color: '#22c55e' },
  REJECTED: { label: 'Recusada', color: '#ef4444' },
  CANCELLED: { label: 'Cancelada', color: '#999' },
};

const VERIFIED_LABEL: Record<string, { label: string; color: string }> = {
  false: { label: 'Pendente', color: '#f59e0b' },
  true:  { label: 'Verificada', color: '#22c55e' },
};

export default function AdminPanelScreen() {
  const { token, user } = useAuth();
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('PENDING'); // PENDING, APPROVED, REJECTED, ALL
  const [viewMode, setViewMode] = useState<'MODERATION' | 'DASHBOARD' | 'AGENCIES' | 'BOOKINGS' | 'OFFERS' | 'REVIEWS'>('MODERATION');
  const [stats, setStats] = useState<any>(null);
  const [agencies, setAgencies] = useState<AdminAgencyUser[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<'false' | 'true' | 'ALL'>('false');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [bookingFilter, setBookingFilter] = useState<string>('PENDING');
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [offerFilter, setOfferFilter] = useState<string>('PENDING');
  const [reviews, setReviews] = useState<AdminReview[]>([]);

  const screenWidth = Dimensions.get('window').width;

  const loadListings = async () => {
    if (user?.role !== 'ADMIN') return;
    setLoading(true);
    try {
      const statusQuery = filter !== 'ALL' ? `?status=${filter}` : '';
      const res = await fetch(`${API_URL}/admin/listings${statusQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setListings(Array.isArray(data.listings) ? data.listings : []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar os anúncios.');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (user?.role !== 'ADMIN') return;
    try {
      const res = await fetch(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStats(data);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as estatísticas.');
    }
  };

  const loadAgencies = async () => {
    if (user?.role !== 'ADMIN') return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ accountType: 'AGENCY' });
      if (agencyFilter !== 'ALL') params.set('verified', agencyFilter);
      const res = await fetch(`${API_URL}/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAgencies(Array.isArray(data.users) ? data.users : []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as imobiliárias.');
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    if (user?.role !== 'ADMIN') return;
    setLoading(true);
    try {
      const statusQuery = bookingFilter !== 'ALL' ? `?status=${bookingFilter}` : '';
      const res = await fetch(`${API_URL}/admin/bookings${statusQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as reservas.');
    } finally {
      setLoading(false);
    }
  };

  const loadOffers = async () => {
    if (user?.role !== 'ADMIN') return;
    setLoading(true);
    try {
      const statusQuery = offerFilter !== 'ALL' ? `?status=${offerFilter}` : '';
      const res = await fetch(`${API_URL}/admin/offers${statusQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setOffers(Array.isArray(data.offers) ? data.offers : []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as propostas.');
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    if (user?.role !== 'ADMIN') return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/reviews`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as avaliações.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    if (viewMode === 'MODERATION') loadListings();
    else if (viewMode === 'AGENCIES') loadAgencies();
    else if (viewMode === 'BOOKINGS') loadBookings();
    else if (viewMode === 'OFFERS') loadOffers();
    else if (viewMode === 'REVIEWS') loadReviews();
    else loadStats();
  }, [viewMode, filter, agencyFilter, bookingFilter, offerFilter]));

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/listings/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        Alert.alert('Sucesso', 'Anúncio aprovado.');
        loadListings();
      } else {
        Alert.alert('Erro', 'Não foi possível aprovar o anúncio.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    }
  };

  const submitReject = async (id: string, reason: string) => {
    if (!reason || reason.length < 5) {
      Alert.alert('Erro', 'O motivo deve ter pelo menos 5 caracteres.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/admin/listings/${id}/reject`, {
        method: 'PATCH',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        Alert.alert('Sucesso', 'Anúncio rejeitado.');
        loadListings();
      } else {
        Alert.alert('Erro', 'Não foi possível rejeitar o anúncio.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    }
  };

  const handlePending = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/listings/${id}/pending`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        Alert.alert('Sucesso', 'Anúncio movido para pendente.');
        loadListings();
      } else {
        Alert.alert('Erro', 'Não foi possível alterar o status.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    }
  };

  const submitVerify = async (id: string, verified: boolean) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}/verify`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verified }),
      });
      if (res.ok) {
        Alert.alert('Sucesso', verified ? 'Imobiliária verificada.' : 'Verificação removida.');
        loadAgencies();
      } else {
        Alert.alert('Erro', 'Não foi possível atualizar a verificação.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    }
  };

  const submitForceCancelBooking = async (id: string, reason: string) => {
    if (!reason || reason.length < 5) {
      Alert.alert('Erro', 'O motivo deve ter pelo menos 5 caracteres.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/admin/bookings/${id}/force-cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        Alert.alert('Sucesso', 'Reserva cancelada.');
        loadBookings();
      } else {
        Alert.alert('Erro', 'Não foi possível cancelar a reserva.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    }
  };

  const handleForceCancelBooking = (id: string) => {
    if (Platform.OS === 'web') {
      const reason = window.prompt('Motivo do cancelamento (mín. 5 caracteres):');
      if (reason) submitForceCancelBooking(id, reason);
    } else {
      Alert.prompt(
        'Cancelar Reserva',
        'Informe o motivo do cancelamento:',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Confirmar', style: 'destructive', onPress: (reason?: string) => submitForceCancelBooking(id, reason ?? '') },
        ]
      );
    }
  };

  const submitDeleteReview = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/reviews/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 204) {
        Alert.alert('Sucesso', 'Avaliação removida.');
        loadReviews();
      } else {
        Alert.alert('Erro', 'Não foi possível remover a avaliação.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    }
  };

  const handleDeleteReview = (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('Remover esta avaliação definitivamente?')) submitDeleteReview(id);
    } else {
      Alert.alert(
        'Remover Avaliação',
        'Remover esta avaliação definitivamente?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Remover', style: 'destructive', onPress: () => submitDeleteReview(id) },
        ]
      );
    }
  };

  const handleChangeStatus = (id: string) => {
    if (Platform.OS === 'web') {
      const status = window.prompt('Digite o número do novo status:\n1 - Aprovado\n2 - Rejeitado\n3 - Pendente');
      if (status === '1') handleApprove(id);
      else if (status === '2') {
        const reason = window.prompt('Informe o motivo da rejeição (mín. 5 caracteres):');
        if (reason) submitReject(id, reason);
      }
      else if (status === '3') handlePending(id);
    } else {
      Alert.alert(
        'Alterar Status',
        'Selecione o novo status do anúncio:',
        [
          { text: 'Aprovar', onPress: () => handleApprove(id) },
          { text: 'Rejeitar', onPress: () => {
              Alert.prompt(
                'Rejeitar Anúncio',
                'Informe o motivo:',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Rejeitar', style: 'destructive', onPress: (reason?: string) => submitReject(id, reason ?? '') },
                ]
              );
            } 
          },
          { text: 'Pendente', onPress: () => handlePending(id) },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
    }
  };

  const submitDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/listings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 204) {
        Alert.alert('Sucesso', 'Anúncio removido com sucesso.');
        loadListings();
      } else {
        Alert.alert('Erro', 'Não foi possível remover o anúncio.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    }
  };

  const handleDelete = (id: string) => {
    if (Platform.OS === 'web') {
      const confirmDelete = window.confirm('Tem certeza que deseja remover este anúncio definitivamente?');
      if (confirmDelete) {
        submitDelete(id);
      }
    } else {
      Alert.alert(
        'Remover Anúncio',
        'Tem certeza que deseja remover este anúncio definitivamente?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Remover', style: 'destructive', onPress: () => submitDelete(id) },
        ]
      );
    }
  };

  const router = useRouter();

  const renderItem = ({ item }: { item: AdminListing }) => {
    const statusInfo = STATUS_LABEL[item.status] ?? { label: item.status, color: '#999' };

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => router.push(`/imovel/${item.id}` as never)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item.images?.[0]?.url }} style={styles.cardImage} />

        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '22' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardLocation}>{item.location}</Text>
          <Text style={styles.ownerText}>
            Por: {item.owner?.name} ({item.owner?.email})
          </Text>

          <View style={styles.cardFooter}>
            <Text style={styles.price}>
              R$ {item.price.toLocaleString('pt-BR')}
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => handleChangeStatus(item.id)}
              >
                <Ionicons name="pencil-outline" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item.id)}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDashboard = () => {
    if (!stats) return <ActivityIndicator style={{ marginTop: 50 }} color="#ff385c" size="large" />;

    const pieData = [
      { name: 'Aprovados', population: stats.listingsStatus?.approved || 0, color: '#22c55e', legendFontColor: '#333' },
      { name: 'Pendentes', population: stats.listingsStatus?.pending || 0, color: '#f59e0b', legendFontColor: '#333' },
      { name: 'Rejeitados', population: stats.listingsStatus?.rejected || 0, color: '#ef4444', legendFontColor: '#333' },
    ];

    const labels = Object.keys(stats.bookingsByMonth || {}).sort();
    const data = labels.map(l => stats.bookingsByMonth[l]);

    const lineData = {
      labels: labels.length ? labels.map(l => l.split('-')[1] + '/' + l.split('-')[0].slice(2)) : ['Nenhum'],
      datasets: [{ data: data.length ? data : [0] }]
    };

    const chartConfig = {
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#fff',
      color: (opacity = 1) => `rgba(255, 56, 92, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
      decimalPlaces: 0,
    };

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text style={styles.sectionTitle}>Visão Global</Text>
        
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.totalUsers}</Text>
            <Text style={styles.statLabel}>Usuários</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.totalListings}</Text>
            <Text style={styles.statLabel}>Imóveis</Text>
          </View>
        </View>

        <Text style={styles.chartTitle}>Status dos Imóveis</Text>
        <View style={styles.chartContainer}>
          <PieChart
            data={pieData}
            width={screenWidth - 32}
            height={200}
            chartConfig={chartConfig}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"15"}
            absolute
          />
        </View>

        <Text style={styles.chartTitle}>Crescimento de Reservas</Text>
        <View style={styles.chartContainer}>
          <LineChart
            data={lineData}
            width={screenWidth - 32}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={{ borderRadius: 16 }}
          />
        </View>
      </ScrollView>
    );
  };

  const renderAgencies = () => (
    <>
      <View style={styles.filters}>
        {(['false', 'true', 'ALL'] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.filterBtn, agencyFilter === v && styles.filterBtnActive]}
            onPress={() => setAgencyFilter(v)}
          >
            <Text style={[styles.filterText, agencyFilter === v && styles.filterTextActive]}>
              {v === 'ALL' ? 'Todas' : VERIFIED_LABEL[v]?.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={agencies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAgencies} tintColor="#ff385c" />}
        renderItem={({ item }) => {
          const verifiedInfo = VERIFIED_LABEL[String(item.verified)];
          return (
            <View style={styles.agencyCard}>
              <View style={[styles.statusBadge, { backgroundColor: verifiedInfo.color + '22', position: 'relative', top: 0, right: 0, alignSelf: 'flex-start' }]}>
                <View style={[styles.statusDot, { backgroundColor: verifiedInfo.color }]} />
                <Text style={[styles.statusText, { color: verifiedInfo.color }]}>{verifiedInfo.label}</Text>
              </View>

              <Text style={styles.cardName}>{item.companyName || item.name}</Text>
              {item.companyName && <Text style={styles.agencyResponsible}>Responsável: {item.name}</Text>}
              <Text style={styles.agencyDetail}>{item.email}</Text>
              {item.phone && <Text style={styles.agencyDetail}>{item.phone}</Text>}
              {item.document && <Text style={styles.agencyDetail}>CNPJ/CPF: {item.document}</Text>}
              {item.creci && <Text style={styles.agencyDetail}>CRECI: {item.creci}</Text>}

              <View style={styles.agencyActions}>
                {!item.verified ? (
                  <TouchableOpacity style={styles.verifyBtn} onPress={() => submitVerify(item.id, true)}>
                    <Text style={styles.verifyBtnText}>Verificar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.unverifyBtn} onPress={() => submitVerify(item.id, false)}>
                    <Text style={styles.unverifyBtnText}>Remover verificação</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={60} color="#ddd" />
              <Text style={styles.emptyTitle}>Nenhuma imobiliária encontrada</Text>
            </View>
          ) : null
        }
      />
    </>
  );

  const renderBookings = () => (
    <>
      <View style={styles.filters}>
        {['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'ALL'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterBtn, bookingFilter === status && styles.filterBtnActive]}
            onPress={() => setBookingFilter(status)}
          >
            <Text style={[styles.filterText, bookingFilter === status && styles.filterTextActive]}>
              {status === 'ALL' ? 'Todas' : BOOKING_STATUS_LABEL[status]?.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadBookings} tintColor="#ff385c" />}
        renderItem={({ item }) => {
          const statusInfo = BOOKING_STATUS_LABEL[item.status] ?? { label: item.status, color: '#999' };
          const canForceCancel = item.status === 'PENDING' || item.status === 'CONFIRMED';
          return (
            <View style={styles.agencyCard}>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '22', position: 'relative', top: 0, right: 0, alignSelf: 'flex-start' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              </View>

              <Text style={styles.cardName}>{item.listing.name}</Text>
              <Text style={styles.agencyDetail}>Hóspede: {item.user.name} ({item.user.email})</Text>
              <Text style={styles.agencyDetail}>
                {new Date(item.startDate).toLocaleDateString('pt-BR')} → {new Date(item.endDate).toLocaleDateString('pt-BR')}
              </Text>

              {canForceCancel && (
                <View style={styles.agencyActions}>
                  <TouchableOpacity style={styles.unverifyBtn} onPress={() => handleForceCancelBooking(item.id)}>
                    <Text style={styles.unverifyBtnText}>Cancelar (admin)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={60} color="#ddd" />
              <Text style={styles.emptyTitle}>Nenhuma reserva encontrada</Text>
            </View>
          ) : null
        }
      />
    </>
  );

  const renderOffers = () => (
    <>
      <View style={styles.filters}>
        {['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'ALL'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterBtn, offerFilter === status && styles.filterBtnActive]}
            onPress={() => setOfferFilter(status)}
          >
            <Text style={[styles.filterText, offerFilter === status && styles.filterTextActive]}>
              {status === 'ALL' ? 'Todas' : OFFER_STATUS_LABEL[status]?.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={offers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOffers} tintColor="#ff385c" />}
        renderItem={({ item }) => {
          const statusInfo = OFFER_STATUS_LABEL[item.status] ?? { label: item.status, color: '#999' };
          return (
            <View style={styles.agencyCard}>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '22', position: 'relative', top: 0, right: 0, alignSelf: 'flex-start' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
                <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              </View>

              <Text style={styles.cardName}>{item.listing.name}</Text>
              <Text style={styles.agencyDetail}>Comprador: {item.buyer.name} ({item.buyer.email})</Text>
              <Text style={styles.price}>R$ {item.value.toLocaleString('pt-BR')}</Text>
              <Text style={styles.agencyDetail}>Pagamento: {item.paymentMethod}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="pricetag-outline" size={60} color="#ddd" />
              <Text style={styles.emptyTitle}>Nenhuma proposta encontrada</Text>
            </View>
          ) : null
        }
      />
    </>
  );

  const renderReviews = () => (
    <FlatList
      data={reviews}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadReviews} tintColor="#ff385c" />}
      renderItem={({ item }) => (
        <View style={styles.agencyCard}>
          <Text style={styles.cardName}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</Text>
          <Text style={styles.cardLocation}>{item.listing.name}</Text>
          <Text style={styles.agencyDetail}>Por: {item.user.name} ({item.user.email})</Text>
          {item.comment && <Text style={styles.agencyDetail}>&quot;{item.comment}&quot;</Text>}

          <View style={styles.agencyActions}>
            <TouchableOpacity style={styles.unverifyBtn} onPress={() => handleDeleteReview(item.id)}>
              <Text style={styles.unverifyBtnText}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={60} color="#ddd" />
            <Text style={styles.emptyTitle}>Nenhuma avaliação encontrada</Text>
          </View>
        ) : null
      }
    />
  );

  if (user?.role !== 'ADMIN') {
    return (
      <View style={styles.container}>
        <Text style={styles.unauthorizedText}>Acesso restrito ao administrador.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Painel Admin</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.toggleContainer}
        contentContainerStyle={styles.toggleContainerContent}
      >
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'MODERATION' && styles.toggleBtnActive]}
          onPress={() => setViewMode('MODERATION')}
        >
          <Text style={[styles.toggleText, viewMode === 'MODERATION' && styles.toggleTextActive]}>Moderação</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'DASHBOARD' && styles.toggleBtnActive]}
          onPress={() => setViewMode('DASHBOARD')}
        >
          <Text style={[styles.toggleText, viewMode === 'DASHBOARD' && styles.toggleTextActive]}>Estatísticas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'AGENCIES' && styles.toggleBtnActive]}
          onPress={() => setViewMode('AGENCIES')}
        >
          <Text style={[styles.toggleText, viewMode === 'AGENCIES' && styles.toggleTextActive]}>Imobiliárias</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'BOOKINGS' && styles.toggleBtnActive]}
          onPress={() => setViewMode('BOOKINGS')}
        >
          <Text style={[styles.toggleText, viewMode === 'BOOKINGS' && styles.toggleTextActive]}>Reservas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'OFFERS' && styles.toggleBtnActive]}
          onPress={() => setViewMode('OFFERS')}
        >
          <Text style={[styles.toggleText, viewMode === 'OFFERS' && styles.toggleTextActive]}>Propostas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'REVIEWS' && styles.toggleBtnActive]}
          onPress={() => setViewMode('REVIEWS')}
        >
          <Text style={[styles.toggleText, viewMode === 'REVIEWS' && styles.toggleTextActive]}>Avaliações</Text>
        </TouchableOpacity>
      </ScrollView>

      {viewMode === 'DASHBOARD' ? renderDashboard()
        : viewMode === 'AGENCIES' ? renderAgencies()
        : viewMode === 'BOOKINGS' ? renderBookings()
        : viewMode === 'OFFERS' ? renderOffers()
        : viewMode === 'REVIEWS' ? renderReviews()
        : (
        <>
          <View style={styles.filters}>
            {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((status) => (
              <TouchableOpacity
                key={status}
                style={[styles.filterBtn, filter === status && styles.filterBtnActive]}
                onPress={() => setFilter(status)}
              >
                <Text style={[styles.filterText, filter === status && styles.filterTextActive]}>
                  {status === 'ALL' ? 'Todos' : STATUS_LABEL[status]?.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={listings}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={loadListings} tintColor="#ff385c" />}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.empty}>
                  <Ionicons name="shield-checkmark-outline" size={60} color="#ddd" />
                  <Text style={styles.emptyTitle}>Nenhum anúncio encontrado</Text>
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  unauthorizedText: { marginTop: 100, textAlign: 'center', fontSize: 18, color: '#666' },

  toggleContainer: { backgroundColor: '#eee', marginHorizontal: 16, marginTop: 16, borderRadius: 8 },
  toggleContainerContent: { padding: 4, gap: 4 },
  toggleBtn: { paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', borderRadius: 6 },
  toggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  toggleText: { fontWeight: '600', color: '#666' },
  toggleTextActive: { color: '#ff385c' },

  filters: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 0, gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  filterBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#eee',
  },
  filterBtnActive: { backgroundColor: '#ff385c' },
  filterText: { fontSize: 13, color: '#666', fontWeight: '600' },
  filterTextActive: { color: '#fff' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardImage: { width: '100%', height: 160 },
  statusBadge: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardBody: { padding: 14 },
  cardName: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  cardLocation: { fontSize: 13, color: '#888', marginTop: 2 },
  ownerText: { fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  price: { fontSize: 16, fontWeight: '800', color: '#ff385c' },
  actions: { flexDirection: 'row', gap: 6 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3b82f6', // azul para edição
    width: 32, height: 32, borderRadius: 16,
  },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#ef4444',
    width: 32, height: 32, borderRadius: 16,
  },

  agencyCard: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  agencyResponsible: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 2 },
  agencyDetail: { fontSize: 13, color: '#666', marginTop: 4 },
  agencyActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  verifyBtn: {
    borderWidth: 1.5, borderColor: '#22c55e', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  verifyBtnText: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  unverifyBtn: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  unverifyBtnText: { color: '#666', fontSize: 13, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#666', marginTop: 16 },

  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  statValue: { fontSize: 28, fontWeight: '800', color: '#ff385c' },
  statLabel: { fontSize: 14, color: '#666', marginTop: 4, fontWeight: '500' },
  chartTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12, marginTop: 8 },
  chartContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
});
