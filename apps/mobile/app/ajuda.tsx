import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LegalScreen } from '@/components/LegalScreen';

const FAQ = [
  {
    q: 'É grátis pra procurar ou anunciar um imóvel?',
    a: 'Sim. Criar conta, buscar imóveis e publicar seu próprio anúncio não custa nada.',
  },
  {
    q: 'Preciso pagar pra falar com quem anuncia?',
    a: 'Não. A conversa acontece direto pelo chat da plataforma, sem custo e sem intermediário.',
  },
  {
    q: 'Como funciona a reserva por temporada?',
    a: 'Você escolhe as datas de check-in e check-out e envia um pedido de reserva; o anunciante confirma, recusa ou negocia pelo chat.',
  },
  {
    q: 'Também dá pra alugar por mês, não só por temporada?',
    a: 'Sim. Além da temporada (diária) e da venda, existe o aluguel mensal — negociado direto no chat com quem anuncia.',
  },
  {
    q: 'Todo anúncio passa por revisão?',
    a: 'Sim, cada anúncio é moderado antes de ficar público, pra manter o marketplace confiável pra quem procura e pra quem anuncia.',
  },
  {
    q: 'Como recupero minha senha?',
    a: 'Na tela de login, use o link "Esqueci minha senha" e siga as instruções enviadas para o seu e-mail.',
  },
  {
    q: 'Como denuncio um anúncio ou uma conversa?',
    a: 'Abra o anúncio ou a conversa e use a opção de denunciar/reportar. Nossa equipe de moderação analisa cada denúncia.',
  },
  {
    q: 'Como excluo minha conta?',
    a: 'Fale com o nosso suporte pelo e-mail abaixo e faremos a exclusão da sua conta e dos seus dados, conforme nossa Política de Privacidade.',
  },
];

export default function AjudaScreen() {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <LegalScreen title="Central de Ajuda">
      <Text style={styles.intro}>
        Reunimos aqui as dúvidas mais comuns sobre a Zhivago. Se você não encontrar o que
        procura, fale com a gente pelo e-mail de suporte.
      </Text>

      <Text style={styles.faqTitle}>Perguntas frequentes</Text>

      <View style={styles.faqList}>
        {FAQ.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <View key={item.q} style={styles.faqItem}>
              <TouchableOpacity
                style={styles.faqQuestion}
                onPress={() => setOpenIndex(isOpen ? null : index)}
              >
                <Text style={styles.faqQuestionText}>{item.q}</Text>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
              </TouchableOpacity>
              {isOpen && <Text style={styles.faqAnswer}>{item.a}</Text>}
            </View>
          );
        })}
      </View>

      <Text style={styles.faqTitle}>Ainda precisa de ajuda?</Text>
      <Text style={styles.intro}>
        Envie um e-mail para suporte@zhivago.com.br descrevendo sua dúvida ou problema.
      </Text>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/termos')}>
        <Text style={styles.linkText}>Termos de Uso</Text>
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/privacidade')}>
        <Text style={styles.linkText}>Política de Privacidade</Text>
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      </TouchableOpacity>
    </LegalScreen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, color: '#444', lineHeight: 21, marginBottom: 20 },
  faqTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, marginTop: 4 },
  faqList: { marginBottom: 8 },
  faqItem: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 8 },
  faqQuestion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
  },
  faqQuestionText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginRight: 12 },
  faqAnswer: { fontSize: 13, color: '#666', lineHeight: 19, paddingBottom: 10 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  linkText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
});
