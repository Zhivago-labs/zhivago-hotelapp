import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

import { API_URL } from '@/config/api';

interface MyListing {
  id: string;
  name: string;
  location: string;
  price: number;
  category: string;
  billingCycle?: string | null;
  type: string;
  status: string;
  image: string;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  APPROVED: { label: 'Aprovado', color: '#22c55e' },
  PENDING:  { label: 'Em análise', color: '#f59e0b' },
  REJECTED: { label: 'Rejeitado', color: '#ef4444' },
  REMOVED:  { label: 'Removido', color: '#9ca3af' },
};

export default function MyListingsScreen() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMyListings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/me/listings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        // Token is invalid/expired
        Alert.alert('Sessão expirada', 'Por favor, faça login novamente.');
        logout();
        return;
      }
      const data = await res.json() as MyListing[];
      setListings(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar seus imóveis.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Recarrega sempre que a tela ganhar foco
  useFocusEffect(useCallback(() => { loadMyListings(); }, [loadMyListings]));

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Remover imóvel',
      `Tem certeza que deseja remover "${name}"? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/listings/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.ok || res.status === 204) {
                setListings(prev => prev.filter(l => l.id !== id));
              } else {
                Alert.alert('Erro', 'Não foi possível remover o imóvel.');
              }
            } catch {
              Alert.alert('Erro de conexão', 'Verifique o servidor.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: MyListing }) => {
    const statusInfo = STATUS_LABEL[item.status] ?? { label: item.status, color: '#999' };

    return (
      <View style={styles.card}>
        <Image source={{ uri: item.image }} style={styles.cardImage} />

        {/* Badge de status */}
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '22' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardLocation}>{item.location}</Text>

          <View style={styles.amenitiesRow}>
            <View style={styles.amenityItem}>
              <Ionicons name="bed-outline" size={14} color="#666" />
              <Text style={styles.amenityText}>{item.bedrooms}</Text>
            </View>
            <View style={styles.amenityItem}>
              <Ionicons name="water-outline" size={14} color="#666" />
              <Text style={styles.amenityText}>{item.bathrooms}</Text>
            </View>
            <View style={styles.amenityItem}>
              <Ionicons name="car-outline" size={14} color="#666" />
              <Text style={styles.amenityText}>{item.parking}</Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.price}>
              R$ {item.price.toLocaleString('pt-BR')}
              {item.category === 'aluguel' ? `/${item.billingCycle ?? 'noite'}` : ''}
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push(`/editar-anuncio/${item.id}` as never)}
              >
                <Ionicons name="pencil-outline" size={16} color="#ff385c" />
                <Text style={styles.editBtnText}>Editar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item.id, item.name)}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus Anúncios</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push('/criar-anuncio')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newBtnText}>Novo</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMyListings} tintColor="#ff385c" />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="home-outline" size={60} color="#ddd" />
              <Text style={styles.emptyTitle}>Nenhum imóvel ainda</Text>
              <Text style={styles.emptySubtitle}>Publique seu primeiro imóvel e comece a receber contatos!</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/criar-anuncio')}>
                <Text style={styles.emptyBtnText}>Anunciar imóvel</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
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
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ff385c', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

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
  amenitiesRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
  amenityItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amenityText: { fontSize: 12, color: '#666' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  price: { fontSize: 16, fontWeight: '800', color: '#ff385c' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: '#ff385c',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  editBtnText: { color: '#ff385c', fontWeight: '600', fontSize: 13 },
  deleteBtn: {
    borderWidth: 1.5, borderColor: '#ef4444',
    padding: 6, borderRadius: 20,
  },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#999', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: {
    marginTop: 24, backgroundColor: '#ff385c',
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
