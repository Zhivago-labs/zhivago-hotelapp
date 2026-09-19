import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

import { API_URL } from '@/config/api';

interface ListingData {
  name: string;
  description: string;
  price: string;
  type: 'casa' | 'apartamento';
  category: 'aluguel' | 'venda';
  billingCycle: 'noite' | 'mês';
  location: string;
  bedrooms: string;
  bathrooms: string;
  parking: string;
}

const Selector = ({
  options, current, setter,
}: {
  options: string[];
  current: string;
  setter: (v: string) => void;
}) => (
  <View style={styles.selectorContainer}>
    {options.map(option => (
      <TouchableOpacity
        key={option}
        style={[styles.selectorButton, current === option && styles.selectorButtonActive]}
        onPress={() => setter(option)}
      >
        <Text style={[styles.selectorText, current === option && styles.selectorTextActive]}>
          {option === 'mês' ? 'Mensal' : option.charAt(0).toUpperCase() + option.slice(1)}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ListingData>({
    name: '', description: '', price: '',
    type: 'casa', category: 'aluguel', billingCycle: 'noite',
    location: '', bedrooms: '', bathrooms: '', parking: '',
  });

  const set = (key: keyof ListingData) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // Carrega dados atuais do imóvel
  useEffect(() => {
    const fetchListing = async () => {
      try {
        const res = await fetch(`${API_URL}/me/listings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as Array<Record<string, unknown>>;
        const listing = data.find((l) => l['id'] === id);

        if (listing) {
          setForm({
            name: String(listing['name'] ?? ''),
            description: String(listing['description'] ?? ''),
            price: String(listing['price'] ?? ''),
            type: (listing['type'] as 'casa' | 'apartamento') ?? 'casa',
            category: (listing['category'] as 'aluguel' | 'venda') ?? 'aluguel',
            billingCycle: (listing['billingCycle'] as 'noite' | 'mês') ?? 'noite',
            location: String(listing['location'] ?? ''),
            bedrooms: String(listing['bedrooms'] ?? '0'),
            bathrooms: String(listing['bathrooms'] ?? '0'),
            parking: String(listing['parking'] ?? '0'),
          });
        }
      } catch {
        Alert.alert('Erro', 'Não foi possível carregar os dados do imóvel.');
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [id]);

  const handleSave = async () => {
    if (!form.name || !form.price || !form.location) {
      Alert.alert('Atenção', 'Preencha pelo menos nome, preço e localização.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/listings/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          price: parseFloat(form.price),
          bedrooms: parseInt(form.bedrooms || '0'),
          bathrooms: parseInt(form.bathrooms || '0'),
          parking: parseInt(form.parking || '0'),
        }),
      });

      if (res.ok) {
        Alert.alert('Sucesso', 'Imóvel atualizado com sucesso!');
        router.back();
      } else {
        const err = await res.json() as { error: string };
        Alert.alert('Erro', err.error ?? 'Não foi possível salvar.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff385c" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.pageTitle}>Editar Imóvel</Text>

      <Text style={styles.label}>Título do Anúncio *</Text>
      <TextInput style={styles.input} value={form.name} onChangeText={set('name')} placeholder="Ex: Apartamento Moderno" />

      <Text style={styles.label}>Descrição</Text>
      <TextInput
        style={[styles.input, styles.textarea]} value={form.description}
        onChangeText={set('description')} placeholder="Descreva o imóvel..."
        multiline numberOfLines={4}
      />

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.label}>Preço (R$) *</Text>
          <TextInput style={styles.input} value={form.price} onChangeText={set('price')} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Objetivo</Text>
          <Selector options={['aluguel', 'venda']} current={form.category} setter={set('category')} />
        </View>
      </View>

      {form.category === 'aluguel' && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>Cobrança</Text>
          <Selector options={['noite', 'mês']} current={form.billingCycle} setter={set('billingCycle')} />
        </View>
      )}

      <View style={{ marginTop: 10 }}>
        <Text style={styles.label}>Tipo de Imóvel</Text>
        <Selector options={['casa', 'apartamento']} current={form.type} setter={set('type')} />
      </View>

      <Text style={styles.label}>Localização *</Text>
      <TextInput style={styles.input} value={form.location} onChangeText={set('location')} placeholder="Cidade, UF" />

      <Text style={styles.label}>Detalhes</Text>
      <View style={styles.row}>
        <View style={styles.miniInputContainer}>
          <Ionicons name="bed-outline" size={18} color="#666" />
          <TextInput style={styles.miniInput} value={form.bedrooms} onChangeText={set('bedrooms')} placeholder="Quartos" keyboardType="numeric" />
        </View>
        <View style={styles.miniInputContainer}>
          <Ionicons name="water-outline" size={18} color="#666" />
          <TextInput style={styles.miniInput} value={form.bathrooms} onChangeText={set('bathrooms')} placeholder="Banh." keyboardType="numeric" />
        </View>
        <View style={styles.miniInputContainer}>
          <Ionicons name="car-outline" size={18} color="#666" />
          <TextInput style={styles.miniInput} value={form.parking} onChangeText={set('parking')} placeholder="Vagas" keyboardType="numeric" />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Salvar Alterações</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginTop: 60, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 5, color: '#444' },
  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#fafafa' },
  textarea: { height: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 10, overflow: 'hidden', height: 42 },
  selectorButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  selectorButtonActive: { backgroundColor: '#ff385c' },
  selectorText: { color: '#666', fontWeight: '600', fontSize: 13 },
  selectorTextActive: { color: '#fff' },
  miniInputContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 8, backgroundColor: '#fafafa',
  },
  miniInput: { flex: 1, padding: 10, fontSize: 13 },
  saveButton: {
    backgroundColor: '#ff385c', padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 32,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
