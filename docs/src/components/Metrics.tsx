/**
 * A row of stat tiles — the reusable "graphic" primitive for a light docs site.
 * Usage in an .mdx page:
 *   import Metrics from '@site/src/components/Metrics'
 *   <Metrics items={[{ v: '385', unit: 'MB', k: 'image size' }, { v: '23', k: 'apps' }]} />
 *
 * Light-only: literal colors, so the tiles cannot invert. Change the accent in
 * Metrics.module.css (or set --accent on a parent).
 */
import styles from './Metrics.module.css'

interface Item {
  v: string
  unit?: string
  k: string
}

export default function Metrics({ items }: { items: Item[] }) {
  return (
    <div className={styles.metrics}>
      {items.map((it) => (
        <div className={styles.metric} key={it.k}>
          <div className={styles.v}>
            {it.v}
            {it.unit && <span className={styles.u}>{it.unit}</span>}
          </div>
          <div className={styles.k}>{it.k}</div>
        </div>
      ))}
    </div>
  )
}
