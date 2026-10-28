/** Starlight's `<Badge text variant>`, kept as markup, drawn with Infima's badge classes. */
const variantClass = { note: 'badge--secondary', tip: 'badge--primary', success: 'badge--success', caution: 'badge--warning', danger: 'badge--danger' }
type Variant = keyof typeof variantClass

export default function Badge({ text, variant = 'note' }: { text: string; variant?: Variant }) {
  return <span className={`badge ${variantClass[variant]}`}>{text}</span>
}
