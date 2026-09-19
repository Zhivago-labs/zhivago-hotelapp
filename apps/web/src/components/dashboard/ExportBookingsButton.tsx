"use client";

import { Download } from "lucide-react";
import type { ReceivedBooking } from "@/lib/listings-api";
import styles from "./ExportBookingsButton.module.css";

function formatDateBR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function translateStatus(status: string): string {
  switch (status) {
    case "CONFIRMED":
    case "APPROVED":
      return "Confirmada";
    case "PENDING":
      return "Pendente";
    case "REJECTED":
      return "Recusada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

export function ExportBookingsButton({ bookings }: { bookings: ReceivedBooking[] }) {
  const handleExport = () => {
    if (!bookings || bookings.length === 0) {
      alert("Nenhuma reserva disponível para exportação.");
      return;
    }

    const headers = ["ID da Reserva", "Imóvel", "Hóspede", "Início", "Fim", "Status", "Preço por Noite"];
    const rows = bookings.map((b) => [
      b.id,
      `"${(b.listing?.name || "Imóvel").replace(/"/g, '""')}"`,
      `"${(b.user?.name || "Hóspede").replace(/"/g, '""')}"`,
      formatDateBR(b.startDate),
      formatDateBR(b.endDate),
      translateStatus(b.status),
      b.listing?.price ? `R$ ${b.listing.price.toLocaleString("pt-BR")}` : "N/A",
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio-reservas-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button type="button" onClick={handleExport} className={styles.button} title="Exportar relatório das reservas em CSV">
      <Download size={16} />
      Exportar CSV
    </button>
  );
}
