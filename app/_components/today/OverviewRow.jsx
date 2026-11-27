import MaterialIcon from '../ui/MaterialIcon';
import styles from './Dashboard.module.css';

export default function OverviewRow({ icon, title, badge, description, disabled, on_open, children }) {
  return <button className={styles.overviewRow} type="button" disabled={disabled} onClick={on_open}>
    <span className={styles.toolIcon}><MaterialIcon>{icon}</MaterialIcon></span>
    <span className={styles.overviewText}>
      <span className={styles.overviewHeading}><strong>{title}</strong>{badge}</span>
      <span className={styles.overviewDescription}>{description}</span>
      {children}
    </span>
    <MaterialIcon>chevron_right</MaterialIcon>
  </button>;
}
