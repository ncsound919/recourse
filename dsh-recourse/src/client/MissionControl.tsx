/**
 * Recourse Mission Control -- the in-harness panel.
 *
 * This is the operator's view of the recursive engine: whether it is healthy,
 * what it is working on, and the two controls that actually advance the loop.
 *
 * Two rules govern what appears here:
 *
 * 1. **Absence is shown as absence.** A field Recourse did not return renders as
 *    `--`, never as 0. A dashboard that shows zeros for things it does not know
 *    is worse than one that admits a gap.
 * 2. **Failures are visible.** When an endpoint cannot be read the panel says so
 *    and says why, rather than freezing on the last good numbers and implying
 *    they are current.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PanelFetchError, PANEL_POLL_MS, arr, bool, num, obj, read, str, write } from './api.js';
import {
  Bar,
  Button,
  Metric,
  POSTURE_COLOR,
  TOKENS,
  dimText,
  grid,
  metricLabel,
  mono,
  panel,
  panelTitle,
  ratio,
  uptime,
  type Posture,
} from './styles.js';

/** One domain's coverage row, as Recourse reports it. */
interface DomainRow {
  readonly name: string;
  readonly activeGenes: number | undefined;
  readonly passRate: number | undefined;
  readonly broken: boolean | undefined;
  readonly note: string | undefined;
}

/** Everything one poll cycle collects. */
interface Snapshot {
  readonly generation: number | undefined;
  readonly readiness: number | undefined;
  readonly tools: number | undefined;
  readonly verifierPassRate: number | undefined;
  readonly totalUpgrades: number | undefined;
  readonly autoEvolving: boolean | undefined;
  readonly hashChainIntact: boolean | undefined;
  readonly activeAnomalies: number | undefined;
  readonly healed: number | undefined;
  readonly verifiedRepairs: number | undefined;
  readonly unverifiableRepairs: number | undefined;
  readonly repairSuccessRate: number | undefined;
  readonly model: string | undefined;
  readonly modelOnline: boolean | undefined;
  readonly uptimeSeconds: number | undefined;
  readonly domains: readonly DomainRow[];
  readonly pendingApprovals: number | undefined;
  readonly nightlyVerdict: string | undefined;
  readonly forgeAutopilot: boolean | undefined;
}

const EMPTY: Snapshot = {
  generation: undefined,
  readiness: undefined,
  tools: undefined,
  verifierPassRate: undefined,
  totalUpgrades: undefined,
  autoEvolving: undefined,
  hashChainIntact: undefined,
  activeAnomalies: undefined,
  healed: undefined,
  verifiedRepairs: undefined,
  unverifiableRepairs: undefined,
  repairSuccessRate: undefined,
  model: undefined,
  modelOnline: undefined,
  uptimeSeconds: undefined,
  domains: [],
  pendingApprovals: undefined,
  nightlyVerdict: undefined,
  forgeAutopilot: undefined,
};

/**
 * Overall posture.
 *
 * Thresholds are the ones from the mission-control spec: readiness dominates,
 * and a broken hash chain or a halted promotion gate is critical regardless of
 * how good readiness looks. Anomalies only degrade to caution when they are not
 * accompanied by verified repairs -- 97 unverified anomalies with 0 verified ones
 * is a real signal, so it must not read as green.
 */
function postureOf(snapshot: Snapshot): Posture {
  if (snapshot.hashChainIntact === false) return 'critical';
  const readiness = snapshot.readiness;
  if (readiness !== undefined && readiness < 0.6) return 'critical';
  if ((readiness !== undefined && readiness < 0.85) || (snapshot.activeAnomalies ?? 0) > 0) return 'caution';
  if (readiness === undefined) return 'caution';
  return 'nominal';
}

