import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

const MenuOption = ({
  icon, title, subtitle, onPress, danger,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
}) => (
  <TouchableOpacity style={styles.optionRow} onPress={onPress}>
    <View style={[styles.optionIcon, danger && styles.optionIconDanger]}>
      <Ionicons name={icon as never} size={22} color={danger ? '#ef4444' : '#333'} />
    </View>
    <View style={styles.optionContent}>
      <Text style={[styles.optionTitle, danger && styles.optionTitleDanger]}>{title}</Text>
      {subtitle && <Text style={styles.optionSubtitle}>{subtitle}</Text>}
    </View>
    {!danger && <Ionicons name="chevron-forward" size={18} color="#ccc" />}
  </TouchableOpacity>
);

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  // Gera iniciais para o avatar
  const initials = user?.name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  const handleLogout = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header do Perfil */}
      <View style={styles.header}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.userName}>{user?.name ?? '—'}</Text>
          <Text style={styles.userEmail}>{user?.email ?? '—'}</Text>
          {user?.role === 'ADMIN' && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#fff" />
              <Text style={styles.adminBadgeText}>Administrador</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Seção: Imóveis (Apenas para Usuários Comuns) */}
      {user?.role !== 'ADMIN' && (
        <>
          <Text style={styles.sectionTitle}>Meus Imóveis</Text>
          <MenuOption
            icon="pie-chart-outline"
            title="Meu Dashboard"
            subtitle="Desempenho e estatísticas"
            onPress={() => router.push('/meu-dashboard')}
          />
          <MenuOption
            icon="home-outline"
            title="Meus Anúncios"
            subtitle="Gerencie seus imóveis cadastrados"
            onPress={() => router.push('/(tabs)/my-listings')}
          />
          <MenuOption
            icon="add-circle-outline"
            title="Anunciar Imóvel"
            subtitle="Publique uma casa ou apartamento"
            onPress={() => router.push('/criar-anuncio')}
          />
          <View style={styles.divider} />
        </>
      )}

      {/* Seção: Conta */}
      <Text style={styles.sectionTitle}>Conta</Text>
      <MenuOption 
        icon="person-outline" 
        title="Informações Pessoais" 
        onPress={() => router.push('/informacoes-pessoais')}
      />
      <MenuOption 
        icon="shield-checkmark-outline" 
        title="Login e Segurança" 
        onPress={() => router.push('/seguranca')}
      />

      {/* Admin only */}
      {user?.role === 'ADMIN' && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Administração</Text>
          <MenuOption
            icon="stats-chart-outline"
            title="Painel Admin"
            subtitle="Gerenciar usuários e publicações"
            onPress={() => router.push('/(tabs)/admin-panel')}
          />
        </>
      )}

      <View style={styles.divider} />

      {/* Logout */}
      <MenuOption
        icon="log-out-outline"
        title="Sair da Conta"
        onPress={handleLogout}
        danger
      />

      <Text style={styles.version}>Zhivago v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 24, paddingTop: 60 },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#ff385c', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headerText: { marginLeft: 16, flex: 1 },
  userName: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  userEmail: { fontSize: 14, color: '#888', marginTop: 2 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ff385c', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start',
  },
  adminBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 20, marginVertical: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 20, marginTop: 12, marginBottom: 4 },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  optionIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  optionIconDanger: { backgroundColor: '#fef2f2' },
  optionContent: { flex: 1 },
  optionTitle: { fontSize: 15, color: '#1a1a1a', fontWeight: '500' },
  optionTitleDanger: { color: '#ef4444' },
  optionSubtitle: { fontSize: 12, color: '#999', marginTop: 2 },
  version: { textAlign: 'center', color: '#ccc', marginTop: 24, fontSize: 12 },
});