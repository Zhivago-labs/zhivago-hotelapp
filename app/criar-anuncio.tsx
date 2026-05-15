import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

import { API_URL } from '@/config/api';

export default function CreateListingScreen() {
  const router = useRouter();
  const { token, logout } = useAuth();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<'casa' | 'apartamento'>('casa');
  const [category, setCategory] = useState<'aluguel' | 'venda'>('aluguel');
  const [billingCycle, setBillingCycle] = useState<'noite' | 'mês'>('noite');

  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Novo estado de loading
  
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [parking, setParking] = useState('');
  
  const [imageUri, setImageUri] = useState<string | null>(null);

  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setLogradouro(data.logradouro || '');
        setBairro(data.bairro || '');
        setCidade(data.localidade || '');
        setUf(data.uf || '');
      }
    } catch (error) {
      Alert.alert('Erro', 'Falha ao buscar CEP.');
    } finally {
      setLoadingCep(false);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.3,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name || !price || !imageUri || !cep) {
      Alert.alert('Erro', 'Preencha os campos obrigatórios.');
      return;
    }

    setIsSaving(true);

    // Objeto formatado para o seu Banco de Dados usando FormData
    const formData = new FormData();
    formData.append('name', name);
    if (description) formData.append('description', description);
    formData.append('price', price);
    formData.append('type', type);
    formData.append('category', category);
    if (category === 'aluguel') formData.append('billingCycle', billingCycle);
    formData.append('location', `${cidade}, ${uf}`);
    formData.append('bedrooms', bedrooms || '0');
    formData.append('bathrooms', bathrooms || '0');
    formData.append('parking', parking || '0');

    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename || '');
    const fileType = match ? `image/${match[1]}` : `image`;
    
    // Tratamento para React Native FormData com imagens (Web vs Mobile)
    if (Platform.OS === 'web') {
      try {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        formData.append('image', blob, filename || 'upload.jpg');
      } catch (e) {
        Alert.alert('Erro', 'Falha ao processar a imagem no navegador.');
        setIsSaving(false);
        return;
      }
    } else {
      formData.append('image', {
        uri: imageUri,
        name: filename || 'upload.jpg',
        type: fileType,
      } as any);
    }

    try {
      const response = await fetch(`${API_URL}/listings`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (response.ok) {
        Alert.alert(
          'Sucesso', 
          'Imóvel cadastrado com sucesso!\n\nDica: Certifique-se de ter um telefone cadastrado no seu Perfil para que as pessoas possam entrar em contato com você.',
          [{ text: 'Entendi', onPress: () => router.back() }]
        );
      } else if (response.status === 401) {
        Alert.alert('Sessão expirada', 'Faça login novamente.');
        logout();
      } else {
        const errorData = await response.text();
        console.error('Erro na API:', errorData);
        Alert.alert('Erro', 'Falha ao salvar no servidor.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erro de Conexão', 'Certifique-se que o servidor Node está rodando.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reutilizando seu componente Selector
  const Selector = ({ options, current, setter }: { options: string[], current: string, setter: Function }) => (
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.label}>Título do Anúncio *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ex: Loft Moderno" />

      <Text style={styles.label}>Descrição</Text>
      <TextInput 
        style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
        value={description} 
        onChangeText={setDescription} 
        placeholder="Fale um pouco sobre o imóvel..." 
        multiline 
        numberOfLines={4}
      />

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.label}>Preço (R$) *</Text>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="1200" keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Objetivo</Text>
          <Selector options={['aluguel', 'venda']} current={category} setter={setCategory} />
        </View>
      </View>

      {category === 'aluguel' && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>Tipo de Cobrança</Text>
          <Selector options={['noite', 'mês']} current={billingCycle} setter={setBillingCycle} />
        </View>
      )}

      <View style={{ marginTop: 10 }}>
        <Text style={styles.label}>Tipo de Imóvel</Text>
        <Selector options={['casa', 'apartamento']} current={type} setter={setType} />
      </View>

      <Text style={styles.label}>Detalhes do Imóvel</Text>
      <View style={styles.row}>
        <View style={styles.miniInputContainer}>
          <Ionicons name="bed-outline" size={18} color="#666" />
          <TextInput style={styles.miniInput} value={bedrooms} onChangeText={setBedrooms} placeholder="Quartos" keyboardType="numeric" />
        </View>
        <View style={styles.miniInputContainer}>
          <Ionicons name="water-outline" size={18} color="#666" />
          <TextInput style={styles.miniInput} value={bathrooms} onChangeText={setBathrooms} placeholder="Banh." keyboardType="numeric" />
        </View>
        <View style={styles.miniInputContainer}>
          <Ionicons name="car-outline" size={18} color="#666" />
          <TextInput style={styles.miniInput} value={parking} onChangeText={setParking} placeholder="Vagas" keyboardType="numeric" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>CEP *</Text>
          <TextInput style={styles.input} value={cep} onChangeText={setCep} onBlur={handleCepBlur} placeholder="00000-000" keyboardType="numeric" maxLength={9} />
        </View>
        {loadingCep && <ActivityIndicator size="small" color="#ff385c" style={{ marginLeft: 10, marginBottom: 15 }} />}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 3, marginRight: 10 }}><Text style={styles.label}>Rua</Text><TextInput style={styles.input} value={logradouro} onChangeText={setLogradouro} /></View>
        <View style={{ flex: 1 }}><Text style={styles.label}>Nº</Text><TextInput style={styles.input} value={numero} onChangeText={setNumero} keyboardType="numeric" /></View>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 2, marginRight: 10 }}><Text style={styles.label}>Bairro</Text><TextInput style={styles.input} value={bairro} onChangeText={setBairro} /></View>
        <View style={{ flex: 1 }}><Text style={styles.label}>UF</Text><TextInput style={styles.input} value={uf} onChangeText={setUf} maxLength={2} autoCapitalize="characters" /></View>
      </View>

      <Text style={styles.label}>Cidade</Text>
      <TextInput style={styles.input} value={cidade} onChangeText={setCidade} />

      <Text style={styles.label}>Imagem do Local *</Text>
      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="camera" size={30} color="#ccc" />
            <Text style={{ color: '#ccc', fontSize: 12 }}>Selecionar Foto</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={{ backgroundColor: '#fff8e1', padding: 12, borderRadius: 8, marginTop: 20, borderWidth: 1, borderColor: '#ffe082' }}>
        <Text style={{ color: '#f57f17', fontSize: 13, lineHeight: 18, fontWeight: '500' }}>
          <Ionicons name="information-circle" size={16} /> Lembrete: Para que os hóspedes consigam falar com você, é essencial que seu número de WhatsApp esteja cadastrado no seu Perfil!
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.saveButton, isSaving && { opacity: 0.7 }]} 
        onPress={handleSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Anunciar Imóvel</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  label: { fontSize: 13, fontWeight: 'bold', marginTop: 12, marginBottom: 4, color: '#444' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fdfdfd' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', height: 40 },
  selectorButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  selectorButtonActive: { backgroundColor: '#ff385c' },
  selectorText: { color: '#666', fontWeight: '600', fontSize: 12 },
  selectorTextActive: { color: '#fff' },
  miniInputContainer: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    paddingHorizontal: 8,
    backgroundColor: '#fdfdfd'
  },
  miniInput: { flex: 1, padding: 8, fontSize: 12 },
  imagePicker: { marginTop: 10, height: 150, borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#ccc', overflow: 'hidden' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: '100%' },
  saveButton: { backgroundColor: '#ff385c', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});