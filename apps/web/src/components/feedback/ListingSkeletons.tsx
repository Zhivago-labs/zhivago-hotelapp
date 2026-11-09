import card from "../ListingCard.module.css";
import explorer from "../ListingsExplorer.module.css";
import styles from "./ListingSkeletons.module.css";
import loading from "./LoadingState.module.css";

export function ListingSkeletons() {
  return (
    <div role="status" aria-busy="true">
      <span className={loading.srOnly}>Carregando</span>
      <div className={`${explorer.grid} ${loading.delayed}`} aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div className={card.card} key={index}>
            <div className={`${card.imageWrap} ${styles.bone}`} />
            <div className={card.info}>
              <div className={card.tagRow}><span className={`${styles.bone} ${styles.tag}`} /></div>
              <div className={`${card.name} ${styles.bone}`} />
              <div className={`${card.location} ${styles.bone} ${styles.location}`} />
              <div className={card.amenities}><span className={`${styles.bone} ${styles.features}`} /></div>
              <div className={card.priceRow}><span className={`${styles.bone} ${styles.price}`} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
