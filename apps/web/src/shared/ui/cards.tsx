import { ORDER_STAGE_LABELS, type Order, type OrderStage, type Stat, type TimelineEvent } from '../../entities/domain'

export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <section className="stat-grid" aria-label="Temel performans metrikleri">
      {stats.map((item) => (
        <article key={item.label} className="glass-card stat-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.trend}</small>
        </article>
      ))}
    </section>
  )
}

export function StageTimeline({ current }: { current: OrderStage }) {
  const entries = Object.entries(ORDER_STAGE_LABELS) as [OrderStage, string][]
  const currentIndex = entries.findIndex(([stage]) => stage === current)

  return (
    <section className="glass-card panel">
      <header className="panel-header">
        <h3>Uretim asama cizelgesi</h3>
      </header>
      <ol className="timeline-grid">
        {entries.map(([stage, label], index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo'
          return (
            <li key={stage} className={`timeline-node ${state}`}>
              <span className="timeline-index">{index + 1}</span>
              <span className="timeline-label">{label}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function OrdersTable({ rows }: { rows: Order[] }) {
  return (
    <section className="glass-card panel">
      <header className="panel-header">
        <h3>Siparisler ve canli takip</h3>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Siparis No</th>
              <th>Urun</th>
              <th>Alici</th>
              <th>Uretici</th>
              <th>Asama</th>
              <th>Tahmini Teslim</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.product}</td>
                <td>{row.buyer}</td>
                <td>{row.manufacturer}</td>
                <td>{ORDER_STAGE_LABELS[row.stage]}</td>
                <td>{row.eta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ActivityFeed({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="glass-card panel">
      <header className="panel-header">
        <h3>Asama gecis kayitlari</h3>
      </header>
      <ul className="activity-feed">
        {events.map((event) => (
          <li key={`${event.stage}-${event.timestamp}`}>
            <strong>{ORDER_STAGE_LABELS[event.stage]}</strong>
            <p>{event.note}</p>
            <small>
              {event.timestamp} - {event.actor}
            </small>
          </li>
        ))}
      </ul>
    </section>
  )
}
