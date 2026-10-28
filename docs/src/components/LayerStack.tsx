/**
 * The four-layer dependency rule, drawn. Each layer depends only downward; the
 * engine never imports a game and no game imports another.
 * Light-only, literal colours in LayerStack.module.css. Greens are EDG32 roles.
 */
import clsx from 'clsx'
import styles from './LayerStack.module.css'

const layers = [
  {
    tag: 'clients / servers',
    pkgs: '@farm/client · @farm/server · @citadel/client · @hollow/client · @mathquest/client',
    note: 'Renderer + transport. Never touched by sim logic.',
    depth: 3,
  },
  {
    tag: 'game sim-cores',
    pkgs: '@farm/sim-core · @citadel/sim-core · @hollow/sim-core · @mathquest/sim-core',
    note: 'Deterministic sim. Node + browser safe. Never imports a renderer.',
    depth: 2,
  },
  {
    tag: 'engine',
    pkgs: '@engine/core · @engine/ui',
    note: 'Generic ECS, sim loop, renderer, UI. Never imports a game.',
    depth: 1,
  },
  {
    tag: 'kernels',
    pkgs: '@engine/wasm-modules',
    note: 'AssemblyScript: pathfinder · noise · rng · floodfill.',
    depth: 0,
  },
] as const

const depthClass = [styles.depth0, styles.depth1, styles.depth2, styles.depth3]

export default function LayerStack() {
  return (
    <div className={styles.layerstack}>
      {layers.map((l) => (
        <div className={clsx(styles.layer, depthClass[l.depth])} key={l.tag}>
          <div className={styles.tag}>{l.tag}</div>
          <div className={styles.body}>
            <div className={styles.pkgs}>{l.pkgs}</div>
            <div className={styles.note}>{l.note}</div>
          </div>
        </div>
      ))}
      <div className={styles.rule}>↑ imports only ever point downward &nbsp;·&nbsp; no game ever imports another</div>
    </div>
  )
}
