import type { AgencyProfile } from "@/lib/api";

/**
 * Mesma regra do backend (PATCH /users/me/showcase): edita a vitrine o OWNER/ADMIN da organização
 * ou, sem organização, a própria conta AGENCY. O backend é quem garante — isto só decide o que mostrar.
 */
export function canEditShowcase(profile: AgencyProfile | null, viewer: { id: string; accountType?: string }): boolean {
  if (!profile) return false;
  const org = profile.organization;
  if (org) {
    const member = org.members.find((m) => m.user.id === viewer.id);
    return !!member && ["OWNER", "ADMIN"].includes(member.role);
  }
  return profile.user.id === viewer.id && viewer.accountType === "AGENCY";
}
