import type { DailyInsightsV2, DailyInsightsV2Context } from "./schemas";

const LINK_OR_MARKUP_PATTERNS = [
  /(?:https?:\/\/|www\.)/i,
  /\b(?:mailto|javascript|data|file|ftp|tel):/i,
  /\[[^\]]+\]\([^)]+\)/,
  /<\/?[a-z][^>]*>/i,
  /\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|co|gov|edu|app|health|info)\b/i,
  /[\u0000-\u001f\u007f]/,
];
const ASSERTIVE_DIAGNOSIS_PATTERN =
  /\b(?:you\s+(?:(?:definitely|clearly|likely|probably|may|could|might)\s+)?have|you\s+(?:appear|seem)\s+to\s+have|(?:this|it)\s+(?:(?:confirms?|indicates?|means?|suggests?)(?:\s+that)?(?:\s+you\s+have)?|(?:looks|sounds|appears|seems)\s+like)|(?:(?:your|these|those|the)\s+)?(?:symptoms?|signs?|pattern|presentation)\s+(?:confirms?|indicates?|means?|suggests?|point(?:s|ed)?\s+to|are consistent with))\b.{0,40}\b(?:pcos|endometriosis|pregnan(?:cy|t)|infertility|hormonal disorder|diabetes|thyroid disorder|anemia|infection|syndrome|disease)\b/i;