/** Fetch one full snapshot. */
async function loadSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const status = await read<unknown>('/api/recourse/status', signal);

  const coverage = obj(status, 'status', 'domainCoverage');
  const domains: DomainRow[] =
    coverage === undefined
      ? []
      : Object.entries(coverage).map(([name, value]) => ({
          name,
          activeGenes: num(value, 'activeGenes'),
          passRate: num(value, 'passRate'),
          broken: bool(value, 'broken'),
          note: str(value, 'note'),
        }));

  // The self-improvement and nightly endpoints are best-effort: an install that
  // has never run a nightly cycle answers 404, and that must not blank the panel.
  const [selfMod, nightly] = await Promise.all([
    read<unknown>('/api/recourse/self-improvement/status', signal).catch(() => undefined),
    read<unknown>('/api/recourse/self-improvement/report', signal).catch(() => undefined),
  ]);

  const pendingApprovals = selfMod === undefined ? undefined : arr(selfMod, 'approvals', 'pending')?.length;
  const forgeAutopilot =
    selfMod === undefined
      ? undefined
      : (bool(selfMod, 'forge', 'autopilotOn') ?? bool(selfMod, 'forgeAutopilotOn'));

  let nightlyVerdict: string | undefined;
  if (nightly !== undefined) {
    const markdown = str(nightly, 'reportMarkdown');
    nightlyVerdict = markdown
      ?.split('\n')
      .find((line) => line.startsWith('**Verdict'))
      ?.replace(/^\*\*/, '')
      .replace(/\*\*$/, '')
      .trim();
  }

  return {
    generation: num(status, 'status', 'generation'),
    readiness: num(status, 'status', 'readinessScore'),
    tools: num(status, 'status', 'registeredToolsCount'),
    verifierPassRate: num(status, 'status', 'verifierPassRate'),
    totalUpgrades: num(status, 'status', 'totalUpgrades'),
    autoEvolving: bool(status, 'status', 'isAutoEvolving'),
    hashChainIntact: bool(status, 'status', 'hashChainIntegrity'),
    activeAnomalies: num(status, 'status', 'selfRepair', 'activeAnomaliesCount'),
    healed: num(status, 'status', 'selfRepair', 'totalHealedCount'),
    verifiedRepairs: num(status, 'status', 'selfRepair', 'verifiedRepairs'),
    unverifiableRepairs: num(status, 'status', 'selfRepair', 'unverifiableRepairs'),
    repairSuccessRate: num(status, 'status', 'selfRepair', 'repairSuccessRate'),
    model: str(status, 'status', 'aiStudioModel'),
    modelOnline: bool(status, 'status', 'providerStatus', 'online'),
    uptimeSeconds: num(status, 'status', 'uptimeSeconds'),
    domains,
    pendingApprovals,
    nightlyVerdict,
    forgeAutopilot,
  };
}

