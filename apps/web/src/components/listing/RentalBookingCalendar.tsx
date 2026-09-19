"use client";

import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { getPublicApiUrl } from "@/lib/public-api";
import styles from "./RentalBookingCalendar.module.css";

interface BookedRange {
  startDate: string;
  endDate: string;
}

interface RentalBookingCalendarProps {
  listingId: string;
  startDate: string | null;
  endDate: string | null;
  onSelectPeriod: (start: string | null, end: string | null) => void;
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function RentalBookingCalendar({
  listingId,
  startDate,
  endDate,
  onSelectPeriod,
}: RentalBookingCalendarProps) {
  const [bookedDatesSet, setBookedDatesSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());
  const [warning, setWarning] = useState<string | null>(null);

  // Carrega as reservas confirmadas do imóvel
  useEffect(() => {
    let ignore = false;

    fetch(`${getPublicApiUrl()}/listings/${listingId}/bookings`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BookedRange[]) => {
        if (ignore) return;
        const set = new Set<string>();
        data.forEach((b) => {
          const start = new Date(b.startDate);
          const end = new Date(b.endDate);
          const cur = new Date(start);
          while (cur <= end) {
            set.add(toDateString(cur));
            cur.setDate(cur.getDate() + 1);
          }
        });
        setBookedDatesSet(set);
        setLoading(false);
      })
      .catch(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [listingId]);

  const todayStr = useMemo(() => toDateString(new Date()), []);

  const daysInMonth = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = [];

    // Dias do mês anterior para alinhar a grade
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, prevMonthDays - i);
      days.push({ dateStr: toDateString(prevDate), dayNum: prevDate.getDate(), isCurrentMonth: false });
    }

    // Dias do mês atual
    for (let i = 1; i <= totalDays; i++) {
      const curDate = new Date(year, month, i);
      days.push({ dateStr: toDateString(curDate), dayNum: i, isCurrentMonth: true });
    }

    // Dias do próximo mês para completar a última semana
    const remaining = 42 - days.length; // 6 linhas completas
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      days.push({ dateStr: toDateString(nextDate), dayNum: i, isCurrentMonth: false });
    }

    return days;
  }, [currentMonthDate]);

  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDayClick = (dateStr: string) => {
    if (bookedDatesSet.has(dateStr)) return;
    if (dateStr < todayStr) return;

    setWarning(null);

    if (!startDate || (startDate && endDate)) {
      onSelectPeriod(dateStr, null);
    } else {
      if (dateStr < startDate) {
        onSelectPeriod(dateStr, null);
      } else {
        // Verifica se há dias ocupados no intervalo selecionado
        const start = new Date(startDate);
        const end = new Date(dateStr);
        const cur = new Date(start);
        let hasBlocked = false;

        while (cur <= end) {
          if (bookedDatesSet.has(toDateString(cur))) {
            hasBlocked = true;
            break;
          }
          cur.setDate(cur.getDate() + 1);
        }

        if (hasBlocked) {
          setWarning("Existe um dia já reservado dentro do período selecionado.");
          onSelectPeriod(dateStr, null);
        } else {
          onSelectPeriod(startDate, dateStr);
        }
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.monthTitle}>
          {MONTH_NAMES[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
        </span>
        <div className={styles.navButtons}>
          <button type="button" onClick={handlePrevMonth} className={styles.navButton} title="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={handleNextMonth} className={styles.navButton} title="Próximo mês">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className={styles.weekdaysGrid}>
        {WEEKDAYS.map((w) => (
          <span key={w} className={styles.weekday}>
            {w}
          </span>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingBox}>
          <span className={styles.spinner} />
          <span>Carregando calendário…</span>
        </div>
      ) : (
        <div className={styles.daysGrid}>
          {daysInMonth.map(({ dateStr, dayNum, isCurrentMonth }) => {
            const isBooked = bookedDatesSet.has(dateStr);
            const isPast = dateStr < todayStr;
            const isStart = startDate === dateStr;
            const isEnd = endDate === dateStr;
            const isInRange = Boolean(startDate && endDate && dateStr > startDate && dateStr < endDate);
            const isDisabled = isBooked || isPast || !isCurrentMonth;

            let dayClass = styles.dayCell;
            if (!isCurrentMonth) dayClass += ` ${styles.otherMonth}`;
            if (isPast) dayClass += ` ${styles.pastDay}`;
            if (isBooked) dayClass += ` ${styles.bookedDay}`;
            if (isStart) dayClass += ` ${styles.startDay}`;
            if (isEnd) dayClass += ` ${styles.endDay}`;
            if (isInRange) dayClass += ` ${styles.inRangeDay}`;

            return (
              <button
                key={dateStr}
                type="button"
                className={dayClass}
                disabled={isDisabled}
                onClick={() => handleDayClick(dateStr)}
                title={isBooked ? "Dia já reservado" : undefined}
              >
                <span>{dayNum}</span>
                {isBooked && <Lock size={10} className={styles.lockIcon} />}
              </button>
            );
          })}
        </div>
      )}

      {warning && <p className={styles.warningText}>{warning}</p>}

      <div className={styles.legendRow}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.availableDot}`} />
          <span>Disponível</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.bookedDot}`} />
          <span>Reservado</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.selectedDot}`} />
          <span>Selecionado</span>
        </div>
      </div>
    </div>
  );
}
