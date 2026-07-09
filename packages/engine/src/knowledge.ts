/**
 * Knowledge-base enrichment (Goal 1.3).
 *
 * For each finding, query the deterministic KB (@trt/kb) for cited reference
 * passages about the relevant biomarker/topic, and attach them as
 * `finding.references`. Determinism is preserved: the same findings + KB always
 * produce the same references, which fold into the report hash.
 *
 * The KB search function is INJECTED (not imported) so the engine stays a pure,
 * testable, model-free package. The web app wires it to @trt/kb at call time.
 */
import type { Finding } from './types';

export type KbReference = {
  documentTitle: string;
  page: number | null;
  excerpt: string;
};

/** A deterministic KB search function: query → cited passages. */
export type KbSearchFn = (query: string, k?: number) => KbReference[];

/** Map a biomarker key → a KB-friendly search phrase. */
const SEARCH_PHRASES: Record<string, string> = {
  total_testosterone: 'total testosterone reference range',
  free_testosterone: 'free testosterone',
  bioavailable_testosterone: 'bioavailable testosterone',
  shbg: 'sex hormone binding globulin SHBG',
  lh: 'luteinizing hormone LH',
  fsh: 'follicle stimulating hormone FSH',
  estradiol_sensitive: 'estradiol estrogen',
  prolactin: 'prolactin',
  hematocrit: 'hematocrit polycythemia blood',
  hemoglobin: 'hemoglobin',
  psa: 'PSA prostate specific antigen',
  alt: 'ALT liver enzymes alanine aminotransferase',
  ast: 'AST liver enzymes',
  egfr: 'eGFR kidney function glomerular',
  creatinine: 'creatinine kidney',
  ldl: 'LDL cholesterol',
  hdl: 'HDL cholesterol',
  triglycerides: 'triglycerides lipids',
  a1c: 'hemoglobin A1C glucose',
  glucose: 'glucose blood sugar insulin',
  insulin: 'insulin resistance',
  cortisol_am: 'cortisol stress hormone',
  tsh: 'TSH thyroid',
  free_t3: 'free T3 thyroid',
  free_t4: 'free T4 thyroid',
};

/**
 * Enrich findings with cited KB references. Pure & deterministic given the same
 * findings + search function.
 */
export function enrichWithKnowledge(findings: Finding[], search: KbSearchFn): Finding[] {
  return findings.map((f) => {
    if (!f.biomarkerKey) return f;
    const phrase = SEARCH_PHRASES[f.biomarkerKey];
    if (!phrase) return f;
    try {
      const hits = search(phrase, 2);
      if (hits.length === 0) return f;
      return {
        ...f,
        references: hits.map((h) => ({
          documentTitle: h.documentTitle,
          page: h.page,
          excerpt: truncate(h.excerpt, 280),
        })),
      };
    } catch {
      return f; // KB unavailable — never break the report
    }
  });
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…';
}

// ── Knowledge-graph enrichment (Goal 2 — async, optional) ────────────────────

/** An async graph-fact search: query → relationship facts. */
export type GraphSearchFn = (query: string, k?: number) => Promise<string[]>;

/**
 * Enrich findings with relationship facts from the knowledge graph. Async,
 * graceful — if the graph is unavailable/empty, findings pass through unchanged.
 */
export async function enrichWithGraph(findings: Finding[], search: GraphSearchFn): Promise<Finding[]> {
  const enriched = await Promise.all(
    findings.map(async (f) => {
      if (!f.biomarkerKey) return f;
      const phrase = SEARCH_PHRASES[f.biomarkerKey];
      if (!phrase) return f;
      try {
        const facts = await search(phrase, 3);
        if (facts.length === 0) return f;
        return { ...f, graphFacts: facts.slice(0, 3) };
      } catch {
        return f; // graph unavailable — never break the report
      }
    }),
  );
  return enriched;
}
