import { Building2 } from "lucide-react";
import { BuildingRoleSelect } from "./BuildingRoleSelect";
import { CreateBuildingForm } from "./CreateBuildingForm";
import type { OrganizationBuilding, OrganizationMember } from "@zhivago/shared";
import styles from "./TeamSection.module.css";

/**
 * Empreendimentos da organização (seção 8/9/17 da spec) — Lead Owner e backup editáveis aqui
 * (antes só existiam como campo do schema, sem nenhum jeito de atribuir exceto o checkbox
 * "Assumir todos os Leads deste empreendimento" no cadastro de imóvel, que se recusa a
 * sobrescrever quem já é o dono). Só quem pode gerenciar a equipe (OWNER/ADMIN) edita; os demais
 * só veem.
 */
export function BuildingsSection({
  buildings,
  eligibleMembers,
  canManage,
}: {
  buildings: OrganizationBuilding[];
  eligibleMembers: OrganizationMember[];
  canManage: boolean;
}) {
  if (buildings.length === 0 && !canManage) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <Building2 size={18} className={styles.titleIcon} />
        <div>
          <h2 className={styles.sectionTitle}>Empreendimentos</h2>
          <p className={styles.sectionSubtitle}>
            Responsável exclusivo pelos Leads de cada empreendimento, e o backup dele.
          </p>
        </div>
      </div>

      {buildings.length === 0 ? (
        <p className={styles.sectionSubtitle}>Nenhum empreendimento cadastrado ainda.</p>
      ) : (
        <div className={styles.membersGrid}>
          {buildings.map((building) => (
            <div key={building.id} className={styles.memberCard}>
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>{building.name}</span>
                {building.address && <span className={styles.memberEmail}>{building.address}</span>}
                <span className={styles.memberEmail}>{building._count.listings} imóvel(is)</span>
              </div>

              {canManage ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
                    Lead Owner
                    <BuildingRoleSelect
                      buildingId={building.id}
                      field="lead-owner"
                      currentMemberId={building.leadOwnerMemberId}
                      eligibleMembers={eligibleMembers}
                    />
                  </label>
                  <label style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600 }}>
                    Backup
                    <BuildingRoleSelect
                      buildingId={building.id}
                      field="backup"
                      currentMemberId={building.backupMemberId}
                      eligibleMembers={eligibleMembers}
                    />
                  </label>
                </div>
              ) : (
                <div className={styles.memberInfo}>
                  <span className={styles.memberEmail}>Lead Owner: {building.leadOwner?.user?.name ?? "Ninguém"}</span>
                  <span className={styles.memberEmail}>Backup: {building.backupMember?.user?.name ?? "Ninguém"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && <CreateBuildingForm />}
    </section>
  );
}
