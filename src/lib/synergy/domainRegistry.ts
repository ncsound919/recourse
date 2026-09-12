// src/lib/synergy/domainRegistry.ts
/**
 * Sector registry. Each DomainSpec binds a sector to its real evidence
 * sources. A sector with no source stays verified:false and is reported as an
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
  { id: 'aging', label: 'Aging / geroscience / longevity', toolDomains: ['biotech'], corpusProjects: [], translationEngines: [], seriesTerms: ['senescence', 'rapamycin', 'metformin', 'longevity', 'telomere'], verified: true },
  { id: 'sports', label: 'Sports (basketball, golf)', toolDomains: ['biotech'], corpusProjects: ['bb-tech', 'sports-science', 'golf-surgery'], translationEngines: ['bbtech', 'golf-surgery'], verified: true },
  { id: 'logistics', label: 'Logistics & freight', toolDomains: ['systemic', 'coding'], corpusProjects: ['truck-buddy'], translationEngines: [], verified: true },
];

export function listDomains(): DomainSpec[] {
  return [...DEFAULT_DOMAINS];
}

export function getDomain(id: string): DomainSpec | undefined {
  return DEFAULT_DOMAINS.find((d) => d.id === id);
}

export function unverifiedDomains(): DomainSpec[] {
  return DEFAULT_DOMAINS.filter((d) => !d.verified);
}

export function domainsForToolDomain(td: ToolDomain): DomainSpec[] {
  return DEFAULT_DOMAINS.filter((d) => d.toolDomains.includes(td));
}
