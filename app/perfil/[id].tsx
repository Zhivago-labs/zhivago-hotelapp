import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { HotelCard } from '@/components/HotelCard';

import { API_URL } from '@/config/api';

type UserProfile = {
  id: string;
  name: string;
  avatar: string | null;
  phone: string | null;
  createdAt: string;
};

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
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`${API_URL}/users/${id}`);
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setListings(data.listings);
          setReviews(data.reviews || []);
        }
      } catch (error) {
        console.error('Erro ao buscar usuário:', error);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchUser();
  }, [id]);

  const handleContact = () => {
    if (!user?.phone) return;
    const phoneNum = user.phone.replace(/\D/g, ''); // Apenas números
    const message = `Olá ${user.name}, vi seu perfil no aplicativo de imóveis e gostaria de conversar!`;
    const url = `whatsapp://send?phone=55${phoneNum}&text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        return Linking.openURL(url);
      } else {
        return Linking.openURL(`https://wa.me/55${phoneNum}?text=${encodeURIComponent(message)}`);
      }
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff385c" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Usuário não encontrado.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Perfil do Anunciante', headerBackTitle: 'Voltar' }} />
      
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 15 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Image 
              source={user.avatar ? { uri: user.avatar } : { uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=ff385c&color=fff&size=150` }} 
              style={styles.avatar} 
              contentFit="cover"
            />
            <Text style={styles.name}>{user.name}</Text>
            
            {reviews.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 2, backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                <Ionicons name="star" size={14} color="#f59e0b" />
                <Text style={{ fontSize: 14, fontWeight: 'bold', marginLeft: 4, color: '#333' }}>
                  {(reviews.reduce((acc, rev) => acc + rev.rating, 0) / reviews.length).toFixed(1)}
                </Text>
              </View>
            )}

            <Text style={styles.memberSince}>Membro desde {new Date(user.createdAt).getFullYear()}</Text>

            {user.phone && (
              <TouchableOpacity style={styles.contactBtn} onPress={handleContact}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={styles.contactBtnText}>Falar com Anunciante</Text>
              </TouchableOpacity>
            )}

            {reviews.length > 0 && (
              <View style={styles.reviewsContainer}>
                <Text style={styles.sectionTitle}>O que dizem dos imóveis ({reviews.length})</Text>
                {reviews.map(rev => (
                  <View key={rev.id} style={styles.reviewItem}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5}}>
                      <Image source={rev.user.avatar ? {uri: rev.user.avatar} : {uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(rev.user.name)}`}} style={{width: 30, height: 30, borderRadius: 15}}/>
                      <Text style={{fontWeight: 'bold', fontSize: 13}}>{rev.user.name}</Text>
                      <View style={{flexDirection: 'row', marginLeft: 'auto'}}>
                        {[...Array(rev.rating)].map((_, i) => <Ionicons key={i} name="star" size={12} color="#f59e0b" />)}
                      </View>
                    </View>
                    <Text style={{fontSize: 12, color: '#666', fontStyle: 'italic', marginBottom: 5}}>Estadia em: {rev.listing.name}</Text>
                    {rev.comment ? <Text style={{color: '#444', fontSize: 13}}>{rev.comment}</Text> : null}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Anúncios ({listings.length})</Text>
          </View>
        }
        renderItem={({ item }) => <HotelCard item={item} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Este usuário não possui anúncios no momento.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 15, backgroundColor: '#ddd' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  memberSince: { color: '#666', marginTop: 5, marginBottom: 20 },
  contactBtn: { 
    flexDirection: 'row', 
    backgroundColor: '#25D366', 
    paddingVertical: 12, 
    paddingHorizontal: 25, 
    borderRadius: 25, 
    alignItems: 'center',
    gap: 10,
  },
  contactBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#eee', width: '100%', marginVertical: 25 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', alignSelf: 'flex-start', marginBottom: 15 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
  reviewsContainer: { width: '100%', marginTop: 25, backgroundColor: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  reviewItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
});
