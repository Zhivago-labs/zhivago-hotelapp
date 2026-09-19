import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from '@/config/api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email: string }>();

  const [email, setEmail] = useState(emailParam || '');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email || !token || !newPassword) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
      return;
    }
    if (token.length !== 6) {
      Alert.alert('Atenção', 'O código deve ter 6 dígitos.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Atenção', 'A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(),
          token: token.trim(),
          newPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Sucesso!',
          'Sua senha foi redefinida com sucesso.',
          [{ text: 'Fazer Login', onPress: () => router.replace('/(auth)/login') }]
        );
      } else {
        Alert.alert('Erro', data.error || 'Não foi possível redefinir a senha.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Verifique sua conexão de rede.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.title}>Criar Nova Senha</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Insira o código de 6 dígitos que enviamos para o seu e-mail e escolha uma nova senha.
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
          editable={!emailParam}
        />

        <Text style={styles.label}>Código de 6 dígitos</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
        />

        <Text style={styles.label}>Nova Senha</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Mínimo 6 caracteres"
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#888" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Redefinir Senha</Text>}
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
    padding: 14, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 20
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeButton: { position: 'absolute', right: 14, top: 14 },
  button: {
    backgroundColor: '#ff385c', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
