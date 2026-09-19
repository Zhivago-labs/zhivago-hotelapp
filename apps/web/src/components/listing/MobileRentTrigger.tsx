"use client";

import { useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { BookingRequestForm } from "./BookingRequestForm";
import styles from "./MobileRentTrigger.module.css";

export function MobileRentTrigger({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <CalendarRange size={18} />
        Alugar
      </button>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.header}>
              <h3 className={styles.title}>Reservar imóvel</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} title="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className={styles.content}>
              <BookingRequestForm listingId={listingId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
