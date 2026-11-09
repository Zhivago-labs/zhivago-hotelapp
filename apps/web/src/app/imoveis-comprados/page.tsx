import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { PurchasedProperty } from '@zhivago/shared';
import { Building2, KeyRound, MapPin, MessageCircle } from 'lucide-react';
import { requireAuth } from '@/lib/session';
import { getMyPurchases } from '@/lib/purchases-api';
import { ErrorState } from '@/components/ErrorState';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Imóveis comprados' };
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

export default async function PurchasedPropertiesPage() {
  const { token } = await requireAuth('/imoveis-comprados');
  let purchases: PurchasedProperty[] = [];
  let failed = false;
  try { purchases = await getMyPurchases(token); } catch { failed = true; }
  return <main className={styles.main}>
    <header className={styles.header}>
      <h1><KeyRound aria-hidden="true" />Imóveis comprados</h1>
      <p>Suas compras confirmadas pelo aceite de propostas de venda no Zhivago.</p>
      {!failed && <span>{purchases.length} {purchases.length === 1 ? 'imóvel comprado' : 'imóveis comprados'}</span>}
    </header>
    {failed ? <ErrorState title="Não foi possível carregar suas compras" message="Tente novamente em alguns instantes." /> : purchases.length === 0 ? (
      <section className={styles.empty}>
        <Building2 size={40} aria-hidden="true" />
        <h2>Você ainda não tem imóveis comprados</h2>
        <p>Quando uma proposta de venda for aceita, o imóvel aparecerá aqui.</p>
        <Link href="/imoveis?categoria=venda" className={styles.primary}>Explorar imóveis à venda</Link>
      </section>
    ) : <div className={styles.grid}>{purchases.map((purchase) => <article className={styles.card} key={purchase.id}>
      <div className={styles.image}>
        {purchase.listing.image ? <Image unoptimized src={purchase.listing.image} alt={purchase.listing.name} fill sizes="(max-width: 640px) 100vw, 480px" /> : <Building2 size={48} aria-hidden="true" />}
      </div>
      <div className={styles.body}>
        <span className={styles.badge}>Compra confirmada</span>
        <h2>{purchase.listing.name}</h2>
        <p className={styles.location}><MapPin size={16} aria-hidden="true" />{purchase.listing.location}</p>
        <p>{purchase.listing.bedrooms} quartos · {purchase.listing.bathrooms} banheiros · {purchase.listing.parking} vagas</p>
        <dl className={styles.details}>
          <div><dt>Valor acordado</dt><dd>{money.format(purchase.value)}</dd></div>
          <div><dt>Confirmada em</dt><dd><time dateTime={purchase.confirmedAt}>{date.format(new Date(purchase.confirmedAt))}</time></dd></div>
          {purchase.paymentMethod && <div><dt>Forma de pagamento</dt><dd>{purchase.paymentMethod}</dd></div>}
        </dl>
        <div className={styles.actions}>
          <Link className={styles.secondary} href={`/imovel/${purchase.listing.id}`}>Ver imóvel</Link>
          {purchase.conversationId && <Link className={styles.secondary} href={`/inbox/${purchase.conversationId}`}><MessageCircle size={16} aria-hidden="true" />Ver conversa</Link>}
        </div>
      </div>
    </article>)}</div>}
  </main>;
}
