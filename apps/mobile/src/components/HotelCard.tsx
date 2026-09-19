import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import type { ListingImage } from '@zhivago/shared';
import { Ionicons } from '@expo/vector-icons'; // Importação necessária para os ícones
import { useRouter } from 'expo-router';

import { useFavorites } from '@/contexts/FavoritesContext';

interface HotelCardListing {
  id: string;
  name: string;
  location: string;
  price: number;
  category: string;
  billingCycle?: string | null;
  images: ListingImage[];
  bedrooms: number;
  bathrooms: number;
  parking: number;
  status?: string;
  amenities?: { bedrooms: number; bathrooms: number; parking: number };
}

export const HotelCard = React.memo(function HotelCard({ item }: { item: HotelCardListing }) {
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(item.id);

  const handlePress = () => {
    router.push(`/imovel/${item.id}` as never);
  };

  const handleToggleFav = (e: any) => {
    e?.stopPropagation?.();
    toggleFavorite(item.id);
  };

  return (
    <TouchableOpacity 
      style={styles.card} 
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={{ position: 'relative' }}>
        <Image
          source={{ uri: item.images?.[0]?.url }}
          style={styles.image} 
          contentFit="cover"
          transition={300}
        />
        {item.status === 'SOLD' && (
          <View style={styles.soldBadge}>
            <Text style={styles.soldText}>VENDIDO</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={handleToggleFav}
          activeOpacity={0.7}
        >
          <Ionicons
            name={active ? 'heart' : 'heart-outline'}
            size={20}
            color={active ? '#ff385c' : '#475569'}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.location}>{item.location}</Text>

        {/* --- NOVAS AMENIDADES (Quartos, Banheiros, Garagem) --- */}
        <View style={styles.amenitiesRow}>
          <View style={styles.amenityItem}>
            <Ionicons name="bed-outline" size={16} color="#666" />
            <Text style={styles.amenityText}>{item.amenities?.bedrooms || item.bedrooms || 0}</Text>
          </View>
          <View style={styles.amenityItem}>
            <Ionicons name="water-outline" size={16} color="#666" />
            <Text style={styles.amenityText}>{item.amenities?.bathrooms || item.bathrooms || 0}</Text>
          </View>
          <View style={styles.amenityItem}>
            <Ionicons name="car-outline" size={16} color="#666" />
            <Text style={styles.amenityText}>{item.amenities?.parking || item.parking || 0}</Text>
          </View>
        </View>

        {/* Lógica de preço sem espaços entre as tags */}
        <Text style={styles.price}>
          R$ {item.price.toLocaleString('pt-BR')}{item.category === 'aluguel' ? ` / ${item.billingCycle || 'noite'}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 10, 
    marginBottom: 20, 
    overflow: 'hidden', 
    elevation: 2,
    // Sombra para Web e iOS
    boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.1)',
  },
  image: { width: '100%', height: 200 },
  info: { padding: 15 },
  name: { fontSize: 18, fontWeight: 'bold' },
  location: { color: '#666', marginTop: 2 },
  
  // Estilos das Amenidades
  amenitiesRow: { 
    flexDirection: 'row', 
    marginTop: 8, 
    gap: 15,
    marginBottom: 5 
  },
  amenityItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4 
  },
  amenityText: { 
    fontSize: 12, 
    color: '#666' 
  },

  price: { 
    marginTop: 5, 
    fontWeight: 'bold', 
    color: '#ff385c' 
  },
  soldBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  soldText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  }
});