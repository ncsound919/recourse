# Recourse Business Autopilot — Design Spec

**Date:** 2026-09-04
**Status:** Approved
**Author:** Recourse evolution design

## 1. Problem

Recourse today is a self-developing research substrate: it evolves sandboxed math/scientific functions, runs a dreaming loop, has a recursive learner, and self-hosts promoted tools. It does not produce customer-facing artifacts, does not understand any specific business, and has no business strategy layer.

The operator wants businesses to use Recourse to autonomously develop themselves — producing new products, strategies, tools, websites — with the goal of "set it and wake up to new X."

Three target businesses have been identified:

| Business | Product State | Web Presence | GTM |
|---|---|---|---|
| **HempForge** | Live B2B SaaS ($199/mo, Stripe wired) | **No public website** | Anchor-client pilot model |
| **Aetherdesk** | Live SaaS (rental pricing, Stripe wired) | Single static landing page with **stale pricing** | Per-customer deployment |
| **Truck Buddy** | Feature-complete beta (mock backend) | Single static page marked "Demo concept" | Beta waitlist model |

All three share the same gap: working product, no customer-facing surface that converts visitors into leads or customers.

## 2. Goals

1. **Produce real, deployable customer-facing artifacts** for each business — landing pages, ROI tools, content pages — that capture leads and accurately represent the product.
2. **Preserve Recourse's existing honesty guarantees.** No fabricated testimonials, no auto-deployed strategy, no model output that masquerades as verified.
3. **Tier autonomy by quality risk.** Code/tools (sandbox-verifiable) can run full auto. Copy/content is staged for human review. Strategy is always human-reviewed.
4. **Run one business at a time** (per operator decision). Build the system with HempForge as the first test case, then replicate to Aetherdesk and Truck Buddy.

## 3. Non-Goals

1. **Not building a generic "AI agent company."** Recourse becomes a domain-specific business autopilot, not a product someone else can buy. The three businesses are the customers.
2. **Not auto-deploying to production.** All artifacts go to `output/` for human review and manual deploy. This is a deliberate constraint, not a missing feature.
3. **Not replacing human judgment on strategy, positioning, or pricing.** Recourse synthesizes options; a human decides.
4. **Not building a SaaS platform for the autopilot itself.** This is internal tooling for the operator's three businesses.

## 4. Architecture

### 4.1 Layered Model

```
┌─────────────────────────────────────────────────────────┐
│              BUSINESS AUTOPILOT LAYER (new)              │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐   │
│  │ Business     │  │ Research   │  │ Quality Tier │   │
│  │ Profile      │─▶│ Pipeline   │─▶│ Router       │   │
│  │ Store        │  │ (web+docs) │  │              │   │
│  └──────────────┘  └────────────┘  └──────┬───────┘   │
│                                            │            │
│  ┌─────────────────────────────────────────┼────────┐  │
│  │            ARTIFACT PIPELINE            │        │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ │┌─────┐ │  │
│  │  │Landing  │ │Internal  │ │Content │ ││Strat│ │  │
│  │  │Pages    │ │Tools     │ │& SEO   │ ││Decks│ │  │
│  │  └────┬────┘ └────┬─────┘ └───┬────┘ │└──┬──┘ │  │
│  │       │            │           │       │   │    │  │
│  │  ┌────▼────┐ ┌────▼────┐ ┌───▼────┐│┌───▼───┐│  │
│  │  │STAGED   │ │SANDBOX  │ │STAGED  │││HUMAN  ││  │
│  │  │(review) │ │VERIFY   │ │(review)│││REVIEW ││  │
│  │  └─────────┘ └────┬────┘ └────────┘│└───────┘│  │
│  └───────────────────┼──────────────────┼─────────┘  │
└──────────────────────┼──────────────────┼──────────────┘
                       │                  │
              ┌────────▼────────┐  ┌──────▼───────┐
              │  output/        │  │  .selfhosted/│
              │  <business>/    │  │  tools/      │
              │  <artifact>/    │  │  (unchanged) │
              └─────────────────┘  └──────────────┘
```

The new layer sits above the existing Recourse engine. The sandbox, verifier, gene evolution, dream engine, and self-hosting layer are **not modified**. The autopilot uses them as a library where useful (e.g., for code generation tasks).

### 4.2 Components

**4.2.1 Business Profile Store** — `data/business-profiles/<business>.yaml`

YAML files are the single source of truth for each business. The schema covers:

- `business`: name, tagline, industry, website, stage (`live_product | beta | concept | idea`)
- `customer`: ICP statement, segments with pain, buying trigger, top objections
- `offering`: current product/pricing, model type, differentiators
- `gaps`: explicit list of what's missing (drives autopilot prioritization)
- `voice_and_brand`: tone (professional/casual/technical), prohibited phrases, example copy snippets

