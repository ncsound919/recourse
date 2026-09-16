/**
 * metrics.ts — a dependency-free metrics registry with Prometheus text
 * exposition. Wave 2 of making Recourse safe to run unattended requires the
 * system to be observable without a human tailing logs; this is that surface.
 *
 * Deliberately tiny (no `prom-client`/OTel dependency): counters, gauges, and
 * fixed-bucket histograms. Deterministic rendering, label values escaped per the
 * Prometheus exposition format.
 */

export type Labels = Record<string, string | number | boolean | undefined>;

interface Series {
  /** Canonical label key -> display labels. */
  labels: Record<string, string>;
  value: number;
  /** histogram only */
  buckets?: number[];
  sum?: number;
  count?: number;
}

interface Metric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  buckets?: number[];
  series: Map<string, Series>;
}

export interface CounterHandle {
  inc(labels?: Labels, value?: number): void;
}

export interface GaugeHandle {
  set(value: number, labels?: Labels): void;
  inc(labels?: Labels, value?: number): void;
  dec(labels?: Labels, value?: number): void;
}

export interface HistogramHandle {
  observe(value: number, labels?: Labels): void;
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export function sanitizeMetricName(name: string): string {
  const n = String(name || '').trim().replace(/[^a-zA-Z0-9_:]/g, '_');
  return /^[a-zA-Z_:]/.test(n) ? n : `m_${n}`;
}

function labelKey(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}\u0000${labels[k]}`).join('\u0001');
}

function normalizeLabels(labels?: Labels): Record<string, string> {
  const out: Record<string, string> = {};
  if (!labels) return out;
  for (const [k, v] of Object.entries(labels)) {
    if (v === undefined) continue;
    out[sanitizeMetricName(k)] = String(v);
  }
  return out;
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function renderLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return `{${keys.map((k) => `${k}="${escapeLabelValue(labels[k])}"`).join(',')}}`;
}

export class MetricsRegistry {
  private readonly metrics = new Map<string, Metric>();

  private ensure(name: string, help: string, type: Metric['type'], buckets?: number[]): Metric {
    const safe = sanitizeMetricName(name);
    let m = this.metrics.get(safe);
    if (!m) {
      m = { name: safe, help, type, buckets, series: new Map() };
      this.metrics.set(safe, m);
    }
    return m;
  }

  private seriesFor(m: Metric, labels?: Labels): Series {
    const norm = normalizeLabels(labels);
    const key = labelKey(norm);
    let s = m.series.get(key);
    if (!s) {
      s = m.type === 'histogram'
        ? { labels: norm, value: 0, buckets: Array.from({ length: (m.buckets ?? DEFAULT_BUCKETS).length }, () => 0), sum: 0, count: 0 }
        : { labels: norm, value: 0 };
      m.series.set(key, s);
    }
    return s;
  }

  counter(name: string, help: string): CounterHandle {
    const m = this.ensure(name, help, 'counter');
    return {
      inc: (labels, value = 1) => {
        this.seriesFor(m, labels).value += value;
      },
    };
  }

  gauge(name: string, help: string): GaugeHandle {
    const m = this.ensure(name, help, 'gauge');
    return {
      set: (value, labels) => {
        this.seriesFor(m, labels).value = value;
      },
      inc: (labels, value = 1) => {
        this.seriesFor(m, labels).value += value;
      },
      dec: (labels, value = 1) => {
        this.seriesFor(m, labels).value -= value;
      },
    };
  }

  histogram(name: string, help: string, buckets: number[] = DEFAULT_BUCKETS): HistogramHandle {
    const m = this.ensure(name, help, 'histogram', [...buckets].sort((a, b) => a - b));
    return {
      observe: (value, labels) => {
        const s = this.seriesFor(m, labels);
        s.count = (s.count ?? 0) + 1;
        s.sum = (s.sum ?? 0) + value;
        const bs = m.buckets ?? DEFAULT_BUCKETS;
        for (let i = 0; i < bs.length; i++) {
          if (value <= bs[i]) s.buckets![i] += 1;
        }
      },
    };
  }

  /** Render all metrics in Prometheus text exposition format. */
  render(): string {
    const lines: string[] = [];
    for (const m of [...this.metrics.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`# HELP ${m.name} ${m.help}`);
      lines.push(`# TYPE ${m.name} ${m.type}`);
      const series = [...m.series.values()].sort((a, b) => labelKey(a.labels).localeCompare(labelKey(b.labels)));
      for (const s of series) {
        if (m.type === 'histogram') {
          const bs = m.buckets ?? DEFAULT_BUCKETS;
          for (let i = 0; i < bs.length; i++) {
            lines.push(`${m.name}_bucket${renderLabels({ ...s.labels, le: String(bs[i]) })} ${s.buckets![i]}`);
          }
          lines.push(`${m.name}_bucket${renderLabels({ ...s.labels, le: '+Inf' })} ${s.count ?? 0}`);
          lines.push(`${m.name}_sum${renderLabels(s.labels)} ${s.sum ?? 0}`);
          lines.push(`${m.name}_count${renderLabels(s.labels)} ${s.count ?? 0}`);
        } else {
          lines.push(`${m.name}${renderLabels(s.labels)} ${s.value}`);
        }
      }
    }
    return lines.join('\n') + (lines.length ? '\n' : '');
  }
}

/** Process-wide default registry. */
export const metrics = new MetricsRegistry();
