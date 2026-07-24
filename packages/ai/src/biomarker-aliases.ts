/**
 * Biomarker alias resolution (P0.2.a §6).
 *
 * Lab reports print biomarker names in many forms — "Testosterona Total",
 * "Testo Total", "T Total", "Total Testosterone" all mean `total_testosterone`.
 * This map resolves the printed name to a canonical `Biomarker.key` so an
 * extracted value lands on the right catalog row.
 *
 * Resolution order (see `resolveCanonicalCode`): exact catalog `key` match →
 * case-insensitive alias lookup → null (unmapped → surfaced for review, never
 * dropped). Covers the 45 seeded markers with Spanish + English variants
 * (GOLD §5.7; the app is bilingual).
 *
 * This is a data file — extend freely without code changes elsewhere.
 */

/** printed name (lowercased, trimmed) → Biomarker.key */
export const BIOMARKER_ALIASES: Readonly<Record<string, string>> = {
  // ── Hormones ──────────────────────────────────────────────────────────────
  'total testosterone': 'total_testosterone',
  'testosterona total': 'total_testosterone',
  'testo total': 'total_testosterone',
  't total': 'total_testosterone',
  'testosterone total': 'total_testosterone',
  'testosterona': 'total_testosterone',
  'testosterone': 'total_testosterone',
  'testosterona total libre': 'total_testosterone',

  'free testosterone': 'free_testosterone',
  'testosterona libre': 'free_testosterone',
  'testo libre': 'free_testosterone',
  't libre': 'free_testosterone',
  'testosterone free': 'free_testosterone',
  'ft': 'free_testosterone',

  'bioavailable testosterone': 'bioavailable_testosterone',
  'testosterona biodisponible': 'bioavailable_testosterone',
  'testo biodisponible': 'bioavailable_testosterone',

  'shbg': 'shbg',
  'sex hormone binding globulin': 'shbg',
  'globulina fijadora de hormona sexual': 'shbg',
  'gbsh': 'shbg',
  'sbhg': 'shbg',

  'albumin': 'albumin',
  'albumina': 'albumin',

  'lh': 'lh',
  'hormona luteinizante': 'lh',
  'luteinizing hormone': 'lh',

  'fsh': 'fsh',
  'hormona foliculoestimulante': 'fsh',
  'follicle stimulating hormone': 'fsh',

  'estradiol sensitive': 'estradiol_sensitive',
  'estradiol, sensitive': 'estradiol_sensitive',
  'estradiol': 'estradiol_sensitive',
  'estradiol ultrasensible': 'estradiol_sensitive',
  'e2': 'estradiol_sensitive',
  'estradiol (e2)': 'estradiol_sensitive',

  'prolactin': 'prolactin',
  'prolactina': 'prolactin',

  'dhea-s': 'dhea_s',
  'dhea s': 'dhea_s',
  'dheas': 'dhea_s',
  'dehidroepiandrosterona': 'dhea_s',
  'sulfato de dehidroepiandrosterona': 'dhea_s',
  'dhea sulfate': 'dhea_s',

  'pregnenolone': 'pregnenolone',
  'pregnenolona': 'pregnenolone',

  'cortisol am': 'cortisol_am',
  'cortisol (am)': 'cortisol_am',
  'cortisol matutino': 'cortisol_am',
  'cortisol': 'cortisol_am',

  'cortisol pm': 'cortisol_pm',
  'cortisol (pm)': 'cortisol_pm',
  'cortisol vespertino': 'cortisol_pm',

  'igf-1': 'igf_1',
  'igf 1': 'igf_1',
  'igf1': 'igf_1',
  'somatomedina c': 'igf_1',
  'insulin-like growth factor 1': 'igf_1',

  // ── Thyroid ───────────────────────────────────────────────────────────────
  'tsh': 'tsh',
  'hormona estimulante de la tiroides': 'tsh',
  'thyroid stimulating hormone': 'tsh',

  'free t3': 'free_t3',
  't3 libre': 'free_t3',
  'triiodothyronine free': 'free_t3',
  't3libre': 'free_t3',

  'free t4': 'free_t4',
  't4 libre': 'free_t4',
  'thyroxine free': 'free_t4',
  't4libre': 'free_t4',

  'reverse t3': 'reverse_t3',
  't3 reversa': 'reverse_t3',
  'rt3': 'reverse_t3',

  // ── Prostate ──────────────────────────────────────────────────────────────
  'psa': 'psa',
  'prostate specific antigen': 'psa',
  'antigeno prostatico especifico': 'psa',

  // ── CBC ───────────────────────────────────────────────────────────────────
  'hemoglobin': 'hemoglobin',
  'hemoglobina': 'hemoglobin',
  'hb': 'hemoglobin',

  'hematocrit': 'hematocrit',
  'hematocrito': 'hematocrit',
  'hto': 'hematocrit',
  'hct': 'hematocrit',

  'rbc': 'rbc',
  'red blood cells': 'rbc',
  'recuento de globulos rojos': 'rbc',
  'eritrocitos': 'rbc',

  'wbc': 'wbc',
  'white blood cells': 'wbc',
  'recuento de globulos blancos': 'wbc',
  'leucocitos': 'wbc',

  'platelets': 'platelets',
  'platelet count': 'platelets',
  'plaquetas': 'platelets',

  // ── CMP / metabolic ───────────────────────────────────────────────────────
  'alt': 'alt',
  'alanine aminotransferase': 'alt',
  'alanina aminotransferasa': 'alt',
  'sgpt': 'alt',
  'tgp': 'alt',

  'ast': 'ast',
  'aspartate aminotransferase': 'ast',
  'aspartato aminotransferasa': 'ast',
  'sgot': 'ast',
  'tgo': 'ast',

  'creatinine': 'creatinine',
  'creatinina': 'creatinine',
  'creat': 'creatinine',

  'egfr': 'egfr',
  'estimated glomerular filtration rate': 'egfr',
  'tasa de filtracion glomerular': 'egfr',

  'bun': 'bun',
  'blood urea nitrogen': 'bun',
  'nitrógeno ureico en sangre': 'bun',
  'urea': 'bun',
  'azoemia': 'bun',

  'sodium': 'sodium',
  'sodio': 'sodium',
  'na': 'sodium',

  'potassium': 'potassium',
  'potasio': 'potassium',
  'k': 'potassium',

  'globulin': 'globulin',
  'globulina': 'globulin',

  // ── Lipids ────────────────────────────────────────────────────────────────
  'hdl': 'hdl',
  'hdl cholesterol': 'hdl',
  'colesterol hdl': 'hdl',

  'ldl': 'ldl',
  'ldl cholesterol': 'ldl',
  'colesterol ldl': 'ldl',

  'triglycerides': 'triglycerides',
  'trigliceridos': 'triglycerides',
  'trig': 'triglycerides',

  'total cholesterol': 'total_cholesterol',
  'colesterol total': 'total_cholesterol',

  // ── Inflammation / iron ───────────────────────────────────────────────────
  'hs-crp': 'hscrp',
  'hscrp': 'hscrp',
  'high sensitivity c-reactive protein': 'hscrp',
  'proteina c reactiva ultrasensible': 'hscrp',
  'pcr ultrasensible': 'hscrp',
  'crp': 'hscrp',

  'ferritin': 'ferritin',
  'ferritina': 'ferritin',

  'iron': 'iron',
  'hierro': 'iron',

  // ── Vitamins / metabolic ──────────────────────────────────────────────────
  'vitamin d': 'vitamin_d',
  '25-oh vitamin d': 'vitamin_d',
  '25-hydroxy vitamin d': 'vitamin_d',
  'vitamina d': 'vitamin_d',
  '25-oh vitamina d': 'vitamin_d',

  'vitamin b12': 'vitamin_b12',
  'vitamina b12': 'vitamin_b12',
  'cobalamin': 'vitamin_b12',
  'cobalamina': 'vitamin_b12',

  'folate': 'folate',
  'folic acid': 'folate',
  'folato': 'folate',
  'acido folico': 'folate',

  'a1c': 'a1c',
  'hemoglobin a1c': 'a1c',
  'hba1c': 'a1c',
  'hemoglobina glicada': 'a1c',
  'hemoglobina glicosilada': 'a1c',

  'insulin': 'insulin',
  'insulina': 'insulin',
  'insulin (fasting)': 'insulin',

  'glucose': 'glucose',
  'glucosa': 'glucose',
  'glucose (fasting)': 'glucose',
  'glucosa en ayunas': 'glucose',
};

/**
 * Normalize a printed biomarker name for matching: lowercase, collapse spaces,
 * drop trailing qualifiers like "(suero)" or "(suero/plasma)".
 */
function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .trim();
}

/**
 * Resolve a printed biomarker name to a canonical `Biomarker.key`.
 *
 * @param printedName  the name as extracted/printed
 * @param catalogKeys  the set of valid Biomarker.keys currently seeded (so an
 *                     alias never resolves to a key that doesn't exist)
 * @returns the canonical key, or null when unmapped (caller surfaces for review)
 */
export function resolveCanonicalCode(
  printedName: string,
  catalogKeys: ReadonlySet<string>,
): string | null {
  const norm = normalizeName(printedName);
  if (!norm) return null;

  // 1. Exact catalog key match (printed name IS the machine key).
  if (catalogKeys.has(norm)) return norm;

  // 2. Alias map — guard against a stale alias pointing at an unseeded key.
  const aliased = BIOMARKER_ALIASES[norm];
  if (aliased && catalogKeys.has(aliased)) return aliased;

  // 3. Unmapped — surfaced for review downstream, never dropped.
  return null;
}
