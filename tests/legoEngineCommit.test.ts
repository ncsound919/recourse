import { describe, it, expect } from 'vitest';
import { SelfAssemblingLegoEngine } from '../src/lego/engine';

describe('Lego self-assembly commit gate (was: never commits -> registry stays 0)', () => {
  it('commits functional (sandbox-passed) assemblies once the readiness gate is high', () => {
    const engine = new SelfAssemblingLegoEngine();
    engine.setReadinessGate(0.9); // stable system
    let committed = 0;
    for (let i = 0; i < 15; i++) {
      const r = engine.assembleNewCandidate();
      if (r.committed) committed++;
    }
    expect(committed).toBeGreaterThan(0);
    expect(engine.getState().registry.length).toBeGreaterThan(0);
    expect(engine.getState().registry.length).toBe(committed);
  });

  it('does not commit when the readiness gate is low (system unstable)', () => {
    const engine = new SelfAssemblingLegoEngine();
    engine.setReadinessGate(0.2); // unstable
    let committed = 0;
    for (let i = 0; i < 15; i++) {
      if (engine.assembleNewCandidate().committed) committed++;
    }
    expect(committed).toBe(0);
  });
});
