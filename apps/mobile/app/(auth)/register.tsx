import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

const ACCOUNT_TYPE_LABEL: Record<'INDIVIDUAL' | 'AGENCY', string> = {
  INDIVIDUAL: 'Pessoa física',
  AGENCY: 'Imobiliária',
};

function AccountTypeSelector({
  current,
  setter,
}: {
  current: 'INDIVIDUAL' | 'AGENCY';
  setter: (value: 'INDIVIDUAL' | 'AGENCY') => void;
}) {
  return (
    <View style={styles.selectorContainer}>
      {(['INDIVIDUAL', 'AGENCY'] as const).map((option) => (
        <TouchableOpacity
          key={option}
          style={[styles.selectorButton, current === option && styles.selectorButtonActive]}
          onPress={() => setter(option)}
        >
          <Text style={[styles.selectorText, current === option && styles.selectorTextActive]}>
            {ACCOUNT_TYPE_LABEL[option]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [accountType, setAccountType] = useState<'INDIVIDUAL' | 'AGENCY'>('INDIVIDUAL');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [document, setDocument] = useState('');
  const [creci, setCreci] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('E-mail inválido', 'Digite um e-mail válido (ex: nome@email.com).');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha fraca', 'A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Senhas diferentes', 'A confirmação de senha não confere.');
      return;
    }
    if (accountType === 'AGENCY' && (!companyName || !document)) {
      Alert.alert('Campos obrigatórios', 'Preencha o nome fantasia e o CNPJ (ou CPF) da imobiliária.');
      return;
    }
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        accountType,
        ...(accountType === 'AGENCY'
          ? { companyName: companyName.trim(), document: document.trim(), creci: creci.trim() || undefined }
          : {}),
      });
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Erro ao cadastrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* HEADER */}
        <View style={styles.logoArea}>
          <Image source={require('../../assets/images/logo.png')} style={{ width: 250, height: 250 }} contentFit="contain" />
          <Text style={styles.subtitle}>Crie sua conta grátis</Text>
        </View>

        {/* FORMULÁRIO */}
        <View style={styles.form}>
          <Text style={styles.label}>Tipo de conta</Text>
          <AccountTypeSelector current={accountType} setter={setAccountType} />

          <Text style={styles.label}>{accountType === 'AGENCY' ? 'Nome do responsável' : 'Nome completo'}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="João Silva"
            autoCapitalize="words"
          />

          {accountType === 'AGENCY' && (
            <>
              <Text style={styles.label}>Nome fantasia</Text>
              <TextInput
                style={styles.input}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Imobiliária Silva"
                autoCapitalize="words"
              />

              <Text style={styles.label}>CNPJ (ou CPF)</Text>
              <TextInput
                style={styles.input}
                value={document}
                onChangeText={setDocument}
                placeholder="00.000.000/0000-00"
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.label}>CRECI (opcional)</Text>
              <TextInput
                style={styles.input}
                value={creci}
                onChangeText={setCreci}
                placeholder="Registro CRECI"
              />
            </>
          )}

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

          <Text style={styles.label}>Senha</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
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

          <Text style={styles.label}>Confirmar senha</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repita a senha"
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#888" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Criar conta</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* RODAPÉ */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem conta? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Fazer login</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 28, paddingTop: 80 },
  logoArea: { alignItems: 'center', marginBottom: 40 },
  appName: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', marginTop: 10 },
  subtitle: { fontSize: 16, color: '#666', marginTop: 4 },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 16, marginBottom: 6 },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', height: 44 },
  selectorButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  selectorButtonActive: { backgroundColor: '#ff385c' },
  selectorText: { color: '#666', fontWeight: '600', fontSize: 13 },
  selectorTextActive: { color: '#fff' },
  input: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 14, fontSize: 15, backgroundColor: '#fafafa',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeButton: { position: 'absolute', right: 14, top: 14 },
  button: {
    backgroundColor: '#ff385c', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 28,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: '#666', fontSize: 14 },
  footerLink: { color: '#ff385c', fontSize: 14, fontWeight: '700' },
  warningBox: { backgroundColor: '#fff8e1', padding: 12, borderRadius: 8, marginTop: 20, borderWidth: 1, borderColor: '#ffe082' },
  warningText: { color: '#f57f17', fontSize: 13, lineHeight: 18, fontWeight: '500' },
});
