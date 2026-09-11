import styles from './appointments-layout.module.css';

export default function AppointmentsLayout({ children }) {
  return <div className={styles.appointmentsScope}>{children}</div>;
}
