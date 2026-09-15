// src/lib/synergy/domainRegistry.ts
/**
 * Sector registry. Each DomainSpec binds a sector to its real evidence
 * sources. `verified` means the sector has at least one bound real evidence
 * source (a tool domain, a corpus project, a translation engine, or series
 * terms). A sector with no evidence stays verified:false and is reported as an
 * honest empty node — never padded.
 */
import type { ToolDomain } from '../../types.js';
import type { TranslationEngineId } from '../translationBridge.js';

export interface DomainSpec {
  id: string;
  label: string;
  toolDomains: ToolDomain[];
  corpusProjects: string[];
  translationEngines: TranslationEngineId[];
  seriesTerms?: string[];
  verified: boolean;
}

export const DEFAULT_DOMAINS: DomainSpec[] = [
  { id: 'health_oncology', label: 'Health & oncology / biotech', toolDomains: ['biotech'], corpusProjects: ['overlay-oncology', 'blackmind', 'hempforge', 'cancer-pdfs'], translationEngines: [], verified: true },
  { id: 'mathematics', label: 'Mathematics', toolDomains: ['math'], corpusProjects: [], translationEngines: [], verified: true },
  { id: 'cybersecurity', label: 'Cybersecurity', toolDomains: ['cyber_defense'], corpusProjects: [], translationEngines: [], verified: true },
  { id: 'neuro_music', label: 'Neuroscience / music therapy / auditory', toolDomains: ['neuro_symbolic'], corpusProjects: [], translationEngines: [], verified: true },
  { id: 'music', label: 'Music / composition (SoundLab)', toolDomains: ['coding'], corpusProjects: [], translationEngines: [], verified: true },
  { id: 'aging', label: 'Aging / geroscience / longevity', toolDomains: ['biotech'], corpusProjects: [], translationEngines: [], seriesTerms: ['senescence', 'rapamycin', 'metformin', 'longevity', 'telomere'], verified: true },
  { id: 'sports', label: 'Sports (basketball, golf)', toolDomains: ['biotech'], corpusProjects: ['bb-tech', 'sports-science', 'golf-surgery'], translationEngines: ['bbtech', 'golf-surgery'], verified: true },
  { id: 'logistics', label: 'Logistics & freight', toolDomains: ['systemic', 'coding'], corpusProjects: ['truck-buddy'], translationEngines: [], verified: true },
];

function cloneDomain(d: DomainSpec): DomainSpec {
  return {
    ...d,
    toolDomains: [...d.toolDomains],
    corpusProjects: [...d.corpusProjects],
    translationEngines: [...d.translationEngines],
    seriesTerms: d.seriesTerms ? [...d.seriesTerms] : undefined,
  };
}

export function listDomains(): DomainSpec[] {
  return DEFAULT_DOMAINS.map(cloneDomain);
}

export function getDomain(id: string): DomainSpec | undefined {
  const found = DEFAULT_DOMAINS.find((d) => d.id === id);
  return found ? cloneDomain(found) : undefined;
}

export function unverifiedDomains(): DomainSpec[] {
  return DEFAULT_DOMAINS.filter((d) => !d.verified).map(cloneDomain);
}

export function domainsForToolDomain(td: ToolDomain): DomainSpec[] {
  return DEFAULT_DOMAINS.filter((d) => d.toolDomains.includes(td)).map(cloneDomain);
}
