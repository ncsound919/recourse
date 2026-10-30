import { describe, it, expect, beforeEach } from 'vitest';
import { readMixingModelRegistry, writeMixingModelRegistry, readOncologyConcordanceRegistry, writeOncologyConcordanceRegistry, readSurvboardConcordanceRegistry, writeSurvboardConcordanceRegistry, readMusicTherapyConcordanceRegistry, writeMusicTherapyConcordanceRegistry, calibrateExternalScore, recordExperimentLineage, readExperimentLineage } from '../src/lib/remoteComputeIntegrations.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const tmpDir = 'C:/Users/tap45/AppData/Local/Temp/opencode/test_reg';

describe('mixing model registry', () => {
  beforeEach(() => {
    process.env.MIXING_MODEL_REGISTRY_FILE = path.join(tmpDir, 'mixing.json');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  it('reads empty by default', () => {
    const doc = readMixingModelRegistry();
    expect(doc.version).toBe(1);
    expect(doc.models).toEqual([]);
  });
  it('round-trips a record', () => {
    const doc = readMixingModelRegistry();
    doc.models.push({ jobId: 'j1', at: 1, platform: 'kaggle', finalLoss: 0.5, jsonValidity: 0.9, steps: 100, trainExamples: 50, hfRepo: 'repo', adapterPath: '/p', runtimeSec: 60, peakVramGb: 7 });
    writeMixingModelRegistry(doc);
    const doc2 = readMixingModelRegistry();
    expect(doc2.models.length).toBe(1);
    expect(doc2.models[0].jobId).toBe('j1');
    expect(doc2.models[0].jsonValidity).toBe(0.9);
  });
});

describe('oncology concordance registry', () => {
  beforeEach(() => {
    process.env.ONCOLOGY_CONCORDANCE_REGISTRY_FILE = path.join(tmpDir, 'onc.json');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  it('reads empty by default', () => {
    const doc = readOncologyConcordanceRegistry();
    expect(doc.version).toBe(1);
    expect(doc.models).toEqual([]);
  });
  it('round-trips a record', () => {
    const doc = readOncologyConcordanceRegistry();
    doc.models.push({ jobId: 'j2', at: 2, platform: 'kaggle', source: 'METABRIC', nTrain: 100, nTest: 30, coxCindex: 0.65, rsfCindex: 0.70, xgbCindex: 0.68, bestModel: 'rsf', bestCindex: 0.70, brier: 0.1, topFeatures: [{name:'age',importance:0.3}], runtimeSec: 120 });
    writeOncologyConcordanceRegistry(doc);
    const doc2 = readOncologyConcordanceRegistry();
    expect(doc2.models.length).toBe(1);
    expect(doc2.models[0].bestCindex).toBe(0.70);
    expect(doc2.models[0].bestModel).toBe('rsf');
  });
});

describe('survboard concordance registry', () => {
  beforeEach(() => {
    process.env.SURVBOARD_CONCORDANCE_REGISTRY_FILE = path.join(tmpDir, 'surv.json');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  it('reads empty by default', () => {
    const doc = readSurvboardConcordanceRegistry();
    expect(doc.version).toBe(1);
    expect(doc.models).toEqual([]);
  });
  it('round-trips a record', () => {
    const doc = readSurvboardConcordanceRegistry();
    doc.models.push({ jobId: 'j3', at: 3, platform: 'kaggle', nCancers: 6, pooledCindex: 0.72, results: { BRCA: { best_model: 'rsf', best_cindex: 0.73, cox_cindex: 0.68, rsf_cindex: 0.73, xgb_cindex: 0.70, n: 771 } }, runtimeSec: 300 });
    writeSurvboardConcordanceRegistry(doc);
    const doc2 = readSurvboardConcordanceRegistry();
    expect(doc2.models.length).toBe(1);
    expect(doc2.models[0].pooledCindex).toBe(0.72);
    expect(doc2.models[0].results.BRCA.best_cindex).toBe(0.73);
  });
});

describe('music therapy concordance registry', () => {
  beforeEach(() => {
    process.env.MUSIC_THERAPY_CONCORDANCE_REGISTRY_FILE = path.join(tmpDir, 'mt.json');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  it('reads empty by default', () => {
    const doc = readMusicTherapyConcordanceRegistry();
    expect(doc.version).toBe(1);
    expect(doc.models).toEqual([]);
  });
  it('round-trips a record', () => {
    const doc = readMusicTherapyConcordanceRegistry();
    doc.models.push({ jobId: 'j4', at: 4, platform: 'kaggle', nPatients: 500, nTrials: 2000, bestModel: 'gb', bestR2: 0.85, rfR2: 0.82, gbR2: 0.85, topFeatures: [{name:'bpm',importance:0.3}], runtimeSec: 60 });
    writeMusicTherapyConcordanceRegistry(doc);
    const doc2 = readMusicTherapyConcordanceRegistry();
    expect(doc2.models.length).toBe(1);
    expect(doc2.models[0].bestR2).toBe(0.85);
    expect(doc2.models[0].bestModel).toBe('gb');
  });
});

describe('score calibration', () => {
  it('normalizes json_validity (already 0-1)', () => {
    expect(calibrateExternalScore('json_validity', 0.9)).toBeCloseTo(0.9, 5);
    expect(calibrateExternalScore('json_validity', 1.5)).toBe(1);
    expect(calibrateExternalScore('json_validity', -0.1)).toBe(0);
  });
  it('normalizes c_index (0.5-0.85 range)', () => {
    expect(calibrateExternalScore('c_index', 0.5)).toBeCloseTo(0, 5);
    expect(calibrateExternalScore('c_index', 0.675)).toBeCloseTo(0.5, 5);
    expect(calibrateExternalScore('c_index', 0.85)).toBeCloseTo(1, 5);
  });
  it('normalizes r2 (clamp 0-1)', () => {
    expect(calibrateExternalScore('r2', 0.85)).toBeCloseTo(0.85, 5);
    expect(calibrateExternalScore('r2', -0.5)).toBe(0);
  });
  it('normalizes loss (lower is better)', () => {
    expect(calibrateExternalScore('loss', 0)).toBeCloseTo(1, 5);
    expect(calibrateExternalScore('loss', 5)).toBeCloseTo(0, 5);
  });
  it('handles NaN/Infinity', () => {
    expect(calibrateExternalScore('json_validity', NaN)).toBe(0);
    expect(calibrateExternalScore('json_validity', Infinity)).toBe(1);
  });
});

describe('experiment lineage', () => {
  beforeEach(() => {
    process.env.EXPERIMENT_LINEAGE_FILE = path.join(tmpDir, 'lineage.json');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  it('reads empty by default', () => {
    const doc = readExperimentLineage();
    expect(doc.version).toBe(1);
    expect(doc.nodes).toEqual([]);
  });
  it('records a node', () => {
    recordExperimentLineage({ id: 'n1', kind: 'test', parent: null, result: { a: 1 }, score: 0.5, delta: null, at: 1 });
    const doc = readExperimentLineage();
    expect(doc.nodes.length).toBe(1);
    expect(doc.nodes[0].id).toBe('n1');
    expect(doc.nodes[0].delta).toBeNull();
  });
  it('computes delta from parent', () => {
    recordExperimentLineage({ id: 'n1', kind: 'test', parent: null, result: {}, score: 0.5, delta: null, at: 1 });
    recordExperimentLineage({ id: 'n2', kind: 'test', parent: 'n1', result: {}, score: 0.7, delta: null, at: 2 });
    const doc = readExperimentLineage();
    expect(doc.nodes[1].delta).toBeCloseTo(0.2, 5);
  });
});
