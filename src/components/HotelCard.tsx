import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Listing } from '@/constants/ListingsData';
import { Ionicons } from '@expo/vector-icons'; // Importação necessária para os ícones
import { useRouter } from 'expo-router';

export const HotelCard = React.memo(function HotelCard({ item }: { item: Listing }) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/imovel/${item.id}` as never);
  };

  return (
    <TouchableOpacity 
      style={styles.card} 
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <Image 
        source={{ uri: item.image }} 
        style={styles.image} 
        contentFit="cover"
        transition={300}
      />
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
  }
});