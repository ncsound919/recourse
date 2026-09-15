import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, Download, AlertTriangle, Image as ImageIcon, Layers } from 'lucide-react';

interface VizScene {
  id: string;
  title: string;
  category: string;
  source: string;
  adapted: boolean;
  note: string;
  default_params: Record<string, unknown>;
}

interface HealthState {
  online: boolean;
  service?: string;
  matplotlib?: string;
  numpy?: string;
  error?: string | null;
}

interface RenderState {
  id?: string;
  title?: string;
  source?: string;
  adapted?: boolean;
  note?: string;
  image?: string;
  metrics?: Record<string, unknown>;
  error?: string;
}

export const DataVizView: React.FC = () => {
  const [scenes, setScenes] = useState<VizScene[]>([]);
  const [health, setHealth] = useState<HealthState>({ online: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [render, setRender] = useState<RenderState | null>(null);
  const [rendering, setRendering] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [h, c] = await Promise.all([
        fetch('/api/recourse/viz/sidecar').then((x) => x.json()),
        fetch('/api/recourse/viz/catalog').then((x) => x.json()),
      ]);
      setHealth({ online: !!h?.online, service: h?.service, matplotlib: h?.matplotlib, numpy: h?.numpy, error: h?.error ?? null });
      const list = (c?.scenes ?? []) as VizScene[];
      setScenes(list);
      if (!selected && list.length > 0) setSelected(list[0].id);
    } catch {
      setHealth({ online: false, error: 'unreachable' });
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  const renderScene = useCallback(async (id: string) => {
    if (!id) return;
    setRendering(true);
    setRender({ id });
    try {
      const res = await fetch('/api/recourse/viz/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, width: 820, height: 600 }),
      });
      const data = await res.json();
      if (data?.ok) {
        setRender({ id, title: data.title, source: data.source, adapted: data.adapted, note: data.note, image: data.image, metrics: data.metrics });
      } else {
        setRender({ id, error: data?.error ?? 'render failed' });
      }
    } catch (err: any) {
      setRender({ id, error: err?.message ?? 'render failed' });
    } finally {
      setRendering(false);
    }
  }, []);

  const pick = (id: string) => {
    setSelected(id);
    renderScene(id);
  };

  const categories = Array.from(new Set(scenes.map((s) => s.category))).sort();

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header / health */}
      <div className="rounded-2xl border border-indigo-900/60 bg-gradient-to-br from-slate-950 via-slate-900/90 to-indigo-950/40 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-300" />
            <h2 className="font-bold tracking-wide">DATA VISUALIZER SIDECAR</h2>
          </div>
          <button onClick={refresh} className="text-slate-400 hover:text-white transition" title="Refresh now">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[12px] text-slate-400 mt-1">
          Renders a curated subset of the <span className="font-mono">Data_Visualization-main</span> teaching scripts
          (3D math / physics / statistics) with the matplotlib Agg backend. Every PNG is real matplotlib output over real
          math — nothing fabricated. Sidecar: <span className="font-mono">python/viz_service</span>.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono border ${health.online ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800' : 'text-rose-300 bg-rose-950/40 border-rose-800'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${health.online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {health.online ? 'ONLINE' : 'OFFLINE'}
          </span>
          {health.online && (
            <span className="text-[11px] font-mono text-slate-400">
              matplotlib {health.matplotlib} · numpy {health.numpy} · {scenes.length} scenes
            </span>
          )}
          {!health.online && (
            <span className="text-[11px] text-rose-300 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {health.error ?? 'sidecar down'} — images are NOT fabricated here.
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Scene catalog */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm tracking-wide">CATALOG ({scenes.length})</h3>
          </div>
          {categories.map((cat) => (
            <div key={cat} className="mb-3">
              <div className="text-[10px] font-mono uppercase text-slate-500 mb-1.5 px-1">{cat}</div>
              <div className="space-y-1">
                {scenes.filter((s) => s.category === cat).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pick(s.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition ${selected === s.id ? 'bg-indigo-950/60 border-indigo-700' : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-mono text-slate-200 truncate">{s.title}</span>
                      {s.adapted && (
                        <span className="shrink-0 rounded px-1 border text-[9px] font-mono text-amber-300 bg-amber-950/40 border-amber-800" title={s.note}>
                          ADAPTED
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">{s.source}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {scenes.length === 0 && <div className="text-slate-500 text-sm">Catalog empty — sidecar offline or no scenes.</div>}
        </div>

        {/* Render panel */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-slate-400" />
              <h3 className="font-bold text-sm tracking-wide">RENDER</h3>
            </div>
            {render?.image && (
              <a
                href={`data:image/png;base64,${render.image}`}
                download={`${render.id ?? 'viz'}.png`}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-indigo-300 hover:text-white"
              >
                <Download className="w-3.5 h-3.5" /> PNG
              </a>
            )}
          </div>

          {rendering && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin" /> rendering…
            </div>
          )}

          {!rendering && render?.error && (
            <div className="text-rose-300 text-sm bg-rose-950/30 border border-rose-800/50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 inline mr-1.5" /> {render.error}
            </div>
          )}

          {!rendering && render?.image && (
            <>
              <img
                src={`data:image/png;base64,${render.image}`}
                alt={render.title ?? render.id}
                className="w-full rounded-lg border border-slate-800 bg-slate-900"
              />
              <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] font-mono">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-200">{render.title}</span>
                  {render.source && <span className="text-slate-500">source: {render.source}</span>}
                  {typeof render.adapted === 'boolean' && (
                    <span className={render.adapted ? 'text-amber-300' : 'text-emerald-300'}>
                      {render.adapted ? 'adapted (see note)' : 'as-authored'}
                    </span>
                  )}
                </div>
                {render.note && <div className="text-slate-500">{render.note}</div>}
                {render.metrics && Object.keys(render.metrics).length > 0 && (
                  <pre className="bg-slate-900/70 border border-slate-800 rounded p-2 text-[10px] text-slate-400 overflow-x-auto">
                    {JSON.stringify(render.metrics, null, 2)}
                  </pre>
                )}
              </div>
            </>
          )}

          {!rendering && !render && (
            <div className="text-slate-500 text-sm py-16 text-center">Select a scene from the catalog to render it.</div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-slate-600">
        Honest scope: these scenes are fixed teaching scenarios (each script hardcodes its own data/formula). They are
        not yet parameterized "visualize Recourse's data" endpoints — that is a separate, future capability.
      </p>
    </div>
  );
};