/** The panel body. Exported for the slot registration in `index.tsx`. */
export function MissionControl() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const mounted = useRef(true);

  const poll = useCallback(async (signal: AbortSignal) => {
    try {
      setSnapshot(await loadSnapshot(signal));
      setError(undefined);
    } catch (cause) {
      if (signal.aborted) return;
      setError(cause instanceof PanelFetchError ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    void poll(controller.signal);
    const timer = setInterval(() => void poll(controller.signal), PANEL_POLL_MS);
    return () => {
      mounted.current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [poll]);

  /** Drive one forge cycle and report exactly what came back. */
  const runForge = useCallback(async () => {
    setBusy(true);
    setNotice(undefined);
    try {
      const result = (await write('/api/recourse/forge/run', { count: 1 })) as Record<string, unknown>;
      const ok = result?.success === true;
      setNotice(
        ok
          ? 'Forge cycle complete. Read the result with recourse_nightly_report.'
          : `Forge did not promote anything this cycle: ${result?.error ?? 'no promotion recorded'}`,
      );
      await poll(new AbortController().signal);
    } catch (cause) {
      setNotice(cause instanceof PanelFetchError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [poll]);

  const posture = useMemo(() => postureOf(snapshot), [snapshot]);
  const chainOk = snapshot.hashChainIntact !== false;

  return (
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      {/* Mission status strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          paddingBottom: 10,
          borderBottom: `1px solid ${TOKENS.border}`,
        }}
      >
        <span
          style={{
            font: '700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
            letterSpacing: '0.1em',
            color: POSTURE_COLOR[posture],
            textShadow: '0 0 8px currentColor',
          }}
        >
          {posture.toUpperCase()}
        </span>
        <span style={dimText}>MISSION STATUS</span>
        <span style={mono}>GEN {snapshot.generation ?? '--'}</span>
        <span style={mono}>E {uptime(snapshot.uptimeSeconds)}</span>
        <span style={{ ...mono, color: snapshot.autoEvolving === true ? TOKENS.nominal : TOKENS.caution }}>
          AUTO {snapshot.autoEvolving === true ? 'EVOLVING' : 'PAUSED'}
        </span>
        <span style={{ ...mono, color: chainOk ? TOKENS.nominal : TOKENS.criticalRed }}>
          CHAIN {chainOk ? 'INTACT' : 'BROKEN'}
        </span>
        <span style={{ ...mono, marginLeft: 'auto' }}>{snapshot.model ?? 'no model'}</span>
        {snapshot.modelOnline !== undefined && (
          <span style={{ color: snapshot.modelOnline ? TOKENS.nominal : TOKENS.caution }}>
            {snapshot.modelOnline ? 'online' : 'offline'}
          </span>
        )}
      </div>

      {error !== undefined && (
        <div
          style={{
            ...mono,
            color: TOKENS.criticalRed,
            border: `1px solid ${TOKENS.criticalRed}`,
            borderRadius: 4,
            padding: '8px 10px',
          }}
        >
          {error}
          <div style={dimText}>The figures below are the last successful read, not live.</div>
        </div>
      )}

      {/* Core telemetry */}
      <div style={panel}>
        <h3 style={panelTitle}>System</h3>
        <div style={grid}>
          <Metric label="generation" value={snapshot.generation?.toString() ?? '--'} />
          <Metric
            label="readiness"
            value={ratio(snapshot.readiness)}
            color={POSTURE_COLOR[posture]}
          />
          <Metric label="registry tools" value={snapshot.tools?.toString() ?? '--'} />
          <Metric label="verifier pass" value={ratio(snapshot.verifierPassRate)} />
          <Metric label="total upgrades" value={snapshot.totalUpgrades?.toString() ?? '--'} />
          <Metric
            label="pending approvals"
            value={snapshot.pendingApprovals?.toString() ?? '--'}
            color={(snapshot.pendingApprovals ?? 0) > 0 ? TOKENS.caution : undefined}
          />
        </div>
        {snapshot.readiness !== undefined && (
          <div style={{ marginTop: 10 }}>
            <Bar value={snapshot.readiness} threshold={0.85} color={POSTURE_COLOR[posture]} />
            <div style={{ ...dimText, marginTop: 4 }}>readiness vs 0.85 nominal gate</div>
          </div>
        )}
      </div>

      {/* Self repair */}
      <div style={panel}>
        <h3 style={panelTitle}>Self repair</h3>
        <div style={grid}>
          <Metric label="healed" value={snapshot.healed?.toString() ?? '--'} />
          <Metric label="active anomalies" value={snapshot.activeAnomalies?.toString() ?? '--'} />
          <Metric
            label="verified repairs"
            value={snapshot.verifiedRepairs?.toString() ?? '--'}
            color={
              snapshot.verifiedRepairs === 0 && (snapshot.activeAnomalies ?? 0) > 0 ? TOKENS.caution : undefined
            }
          />
          <Metric label="unverifiable" value={snapshot.unverifiableRepairs?.toString() ?? '--'} />
          <Metric label="repair success" value={ratio(snapshot.repairSuccessRate)} />
        </div>
        {(snapshot.activeAnomalies ?? 0) > 0 && snapshot.verifiedRepairs === 0 && (
          <div style={{ ...dimText, marginTop: 8, color: TOKENS.caution }}>
            Anomalies are being healed but none are independently verified. Treat the heal count as
            unproven until verifiedRepairs moves.
          </div>
        )}
      </div>

      {/* Domain coverage */}
      <div style={panel}>
        <h3 style={panelTitle}>Domain coverage</h3>
        {snapshot.domains.length === 0 ? (
          <div style={dimText}>No coverage data reported.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {snapshot.domains.map((domain) => (
              <div key={domain.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ ...mono, width: 130, color: domain.broken === true ? TOKENS.criticalRed : TOKENS.text }}>
                  {domain.name}
                </span>
                <span style={{ ...dimText, width: 70 }}>{domain.activeGenes ?? '--'} genes</span>
                <span style={{ flex: 1 }}>
                  <Bar
                    value={domain.passRate ?? 0}
                    color={domain.broken === true ? TOKENS.criticalRed : TOKENS.nominal}
                  />
                </span>
                <span style={{ ...mono, width: 46, textAlign: 'right' }}>{ratio(domain.passRate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loop control */}
      <div style={panel}>
        <h3 style={panelTitle}>Recursive loop</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={() => void runForge()} disabled={busy} tone="primary" title="agenda -> implement -> sandbox verify -> promote">
            {busy ? 'running forge...' : 'run forge cycle'}
          </Button>
          <span style={dimText}>
            Promotions land only when the generated code passes Recourse&apos;s sandbox and lint gate.
          </span>
        </div>
        {snapshot.nightlyVerdict !== undefined && (
          <div style={{ ...mono, marginTop: 10, color: TOKENS.violet }}>{snapshot.nightlyVerdict}</div>
        )}
        {snapshot.nightlyVerdict === undefined && (
          <div style={{ ...dimText, marginTop: 10 }}>No nightly self-improvement report recorded yet.</div>
        )}
        {notice !== undefined && (
          <div style={{ ...mono, marginTop: 10, color: TOKENS.cyan }}>{notice}</div>
        )}
      </div>
    </div>
  );
}

/** The sidebar nav glyph. Sized and highlighted by the sidebar shell. */
export function PanelIcon({ size, active }: { size: number; active: boolean }) {
  const color = active ? TOKENS.cyan : TOKENS.dim;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" role="presentation" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.4" />
      <circle cx="8" cy="8" r="2" fill={color} />
      <path d="M8 0.6v2.2M8 13.2v2.2M0.6 8h2.2M13.2 8h2.2" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export { metricLabel };