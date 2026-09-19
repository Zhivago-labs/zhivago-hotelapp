"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Plus, Upload } from "lucide-react";
import type { OwnedListing } from "@/lib/listings-api";
import { OwnerListingCard } from "./OwnerListingCard";
import styles from "@/app/dashboard/page.module.css";

type Props = {
  initialListings: OwnedListing[];
  isAgency: boolean;
  hideHeader?: boolean;
  canApproveOrgListings?: boolean;
};

export function OwnerListingsSection({
  initialListings,
  isAgency,
  hideHeader = false,
  canApproveOrgListings = false,
}: Props) {
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const approvedCount = initialListings.filter((l) => l.status === "APPROVED" || l.status === "SOLD").length;
  const pendingCount = initialListings.filter((l) => l.status === "PENDING").length;
  const draftCount = initialListings.filter((l) => l.status === "DRAFT").length;
  const rejectedCount = initialListings.filter((l) => l.status === "REJECTED").length;

  const filteredListings = initialListings.filter((listing) => {
    if (selectedStatus === "ALL") return true;
    if (selectedStatus === "APPROVED") return listing.status === "APPROVED" || listing.status === "SOLD";
    if (selectedStatus === "PENDING") return listing.status === "PENDING";
    if (selectedStatus === "DRAFT") return listing.status === "DRAFT";
    if (selectedStatus === "REJECTED") return listing.status === "REJECTED";
    return true;
  });

  return (
    <section className={styles.section}>
      {!hideHeader && (
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              <Building2 size={20} className={styles.sectionTitleIcon} />
              Meus Anúncios ({initialListings.length})
            </h2>
            <p className={styles.sectionSubtitle}>
              Gerencie o status, edite dados e acompanhe o desempenho individual de cada imóvel.
            </p>
          </div>

          <div className={styles.sectionActions}>
            {isAgency && (
              <Link href="/anuncios/importar" className={styles.secondaryLink}>
                <Upload size={15} />
                Importar em lote
              </Link>
            )}
            <Link href="/anuncios/novo" className={styles.newButton}>
              <Plus size={16} />
              Novo Anúncio
            </Link>
          </div>
        </div>
      )}

      {/* Tabs de Filtro por Status */}
      <div className={styles.tabsRow}>
        <button
          type="button"
          onClick={() => setSelectedStatus("ALL")}
          className={`${styles.tabItem} ${selectedStatus === "ALL" ? styles.tabItemActive : ""}`}
        >
          Todos <span className={styles.tabCount}>{initialListings.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus("APPROVED")}
          className={`${styles.tabItem} ${selectedStatus === "APPROVED" ? styles.tabItemActive : ""}`}
        >
          Ativos <span className={styles.tabCount}>{approvedCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus("PENDING")}
          className={`${styles.tabItem} ${selectedStatus === "PENDING" ? styles.tabItemActive : ""}`}
        >
          Em Análise <span className={styles.tabCount}>{pendingCount}</span>
        </button>
        {draftCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedStatus("DRAFT")}
            className={`${styles.tabItem} ${selectedStatus === "DRAFT" ? styles.tabItemActive : ""}`}
          >
            Rascunhos <span className={styles.tabCount}>{draftCount}</span>
          </button>
        )}
        {rejectedCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedStatus("REJECTED")}
            className={`${styles.tabItem} ${selectedStatus === "REJECTED" ? styles.tabItemActive : ""}`}
          >
            Rejeitados <span className={styles.tabCount}>{rejectedCount}</span>
          </button>
        )}
      </div>

      {filteredListings.length === 0 ? (
        <div className={styles.emptyStateContainer}>
          <p className={styles.empty}>
            {initialListings.length === 0
              ? "Você ainda não possui nenhum imóvel cadastrado. "
              : "Nenhum imóvel encontrado para este filtro. "}
            <Link href="/anuncios/novo" className={styles.link}>
              Anunciar um imóvel
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className={styles.listingsGrid}>
          {filteredListings.map((listing) => (
            <OwnerListingCard
              key={listing.id}
              listing={listing}
              canApproveOrgListings={canApproveOrgListings}
            />
          ))}
        </div>
      )}
    </section>
  );
}
