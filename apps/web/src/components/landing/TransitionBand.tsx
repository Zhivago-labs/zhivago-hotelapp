import shared from "./shared.module.css";
import styles from "./TransitionBand.module.css";

export function TransitionBand() {
  return (
    <div className={styles.transition}>
      <div className={shared.wrap}>
        <h2>Por trás de cada anúncio, uma imobiliária gerenciando tudo isso.</h2>
        <p>
          Organizações cadastram corretores, distribuem leads e acompanham cada negociação até o
          fechamento — sem depender de planilha.
        </p>
      </div>
    </div>
  );
}
