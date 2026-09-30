export default function MaterialIcon({ children, className = '' }) {
  return <span className={`material-symbols-rounded ${className}`.trim()} aria-hidden="true">{children}</span>;
}
