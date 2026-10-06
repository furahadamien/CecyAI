export const SYMPTOM_CATALOG_HEADER = "X-Cecy-Symptom-Catalog-Version";

export const LEGACY_SYMPTOM_CODES = [
  "cramps",
  "headache",
  "bloating",
  "fatigue",
  "mood_change",
  "acne",
  "back_pain",
  "breast_tenderness",
  "nausea",
  "cravings",
  "sleep_change",
  "low_energy",
  "digestive_change",
] as const;

export const EXPANDED_SYMPTOM_CODES = [
  ...LEGACY_SYMPTOM_CODES,
  "pelvic_pain",
  "joint_pain",
  "muscle_aches",
  "breast_swelling",
  "anxiety",
  "irritability",
  "low_mood",
  "mood_swings",
  "difficulty_concentrating",
  "brain_fog",
  "insomnia",
  "dizziness",
  "constipation",
  "diarrhea",
  "appetite_changes",
  "vomiting",
  "oily_skin",
  "dry_skin",
  "hair_changes",
  "hot_flashes",
  "night_sweats",
  "discharge_changes",
  "vaginal_dryness",
  "vaginal_itching",
  "urinary_discomfort",
  "libido",
] as const;

export type SymptomCatalogVersion = 1 | 2;
export type LegacySymptomCode = (typeof LEGACY_SYMPTOM_CODES)[number];
export type ExpandedSymptomCode = (typeof EXPANDED_SYMPTOM_CODES)[number];

export type CatalogVersionResult =
  | { success: true; version: SymptomCatalogVersion }
  | { success: false; message: string };

export function parseSymptomCatalogVersion(value: string | null | undefined): CatalogVersionResult {
  if (value === null || value === undefined) {
    return { success: true, version: 1 };
  }
  if (value === "1" || value === "2") {
    return { success: true, version: Number(value) as SymptomCatalogVersion };
  }
  return {
    success: false,
    message: `${SYMPTOM_CATALOG_HEADER} must be 1 or 2`,
  };
}

export function symptomCodesForVersion(
  version: SymptomCatalogVersion,
): typeof LEGACY_SYMPTOM_CODES | typeof EXPANDED_SYMPTOM_CODES {
  return version === 1 ? LEGACY_SYMPTOM_CODES : EXPANDED_SYMPTOM_CODES;
}

export function isSymptomCode(
  value: unknown,
  version: SymptomCatalogVersion,
): value is ExpandedSymptomCode {
  return (
    typeof value === "string" &&
    (symptomCodesForVersion(version) as readonly string[]).includes(value)
  );
}