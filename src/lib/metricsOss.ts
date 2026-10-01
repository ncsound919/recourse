// src/lib/metricsOss.ts
//
// prom-client backed metrics registry. Drop-in replacement for the custom
// MetricsRegistry in metrics.ts — same interface, mature OSS implementation.
// Counters, gauges, histograms, and Prometheus exposition via prom-client.

import promClient from 'prom-client';

export interface MetricLabels {
  [key: string]: string | number;
}

export interface HistogramLabels {
  [key: string]: string | number;
}

export class OssMetricsRegistry {
  private registry: promClient.Registry;
  private counters: Map<string, promClient.Counter> = new Map();
  private gauges: Map<string, promClient.Gauge> = new Map();
  private histograms: Map<string, promClient.Histogram> = new Map();

  constructor() {
    this.registry = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: this.registry });
  }

  counter(name: string, help: string, labelNames: string[] = []): promClient.Counter {
    if (!this.counters.has(name)) {
      const counter = new promClient.Counter({ name, help, labelNames, registers: [this.registry] });
      this.counters.set(name, counter);
    }
    return this.counters.get(name)!;
  }

  gauge(name: string, help: string, labelNames: string[] = []): promClient.Gauge {
    if (!this.gauges.has(name)) {
      const gauge = new promClient.Gauge({ name, help, labelNames, registers: [this.registry] });
      this.gauges.set(name, gauge);
    }
    return this.gauges.get(name)!;
  }

  histogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): promClient.Histogram {
    if (!this.histograms.has(name)) {
      const histogram = new promClient.Histogram({
        name,
        help,
        labelNames,
        buckets: buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        registers: [this.registry],
      });
      this.histograms.set(name, histogram);
    }
    return this.histograms.get(name)!;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  resetMetrics(): void {
    this.registry.resetMetrics();
  }
}

export function createOssMetricsRegistry(): OssMetricsRegistry {
  return new OssMetricsRegistry();
}
