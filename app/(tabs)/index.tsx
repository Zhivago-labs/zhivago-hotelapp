import React, { useState, useEffect } from 'react';
import { 
  FlatList, StyleSheet, View, TouchableOpacity, Text, 
  TextInput, useWindowDimensions, ScrollView, ActivityIndicator, Alert, Modal, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { HotelCard } from '@/components/HotelCard';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';

import { API_URL } from '@/config/api';

type Listing = {
  id: string;
  name: string;
  location: string;
  price: number;
  category: string;
  billingCycle?: string | null;
  type: string;
  image: string;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  amenities?: { bedrooms: number; bathrooms: number; parking: number };
};

const FilterChip = ({ label, icon, isActive, onPress }: { label: string, icon?: any, isActive: boolean, onPress: () => void }) => (
  <TouchableOpacity 
    style={[styles.filterChip, isActive && styles.filterChipActive]} 
    onPress={onPress}
    activeOpacity={0.7}
  >
    {icon && <Ionicons name={icon} size={16} color={isActive ? '#fff' : '#666'} style={{ marginRight: 6 }} />}
    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

export default function TabOneScreen() {
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  // Estados de Filtro
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<'casa' | 'apartamento' | null>(null); 
  const [activeCategory, setActiveCategory] = useState<'todos' | 'aluguel' | 'venda'>('todos');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null); 
  
  // Estados de Controle
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  // FUNÇÃO PARA BUSCAR DADOS DA API
  const loadData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/listings`);
      if (response.ok) {
        const dbData = await response.json() as Listing[];
        setAllListings(dbData);
      } else {
        throw new Error('Erro na resposta do servidor');
      }
    } catch (e) { 
      console.error('Erro ao carregar dados:', e);
      setAllListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    if (isFocused) loadData(); 
  }, [isFocused]);

  const filteredData = React.useMemo(() => {
    let data = allListings.filter((item) => {
      const matchesType = !activeType || item.type === activeType;
      const matchesCategory = activeCategory === 'todos' || item.category === activeCategory;
      const searchLower = searchQuery.toLowerCase();
      
      return matchesType && matchesCategory && (
        item.name.toLowerCase().includes(searchLower) || 
        item.location.toLowerCase().includes(searchLower)
      );
    });

    if (sortOrder === 'asc') data.sort((a, b) => a.price - b.price);
    else if (sortOrder === 'desc') data.sort((a, b) => b.price - a.price);

    return data;
  }, [allListings, activeType, activeCategory, searchQuery, sortOrder]);

  const numColumns = width > 1024 ? 3 : width > 768 ? 2 : 1;

  const clearFilters = () => {
    setActiveType(null);
    setActiveCategory('todos');
    setSortOrder(null);
  };

  const renderItem = React.useCallback(({ item }: { item: Listing }) => (
    <View style={{ flex: 1/numColumns, padding: 8 }}>
      <HotelCard item={item} />
    </View>
  ), [numColumns]);

  const keyExtractor = React.useCallback((item: Listing) => item.id.toString(), []);

  return (
    <View style={styles.container}>
      {/* HEADER COM BUSCA */}
      <View style={styles.header}>
        <View style={styles.userRow}>
          <Text style={styles.greeting}>
            Olá, <Text style={styles.greetingName}>{user?.name?.split(' ')[0] ?? 'visitante'}</Text> 👋
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.notificationButton}
              onPress={() => router.push('/notifications')}
            >
              <Ionicons name="notifications-outline" size={24} color="#666" />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => {
                Alert.alert('Sair', 'Deseja fazer logout?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Sair', style: 'destructive', onPress: logout },
                ]);
              }}
            >
              <Ionicons name="log-out-outline" size={24} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#666" />
            <TextInput 
              placeholder="Para onde vamos?" 
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          {Platform.OS !== 'web' && (
            <TouchableOpacity 
              style={styles.filterButton} 
              onPress={() => setIsModalVisible(true)}
            >
              <Ionicons name="options-outline" size={24} color="#333" />
              {(activeType || activeCategory !== 'todos' || sortOrder) && (
                <View style={styles.filterDot} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* BARRA DE FILTROS HORIZONTAL (Apenas Web) */}
      {Platform.OS === 'web' && (
        <View style={styles.filtersContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.filtersScroll}
          >
            <FilterChip 
              label="Casa" icon="home-outline" 
              isActive={activeType === 'casa'} 
              onPress={() => setActiveType(activeType === 'casa' ? null : 'casa')} 
            />
            <FilterChip 
              label="Apartamento" icon="business-outline" 
              isActive={activeType === 'apartamento'} 
              onPress={() => setActiveType(activeType === 'apartamento' ? null : 'apartamento')} 
            />
            
            <View style={styles.filterDivider} />

            <FilterChip 
              label="Alugar" 
              isActive={activeCategory === 'aluguel'} 
              onPress={() => setActiveCategory(activeCategory === 'aluguel' ? 'todos' : 'aluguel')} 
            />
            <FilterChip 
              label="Comprar" 
              isActive={activeCategory === 'venda'} 
              onPress={() => setActiveCategory(activeCategory === 'venda' ? 'todos' : 'venda')} 
            />

            <View style={styles.filterDivider} />

            <FilterChip 
              label="Menor Preço" icon="arrow-down-outline"
              isActive={sortOrder === 'asc'} 
              onPress={() => setSortOrder(sortOrder === 'asc' ? null : 'asc')} 
            />
            <FilterChip 
              label="Maior Preço" icon="arrow-up-outline"
              isActive={sortOrder === 'desc'} 
              onPress={() => setSortOrder(sortOrder === 'desc' ? null : 'desc')} 
            />

            {(activeType || activeCategory !== 'todos' || sortOrder) && (
              <>
                <View style={styles.filterDivider} />
                <TouchableOpacity onPress={clearFilters} style={styles.clearFiltersBtn}>
                  <Ionicons name="close-circle" size={16} color="#666" style={{ marginRight: 4 }} />
                  <Text style={styles.clearFiltersText}>Limpar</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      )}

      {/* MODAL DE FILTROS (Apenas Mobile) */}
      {Platform.OS !== 'web' && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={isModalVisible}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Filtros</Text>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.resetText}>Limpar</Text>
                </TouchableOpacity>
              </View>

              <ScrollView>
                <Text style={styles.sectionTitle}>Tipo de Imóvel</Text>
                <View style={styles.optionRow}>
                  {['casa', 'apartamento'].map((t) => (
                    <TouchableOpacity 
                      key={t}
                      style={[styles.optionCard, activeType === t && styles.optionCardActive]}
                      onPress={() => setActiveType(activeType === t ? null : t as any)}
                    >
                      <Ionicons name={t === 'casa' ? 'home-outline' : 'business-outline'} size={24} color={activeType === t ? '#fff' : '#333'} />
                      <Text style={[styles.optionText, activeType === t && styles.optionTextActive]}>{t === 'casa' ? 'Casa' : 'Apartamento'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Objetivo</Text>
                <View style={styles.optionRow}>
                  {['aluguel', 'venda'].map((c) => (
                    <TouchableOpacity 
                      key={c}
                      style={[styles.optionCard, activeCategory === c && styles.optionCardActive]}
                      onPress={() => setActiveCategory(activeCategory === c ? 'todos' : c as any)}
                    >
                      <Text style={[styles.optionText, activeCategory === c && styles.optionTextActive]}>{c === 'aluguel' ? 'Alugar' : 'Comprar'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Ordenar por Preço</Text>
                <View style={styles.optionRow}>
                  <TouchableOpacity 
                    style={[styles.optionCard, sortOrder === 'asc' && styles.optionCardActive]}
                    onPress={() => setSortOrder(sortOrder === 'asc' ? null : 'asc')}
                  >
                    <Text style={[styles.optionText, sortOrder === 'asc' && styles.optionTextActive]}>Menor preço</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.optionCard, sortOrder === 'desc' && styles.optionCardActive]}
                    onPress={() => setSortOrder(sortOrder === 'desc' ? null : 'desc')}
                  >
                    <Text style={[styles.optionText, sortOrder === 'desc' && styles.optionTextActive]}>Maior preço</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <TouchableOpacity 
                style={styles.applyButton} 
                onPress={() => setIsModalVisible(false)}
              >
                <Text style={styles.applyButtonText}>Mostrar {filteredData.length} resultados</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* LISTA DE RESULTADOS */}
      {loading && allListings.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#ff385c" />
        </View>
      ) : (
        <FlatList
          key={numColumns}
          numColumns={numColumns}
          data={filteredData}
          keyExtractor={keyExtractor}
          onRefresh={loadData}
          refreshing={loading}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={true}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Nenhum imóvel encontrado.</Text>
          }
        />
      )}

      {/* BOTÃO FLUTUANTE */}
      {user?.role !== 'ADMIN' && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/criar-anuncio')}>
          <Ionicons name="add" size={30} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: { backgroundColor: '#fff', padding: 15, paddingTop: 50, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  userRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting: { fontSize: 16, color: '#444' },
  greetingName: { fontWeight: '700', color: '#1a1a1a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  notificationButton: { position: 'relative', padding: 4 },
  badge: { position: 'absolute', top: -2, right: -4, backgroundColor: '#ff385c', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  logoutButton: { padding: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#f5f5f5', padding: 12, borderRadius: 12, alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 15 },
  
  // Filtros Web-friendly
  filtersContainer: { backgroundColor: '#fff', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  filtersScroll: { paddingHorizontal: 15, alignItems: 'center' },
  filterChip: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', 
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 
  },
  filterChipActive: { backgroundColor: '#ff385c', borderColor: '#ff385c' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: 'bold' },
  filterDivider: { width: 1, height: 20, backgroundColor: '#ddd', marginHorizontal: 8, marginRight: 16 },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  clearFiltersText: { fontSize: 13, color: '#666', fontWeight: '600' },

  // Botão e Modal Mobile
  filterButton: { padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 25, position: 'relative' },
  filterDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, backgroundColor: '#ff385c', borderRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  resetText: { color: '#666', textDecorationLine: 'underline' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  optionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  optionCard: { padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', minWidth: 100 },
  optionCardActive: { backgroundColor: '#333', borderColor: '#333' },
  optionText: { fontSize: 14, color: '#333' },
  optionTextActive: { color: '#fff', fontWeight: 'bold' },
  applyButton: { backgroundColor: '#ff385c', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  applyButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 15 },
  fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: '#ff385c', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, boxShadow: '0px 4px 10px rgba(255,56,92,0.3)' },
});