**Critical constraint:** The profile is the load-bearing input. Output quality is directly bounded by profile completeness. The first action before any artifact generation is a human-authored or human-reviewed profile.

**4.2.2 Research Pipeline** — `src/autopilot/research.ts`

For a given business:
1. Reads the business profile.
2. Ingests local documents from the business repo (README, marketing plans, pricing docs, architecture docs, key product files).
3. Performs web research via the configured `exa-search` MCP or `webfetch` for: competitor positioning, customer reviews on public forums, industry keywords, common pain points.
4. Produces `data/business-profiles/<business>/research-brief.json` with:
   - Competitor landscape (3-5 entries, each with positioning and weak points)
   - Keyword opportunities (search intent + difficulty estimate)
   - Content gaps (what competitors cover that this business doesn't)
   - Positioning options (2-3 framings, with risks noted)
   - Market sizing (rough, with caveats)

**Honest limits:** The research brief is labeled as a starting point. Qwen 4B web research is shallow; competitor claims and market data must be independently verified by a human. The brief is the system's *best guess*, not ground truth.

**4.2.3 Quality Tier Router** — `src/autopilot/qualityRouter.ts`

Maps artifact type to a quality tier:

| Tier | Artifact Types | Decision Authority | Auto-Deploy? |
|---|---|---|---|
| **A** (auto) | Code, tools, calculators, ROI scorers | Sandbox verifier passes | Yes (to `output/`) |
| **B** (staged) | Landing pages, FAQ pages, comparison pages, blog drafts | Human review before publish | No |
| **C** (human) | Strategy memos, positioning options, pricing hypotheses, GTM plans | Always human review | Never auto |

**4.2.4 Artifact Pipelines** — `src/autopilot/pipelines/`

Each pipeline is a function `generateArtifact(businessProfile, researchBrief, options) -> ArtifactBundle`.

**Landing Page Pipeline** (`landingPage.ts`):
- Reads profile + research brief
- Selects template (3 templates available: `minimal`, `feature-grid`, `story-driven`) based on profile stage
- Generates copy sections: hero, ICP, features, social proof placeholders, pricing, FAQ, CTA, footer
- Assembles HTML using the template + Tailwind CSS (via CDN for first version)
- Includes lead capture form (POSTs to configurable endpoint, defaults to mailto for offline)
- Output: `output/<business>/landing/index.html` + `assets/`
- Quality tier: B (staged)

**Internal Tools Pipeline** (`internalTool.ts`):
- Reads profile + identifies a tool opportunity (e.g., "ROI calculator for call center cost")
- Uses existing Recourse sandbox + verifier to produce a self-hosted tool
- Generates a minimal HTML UI to host the tool
- Output: `output/<business>/tools/<tool-name>/` with `index.html` + self-hosted `.mjs`
- Quality tier: A (auto via sandbox)

**Content/SEO Pipeline** (`contentPage.ts`):
- Reads research brief keyword opportunities
- Generates: FAQ pages, comparison pages, blog outlines, schema markup
- Uses templates + per-page metadata
- Output: `output/<business>/content/<type>/<slug>/`
- Quality tier: B (staged)

**Strategy Memo Pipeline** (`strategyMemo.ts`):
- Synthesizes profile + research + product docs
- Generates: positioning options, pricing hypotheses, GTM sequence, content calendar (30/60/90 day)
- Output: `output/<business>/strategy/<YYYY-MM-DD>-<topic>-memo.md`
- Quality tier: C (always human review, no auto-deploy ever)

**4.2.5 Portfolio Orchestrator** — `src/autopilot/portfolio.ts`

Manages the queue across all three businesses:
- State persisted to `data/autopilot/portfolio-state.json`
- Configurable priority by: business urgency, artifact type, last-generated timestamp
- Scheduling: hourly / daily / on-demand via `npm run autopilot`
- One business at a time (per operator decision); queues others

**4.2.6 Output Structure**

```
output/
  hempforge/
    landing/
      index.html
      assets/
      REVIEW_REQUIRED.md        # Tier B marker
      research-brief.json
    tools/
      coa-roi-calculator/
        index.html
        tool.mjs
        VERIFIED.md             # Tier A marker (sandbox pass)
    content/
      faq/
      comparison-hemptrace/
    strategy/
      2026-09-04-positioning-memo.md
      REVIEW_REQUIRED.md
  aetherdesk/
    ...
  truck-buddy/
    ...
```

## 5. Data Flow

### 5.1 First-Time Setup (per business)

```
[Operator] writes business profile YAML
    │
    ▼
[Operator] runs `npm run autopilot init --business=hempforge`
    │
    ▼
[Research Pipeline] reads profile + business repo + web
    │
    ▼
[Research Brief] written to data/business-profiles/hempforge/research-brief.json
    │
    ▼
[Operator] reviews research brief, edits if needed
    │
    ▼
Ready to generate artifacts
```

### 5.2 Artifact Generation

```
[Operator] runs `npm run autopilot generate --business=hempforge --type=landing`
    │
    ▼
[Portfolio Orchestrator] loads profile + research brief
    │
    ▼
[Quality Tier Router] assigns tier B (landing page)
    │
    ▼
[Landing Page Pipeline] selects template, generates copy
    │
    ▼
[Output] written to output/hempforge/landing/
    │
    ▼
[Operator] reviews HTML, edits if needed
    │
    ▼
[Operator] deploys manually (rsync, Vercel, Netlify — operator's choice)
```

### 5.3 Internal Tools (full auto tier)

```
[Operator] runs `npm run autopilot tool --business=hempforge --name=coa-roi-calculator --spec=...`
    │
    ▼
[Internal Tool Pipeline] uses Recourse sandbox to generate code
    │
    ▼
[Sandbox Verifier] runs property-based tests (existing Recourse system)
    │
    ▼
[If pass] Tool written to output/hempforge/tools/coa-roi-calculator/ with VERIFIED.md
    │
    ▼
[If fail] Retry up to 3x with feedback, then flag for human review
    │
    ▼
[Operator] decides whether to deploy the verified tool
```

## 6. Honest Limits & Safeguards

### 6.1 What Qwen 4B Can and Cannot Do

| Task | Qwen 4B Capability | Autopilot Tier | Safeguard |
|---|---|---|---|
| Sandboxed code generation | Strong (existing Recourse strength) | A — auto | Sandbox verifier |
| ROI calculators, scoring tools | Strong | A — auto | Sandbox verifier |
| Template-based HTML structure | Capable | B — staged | Human review |
| Landing page copy (hero, CTAs) | Weak (generic, shallow) | B — staged | Human review + copy edit |
| Blog/SEO content | Weak (factual hallucinations) | B — staged | Human review + fact-check |
| Strategy, positioning, pricing | Very weak | C — human | Never auto |
| Competitive analysis | Weak | C — human | Never auto |

### 6.2 Anti-Theater Guarantees

1. **No auto-deploy to production.** All artifacts go to `output/`. Operator decides when/if to publish.
2. **Strategy never auto-deploys.** Positioning, pricing, GTM always human-reviewed.
3. **Research brief is explicitly labeled** as a 4B-model-generated starting point, not ground truth. All competitor claims and market data require independent verification.
4. **Every artifact carries a quality tier badge** in its `REVIEW_REQUIRED.md` or `VERIFIED.md` file. Operators know at a glance what they're looking at.
5. **No fabricated testimonials.** Social proof sections use `[PLACEHOLDER: do not publish without real customer quotes]`. Recourse never generates fake reviews, fake company logos, or fake usage stats.
6. **Fact claims flagged inline.** Any numeric claim like "saves 40% on costs" is marked `[UNVERIFIED: model-generated estimate]`.
7. **No fake scarcity, no fake urgency.** No "Only 3 spots left" or countdown timers. No manufactured FOMO.
8. **Lead capture is honest.** Forms clearly state what data is collected and where it goes. No hidden tracking pixels, no third-party data sales.

### 6.3 Failure Modes the Design Explicitly Avoids

- **Generic SaaS landing page syndrome.** Template selection is informed by business profile + research brief, not random.
- **Hemingway-writes-our-copy syndrome.** Generated copy is never presented as final. Always flagged for human review.
- **The "set it and forget it" trap.** The portfolio orchestrator has a configurable cap (default: 3 artifacts per business per day) to prevent runaway generation and force review.

## 7. Startup Order

### Business 1: HempForge (most urgent gap — zero web presence)

1. **Profile authoring**: Operator writes `data/business-profiles/hempforge.yaml` based on existing README, HONEST-AUDIT.md, and pricing.ts.
2. **Research pipeline run**: Web research on hemp lab compliance software competitors (HempTrac, Canix, Confident Cannabis), keyword opportunities, content gaps.
3. **Landing page generated**: Feature-grid template, anchor-client pilot CTA, pricing ($199/mo + pilot offer).
4. **ROI calculator tool**: For a hemp lab to estimate compliance cost savings.
5. **Comparison page**: HempForge vs. alternatives (with honest disclosures about HempForge's own gaps per HONEST-AUDIT.md).
6. **FAQ page**: From research brief keyword opportunities.
7. **Strategy memo**: Positioning options for HempForge given its current state.

### Business 2: Aetherdesk

1. Profile authored from existing README, SAAS.md, and approved rental-pricing spec.
2. Research: call center SaaS competitors, rental pricing validation, content gaps.
3. Landing page: fix stale pricing (rental model, not subscription), add ICP sections.
4. ROI calculator: call center cost savings estimate.
5. Comparison page: Aetherdesk vs. Five9 / Twilio Flex / Dialpad.
6. Strategy memo: positioning for the rental model.

### Business 3: Truck Buddy

1. Profile authored from existing marketing plan and web portal.
2. Research: trucking compliance app competitors, owner-operator pain points.
3. Landing page: replace "Demo concept" with honest beta waitlist.
4. Waitlist capture with goal tracking.
5. Owner-operator FAQ.
6. Strategy memo: beta launch approach.

## 8. Testing & Verification

### 8.1 Unit Tests (vitest)

- Business profile YAML parsing and validation
- Research brief schema validation
- Quality tier routing (artifact type → tier)
- Template selection logic
- Output structure compliance

### 8.2 Integration Tests

- End-to-end: profile → research → artifact generation
- Sandbox tool generation through existing Recourse verifier
- Lead capture form submission (with mock endpoint)

### 8.3 Manual Verification Gates

- **Profile review gate**: No artifact generated until operator has reviewed the profile.
- **Research brief review gate**: No artifact generated until operator has acknowledged the brief.
- **Tier B/C review gate**: No `REVIEW_REQUIRED.md` artifact moves to "ready to deploy" without operator action.

### 8.4 Sandbox Reuse

Tier A artifacts (tools) use the existing Recourse sandbox and property-based verifier. No new verification infrastructure is built. The existing fast-check + isolated-vm + lint gate apply unchanged.

## 9. Out of Scope (v1)

- **Production deployment automation.** Operator deploys manually. v2 may add Vercel/Netlify API integration.
- **Analytics/feedback loop integration.** No automatic traffic/conversion tracking in v1. Operator wires these.
- **Multi-language support.** English only.
- **A/B testing infrastructure.** Operator can copy pages and test manually.
- **Email nurture sequences.** Not in v1. Lead capture form sends to a configurable endpoint; what happens after is the operator's CRM/email tool.
- **CRM integration.** Same as above.
- **Live chat / chatbot on generated pages.** Out of scope.
- **Strategy as deployable artifact.** Strategy memos are always files for human review.

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Qwen 4B produces generic landing pages | High | Medium | Templates, profile grounding, human review (Tier B) |
| Operator doesn't review Tier B artifacts before deploying | Medium | High | Clear REVIEW_REQUIRED.md marker; portfolio caps daily output |
| Research brief has factual errors | High | High | Explicit "starting point" labeling; operator verification required |
| Sandbox-verified tool breaks in production | Low | High | Same risk as any Recourse self-hosted tool; no new risk |
| Operator overwhelmed by 3-business portfolio | Medium | Medium | One business at a time; configurable per-business priority |
| Business profile goes stale as product evolves | Medium | Medium | Profile versioning + "last reviewed" timestamp; orchestrator flags stale profiles |

## 11. Open Questions (deferred to implementation)

- Which 3 landing page templates ship in v1? (Minimal, feature-grid, story-driven proposed; final selection in implementation.)
- Should research brief include public pricing data scraped from competitor sites? (Risky — accuracy concerns. Default: no scraping of competitor pricing; operator provides it.)
- What's the default lead capture endpoint? (mailto for offline; configurable to Supabase edge function or Netlify Forms.)
- How is the autopilot's generated copy licensed? (Operator owns all output; Recourse claims no rights.)

## 12. Definition of Done

The autopilot is done when:
1. HempForge has a deployed landing page that captures real leads.
2. HempForge has at least one sandbox-verified ROI tool deployed.
3. HempForge has a comparison page and FAQ page live.
4. Aetherdesk has a corrected landing page deployed (with rental pricing).
5. Truck Buddy has a beta waitlist page deployed.
6. The portfolio orchestrator runs `npm run autopilot` without crashing and produces reviewable output.
7. All generated artifacts carry clear quality tier markers.
8. No fabricated testimonials, fake stats, or unverifiable claims in any output.
9. The operator can deploy any Tier B artifact by reviewing the HTML and running a single command.
10. The system is documented in the operator's AGENTS.md and the user-facing README is updated.
