export default function ToggleButton({ active, label, onClick }) {
  return <button type="button" className={'toggle' + (active ? ' isOn' : '')} onClick={onClick} aria-label={label} aria-pressed={active}><i /></button>;
}
