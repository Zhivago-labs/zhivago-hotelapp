"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Star, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";
import { getPublicApiUrl } from "@/lib/public-api";
import { useChatSocket } from "@/components/chat/ChatSocketProvider";
import type { SessionUser } from "@/lib/session";
import styles from "./ListingReviews.module.css";

interface ReviewUser {
  name: string;
  avatar: string | null;
}

interface ReviewItem {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user: ReviewUser;
}

interface ListingReviewsProps {
  listingId: string;
  category: string;
  user: SessionUser | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function StarRating({ value, onChange }: { value: number; onChange?: (val: number) => void }) {
  const [hoverVal, setHoverVal] = useState<number | null>(null);

  return (
    <div className={styles.starRatingRow}>
      {[1, 2, 3, 4, 5].map((star) => {
        const activeVal = hoverVal ?? value;
        const isFilled = star <= activeVal;

        return (
          <button
            key={star}
            type="button"
            className={`${styles.starButton} ${onChange ? styles.starInteractive : ""}`}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => onChange && setHoverVal(star)}
            onMouseLeave={() => onChange && setHoverVal(null)}
            disabled={!onChange}
          >
            <Star
              size={onChange ? 24 : 16}
              className={isFilled ? styles.starFilled : styles.starEmpty}
            />
          </button>
        );
      })}
    </div>
  );
}

export function ListingReviews({ listingId, category, user }: ListingReviewsProps) {
  const { token } = useChatSocket();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Só quem tem estadia finalizada e ainda não avaliada vê o formulário (regra no servidor).
  const [canReview, setCanReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchReviews = useCallback(() => {
    fetch(`${getPublicApiUrl()}/listings/${listingId}/reviews`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setReviews(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [listingId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    if (!token || !user || category !== "aluguel") return;

    fetch(`${getPublicApiUrl()}/listings/${listingId}/reviews/eligibility`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { canReview: boolean } | null) => setCanReview(Boolean(data?.canReview)))
      .catch(() => setCanReview(false));
  }, [token, user, category, listingId]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return Number((sum / reviews.length).toFixed(1));
  }, [reviews]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Você precisa estar logado para enviar uma avaliação.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/listings/${listingId}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, comment: comment.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? data?.message ?? "Você só pode avaliar depois de concluir uma estadia neste imóvel.");
        return;
      }

      setSuccess("Sua avaliação foi enviada com sucesso!");
      setCanReview(false);
      setComment("");
      setRating(5);
      fetchReviews();
    } catch {
      setError("Falha na conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (category !== "aluguel" && reviews.length === 0) {
    return null;
  }

  return (
    <div className={styles.section} id="avaliar">
      <hr className={styles.divider} />

      <div className={styles.header}>
        <h2 className={styles.title}>Avaliações dos hóspedes</h2>
        {reviews.length > 0 && (
          <div className={styles.scoreBadge}>
            <Star size={18} className={styles.starFilled} />
            <span className={styles.scoreText}>{averageRating}</span>
            <span className={styles.countText}>({reviews.length} {reviews.length === 1 ? "avaliação" : "avaliações"})</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.loadingBox}>
          <span className={styles.spinner} />
          <span>Carregando avaliações…</span>
        </div>
      ) : reviews.length === 0 ? (
        <p className={styles.noReviews}>Nenhuma avaliação enviada para este imóvel ainda.</p>
      ) : (
        <div className={styles.reviewsGrid}>
          {reviews.map((r) => (
            <div key={r.id} className={styles.reviewCard}>
              <div className={styles.cardHeader}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    r.user.avatar ??
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user.name)}&background=f1f5f9`
                  }
                  alt={r.user.name}
                  className={styles.avatar}
                />
                <div>
                  <h4 className={styles.userName}>{r.user.name}</h4>
                  <span className={styles.date}>{formatDate(r.createdAt)}</span>
                </div>
              </div>
              <StarRating value={r.rating} />
              {r.comment && <p className={styles.comment}>{r.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {success && !canReview && (
        <div className={styles.successAlert}>
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* Formulário de avaliação: só pra quem tem estadia finalizada ainda não avaliada */}
      {category === "aluguel" && canReview && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Avaliar sua estadia</h3>
          <p className={styles.formSubtext}>
            Sua estadia neste imóvel foi finalizada. Conte como foi — sua opinião ajuda outros hóspedes!
          </p>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.ratingField}>
                <span className={styles.fieldLabel}>Sua Nota:</span>
                <StarRating value={rating} onChange={setRating} />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="reviewComment" className={styles.fieldLabel}>
                  Seu Comentário (opcional):
                </label>
                <textarea
                  id="reviewComment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Conte como foi sua experiência no imóvel…"
                  className={styles.textarea}
                  rows={3}
                />
              </div>

              {error && (
                <div className={styles.errorAlert}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className={styles.submitButton} disabled={submitting}>
                <MessageSquare size={16} />
                {submitting ? "Enviando…" : "Enviar Avaliação"}
              </button>
            </form>
        </div>
      )}
    </div>
  );
}
