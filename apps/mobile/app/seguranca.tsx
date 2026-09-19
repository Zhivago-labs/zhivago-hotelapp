import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

import { API_URL } from '@/config/api';

export default function SecurityScreen() {
  const router = useRouter();
  const { token, logout } = useAuth();
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!currentPassword) {
      Alert.alert('Atenção', 'Informe a senha atual.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Atenção', 'A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Atenção', 'A confirmação de senha não confere.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/auth/password`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      
      if (response.ok) {
        Alert.alert(
          'Senha alterada', 
          'Sua senha foi atualizada com sucesso. Por segurança, faça login novamente.',
          [{ text: 'OK', onPress: () => logout() }]
        );
      } else {
        const err = await response.json();
        Alert.alert('Erro', err.error || 'Não foi possível alterar a senha.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Verifique sua conexão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Login e Segurança</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.instructions}>
          Para sua segurança, informe sua senha atual antes de definir uma nova senha.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Senha Atual</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Digite sua senha atual"
            secureTextEntry
            placeholderTextColor="#aaa"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nova Senha</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="No mínimo 6 caracteres"
            secureTextEntry
            placeholderTextColor="#aaa"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirmar Nova Senha</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repita a nova senha"
            secureTextEntry
            placeholderTextColor="#aaa"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Atualizar Senha</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  content: { padding: 20 },
  instructions: { fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#1a1a1a', backgroundColor: '#fafafa'
  },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee', paddingBottom: 40 },
  saveButton: {
    backgroundColor: '#ff385c', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center'
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
