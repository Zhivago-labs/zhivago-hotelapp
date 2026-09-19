import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { API_URL } from '@/config/api';

export default function InboxScreen() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { token, user } = useAuth();

  const fetchConversations = async () => {
    try {
      const response = await fetch(`${API_URL}/conversations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
        setFilteredConversations(data);
      }
    } catch (error) {
      console.error('Erro ao buscar conversas', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchConversations();
    }, [token])
  );

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredConversations(conversations);
    } else {
      const lowerQuery = searchQuery.toLowerCase();
      const filtered = conversations.filter(conv => {
        const otherParticipant = conv.participants.find((p: any) => p.id !== user?.id);
        const nameMatch = otherParticipant?.name?.toLowerCase().includes(lowerQuery);
        const propertyMatch = conv.property?.name?.toLowerCase().includes(lowerQuery);
        return nameMatch || propertyMatch;
      });
      setFilteredConversations(filtered);
    }
  }, [searchQuery, conversations, user?.id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mensagens</Text>
      
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Pesquisar por nome ou imóvel..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {filteredConversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#CBD5E1" />
          <Text style={styles.emptyText}>Nenhuma conversa encontrada.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const otherParticipant = item.participants.find((p: any) => p.id !== user?.id);
            const lastMessage = item.messages[0];
            const unreadCount = item._count.messages;

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/chat/${item.id}`)}
              >
                <Image
                  source={{ uri: otherParticipant?.avatar || 'https://via.placeholder.com/150' }}
                  style={styles.avatar}
                />
                <View style={styles.contentInfo}>
                  <View style={styles.header}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.name}>{otherParticipant?.name}</Text>
                      {item.isReported && (
                        <View style={styles.reportedBadge}>
                          <Ionicons name="warning" size={12} color="#EF4444" />
                          <Text style={styles.reportedText}>Denunciada</Text>
                        </View>
                      )}
                    </View>
                    {lastMessage && (
                      <Text style={styles.date}>
                        {new Date(lastMessage.createdAt).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.property}>{item.property.name}</Text>
                  <View style={styles.footer}>
                    <Text style={styles.lastMessage} numberOfLines={1}>
                      {lastMessage ? lastMessage.content : 'Nenhuma mensagem'}
                    </Text>
                    {unreadCount > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  title: { fontSize: 24, fontWeight: 'bold', margin: 20, color: '#1E293B', marginBottom: 10 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1E293B' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { marginTop: 16, fontSize: 16, color: '#64748B' },
  card: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 16 },
  contentInfo: { flex: 1, justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  date: { fontSize: 12, color: '#94A3B8' },
  property: { fontSize: 12, color: '#4F46E5', marginBottom: 4, fontWeight: '500' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMessage: { fontSize: 14, color: '#64748B', flex: 1, marginRight: 8 },
  badge: { backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  reportedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 },
  reportedText: { color: '#EF4444', fontSize: 10, fontWeight: 'bold' }
});