const ALWAYS_PROHIBITED_MEDICAL_CLAIM_PATTERNS = [
  /\b(?:you are|you're|this confirms?|confirmed|your symptoms? confirm(?:s|ed)?)\b.{0,30}\bovulat(?:ing|ion)\b/i,
  /\b(?:will|should)\s+ovulate\b/i,
  /\b(?:fertility[- ]safe|safe for fertility|guaranteed?\s+(?:to\s+)?(?:preserve|improve|support)\s+fertility)\b/i,
  /\b(?:take|try|start|use|apply|consume)\b.{0,40}\b(?:prescription|ibuprofen|acetaminophen|paracetamol|naproxen|aspirin|metformin|birth control|antibiotic)\b/i,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s*(?:mcg|mg|milligrams?|micrograms?|tablets?|capsules?|doses?)\b/i,
  /\b(?:take|start|use|apply|consume)\b.{0,40}\b\d+(?:\.\d+)?\s*ml\b/i,
];
const SKINCARE_PROHIBITED = [
  "retinoid",
  "retinol",
  "tretinoin",
  "adapalene",
  "isotretinoin",
  "prescription",
  "hydroquinone",
  "benzoyl peroxide",
  "salicylic acid",
  "glycolic acid",
  "lactic acid",
  "azelaic acid",
  "chemical peel",
  "exfoliating acid",
  "clindamycin",
  "spironolactone",
  "topical steroid",
  "antibiotic",
  "aha",
  "bha",
  "vitamin a",
];

const DIET_PROHIBITED: Record<string, readonly string[]> = {
  vegetarian: [
    "beef",
    "chicken",
    "pork",
    "turkey",
    "lamb",
    "bacon",
    "fish",
    "salmon",
    "tuna",
    "cod",
    "sardine",
    "trout",
    "tilapia",
    "anchovy",
    "mackerel",
    "haddock",
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "mussel",
    "clam",
    "shellfish",
    "gelatin",
    "meat stock",
    "chicken stock",
    "beef stock",
  ],
  vegan: [
    "beef",
    "chicken",
    "pork",
    "turkey",
    "lamb",
    "bacon",
    "fish",
    "salmon",
    "tuna",
    "cod",
    "sardine",
    "trout",
    "tilapia",
    "anchovy",
    "mackerel",
    "haddock",
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "mussel",
    "clam",
    "shellfish",
    "milk",
    "dairy",
    "cheese",
    "yogurt",
    "cream",
    "butter",
    "egg",
    "honey",
    "gelatin",
    "whey",
    "casein",
    "ghee",
    "mayonnaise",
    "meat stock",
    "chicken stock",
    "beef stock",
  ],
  pescatarian: [
    "beef",
    "chicken",
    "pork",
    "turkey",
    "lamb",
    "bacon",
    "gelatin",
    "meat stock",
    "chicken stock",
    "beef stock",
  ],
};

const ALLERGEN_ALIASES: Record<string, readonly string[]> = {
  milk: ["milk", "dairy", "cheese", "yogurt", "cream", "butter", "whey", "casein", "ghee"],
  eggs: ["egg", "eggs", "mayonnaise"],
  peanuts: ["peanut", "peanuts", "peanut butter"],
  "tree nuts": [
    "tree nut",
    "tree nuts",
    "almond",
    "cashew",
    "walnut",
    "pecan",
    "pistachio",
    "hazelnut",
    "macadamia",
    "brazil nut",
  ],
  wheat: ["wheat"],
  soy: ["soy", "tofu", "tempeh", "edamame"],
  fish: [
    "fish",
    "salmon",
    "tuna",
    "cod",
    "sardine",
    "trout",
    "tilapia",
    "anchovy",
    "mackerel",
    "haddock",
  ],
  shellfish: ["shellfish", "shrimp", "prawn", "crab", "lobster", "mussel", "clam"],
  sesame: ["sesame", "tahini"],
};

const ALLERGEN_NAMES: Record<string, keyof typeof ALLERGEN_ALIASES> = {
  milk: "milk",
  dairy: "milk",
  egg: "eggs",
  eggs: "eggs",
  peanut: "peanuts",
  peanuts: "peanuts",
  "tree nut": "tree nuts",
  "tree nuts": "tree nuts",
  wheat: "wheat",
  soy: "soy",
  fish: "fish",
  shellfish: "shellfish",
  sesame: "sesame",
};

function normalize(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase("en-US");
}

function containsTerm(value: string, term: string): boolean {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}(?:s|es)?([^a-z]|$)`, "i").test(
    normalize(value),
  );
}

function allergenTerms(allergy: string): readonly string[] {
  return ALLERGEN_ALIASES[allergy];
}

function containsProhibitedMedicalClaim(value: string): boolean {
  if (ALWAYS_PROHIBITED_MEDICAL_CLAIM_PATTERNS.some((pattern) => pattern.test(value))) {
    return true;
  }
  const withoutConditionalCondition = value.replace(
    /\bif you\s+(?:(?:might|could|may)\s+)?have\s+(?:pcos|endometriosis|pregnan(?:cy|t)|infertility|hormonal disorder|diabetes|thyroid disorder|anemia|infection|syndrome|disease)\b/gi,
    "",
  );
  return ASSERTIVE_DIAGNOSIS_PATTERN.test(withoutConditionalCondition);
}

function parseAllergens(allergies: readonly string[]): readonly string[][] | null {
  const parsed: string[][] = [];
  for (const allergy of allergies) {
    const normalized = normalize(allergy)
      .replace(/\b(?:i am|i'm|im)\s+allergic\s+to\b/g, "")
      .replace(/\ballergic\s+to\b/g, "")
      .replace(/\b(?:food\s+)?(?:allergy|allergies|intolerance|intolerances)\b/g, "")
      .replace(/\bsevere\b/g, "");
    const parts = normalized
      .split(/[,;/]|\s+(?:and|&)\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return null;
    }
    for (const part of parts) {
      const canonical = ALLERGEN_NAMES[part];
      if (!canonical) {
        return null;
      }
      parsed.push([...allergenTerms(canonical)]);
    }
  }
  return parsed;
}

export function dailyInsightsOutputIsAllowed(
  context: DailyInsightsV2Context,
  output: DailyInsightsV2,
): boolean {
  const sectionsByKind = new Map(output.sections.map((section) => [section.kind, section]));
  if (
    output.sections.length !== context.requestedSections.length ||
    context.requestedSections.some(
      (kind, index) => output.sections[index]?.kind !== kind || !sectionsByKind.has(kind),
    )
  ) {
    return false;
  }

  const foodMissing =
    context.preferences.dietaryPreference === null || context.preferences.foodAllergies === null;
  const parsedAllergens =
    context.preferences.foodAllergies === null
      ? null
      : parseAllergens(context.preferences.foodAllergies);
  const foodAllergiesUninterpretable =
    context.preferences.foodAllergies !== null && parsedAllergens === null;
  const movementMissing =
    context.preferences.activityLevel === null ||
    context.preferences.preferredExercises === null;
  const hasSevereSymptom = context.symptoms.some(
    (symptom) => symptom.severity === "severe",
  );
  for (const section of output.sections) {
    const expectedUnavailableReason =
      section.kind === "movement" && hasSevereSymptom
        ? "safety_limit"
        : section.kind === "food" && foodMissing
          ? "missing_preferences"
          : section.kind === "food" && foodAllergiesUninterpretable
            ? "insufficient_context"
            : section.kind === "movement" && movementMissing
              ? "missing_preferences"
              : null;
    if (
      expectedUnavailableReason !== null &&
      (section.status !== "unavailable" ||
        section.unavailableReason !== expectedUnavailableReason)
    ) {
      return false;
    }
    if (
      expectedUnavailableReason === null &&
      section.status === "unavailable" &&
      section.unavailableReason === "missing_preferences"
    ) {
      return false;
    }
    if (
      section.unavailableReason === "missing_preferences" &&
      section.kind !== "food" &&
      section.kind !== "movement"
    ) {
      return false;
    }
  }

  if (hasSevereSymptom) {
    if (output.safetyMessage === null) {
      return false;
    }
    const movement = sectionsByKind.get("movement");
    if (
      movement &&
      (movement.status !== "unavailable" || movement.unavailableReason !== "safety_limit")
    ) {
      return false;
    }
  }

  const textValues = [
    output.explanation,
    output.safetyMessage ?? "",
    ...output.sections.flatMap((section) => section.suggestions),
  ];
  if (textValues.some((value) => LINK_OR_MARKUP_PATTERNS.some((pattern) => pattern.test(value)))) {
    return false;
  }
  if (textValues.some(containsProhibitedMedicalClaim)) {
    return false;
  }

  const food = sectionsByKind.get("food");
  if (food?.status === "available") {
    const foodText = food.suggestions.join(" ");
    if (/allergen[- ]free|allergy[- ]safe/i.test(foodText)) {
      return false;
    }
    for (const terms of parsedAllergens ?? []) {
      if (terms.some((term) => containsTerm(foodText, term))) {
        return false;
      }
    }
    for (const term of DIET_PROHIBITED[context.preferences.dietaryPreference ?? ""] ?? []) {
      if (containsTerm(foodText, term)) {
        return false;
      }
    }
  }

  const skincare = sectionsByKind.get("skincare");
  if (
    skincare?.status === "available" &&
    SKINCARE_PROHIBITED.some((term) => containsTerm(skincare.suggestions.join(" "), term))
  ) {
    return false;
  }

  return true;
}