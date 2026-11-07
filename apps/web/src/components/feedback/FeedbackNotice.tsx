import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Feedback.module.css";

export function FeedbackNotice({ children, kind = "error" }: { children: ReactNode; kind?: "error" | "success" | "info" }) {
  const Icon = kind === "success" ? CircleCheck : kind === "info" ? Info : CircleAlert;
  return <div className={`${styles.notice} ${kind === "success" ? styles.success : kind === "info" ? styles.info : ""}`} role={kind === "error" ? "alert" : "status"}><Icon size={17} aria-hidden="true" /><div>{children}</div></div>;
}
