import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/config/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!email) {
      Alert.alert('Atenção', 'Preencha o e-mail cadastrado.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Código Enviado',
          'Se o e-mail estiver cadastrado, você receberá um código de 6 dígitos em instantes.',
          [{ text: 'OK', onPress: () => router.push(`/(auth)/redefinir-senha?email=${encodeURIComponent(email.trim().toLowerCase())}`) }]
        );
      } else {
        Alert.alert('Erro', data.error || 'Não foi possível solicitar a recuperação.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Verifique sua conexão de rede.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>Recuperar Senha</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Digite o e-mail associado à sua conta. Enviaremos um código de 6 dígitos para você redefinir sua senha.
        </Text>

        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleSend}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar Código</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  content: { padding: 24 },
  subtitle: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 30 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 14, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 24
  },
  button: {
    backgroundColor: '#ff385c', borderRadius: 12, padding: 16, alignItems: 'center'
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
