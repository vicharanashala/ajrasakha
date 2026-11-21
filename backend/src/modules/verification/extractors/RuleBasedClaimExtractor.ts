import {ClaimKind, DosageUnit, IClaim} from '../types/index.js';

/**
 * M1 claim extractor — pure regex, format-only.
 *
 * It recognises the *shape* of factual claims (a number followed by a unit, an
 * interval phrase, an ordinal spray count, a chemical/crop mention). It holds
 * no agricultural facts: whether "monocrotophos" is a real chemical or
 * "2 ml/L" is a safe dose is decided later, against the trusted catalogues.
 *
 * Extraction is context-free and offline — no DB, no LLM, no network.
 */
export class RuleBasedClaimExtractor {
  static readonly extractorId = 'rule-based-regex-m1';

  // ── Dosage: number + unit, e.g. "2 ml/L", "1.5 ml per litre", "500 g/acre" ──
  private static readonly DOSAGE_PATTERNS: {
    re: RegExp;
    unit: DosageUnit;
  }[] = [
    {re: /\b(\d+(?:\.\d+)?)\s*(?:ml|millilit(?:re|er)s?)\s*(?:\/|per\s+)\s*l(?:itre|iter)?s?\b/gi, unit: DosageUnit.ML_PER_L},
    {re: /\b(\d+(?:\.\d+)?)\s*(?:g|gram(?:me)?s?)\s*(?:\/|per\s+)\s*l(?:itre|iter)?s?\b/gi, unit: DosageUnit.G_PER_L},
    {re: /\b(\d+(?:\.\d+)?)\s*(?:ml|millilit(?:re|er)s?)\s*(?:\/|per\s+)\s*acres?\b/gi, unit: DosageUnit.ML_PER_ACRE},
    {re: /\b(\d+(?:\.\d+)?)\s*(?:g|gram(?:me)?s?)\s*(?:\/|per\s+)\s*acres?\b/gi, unit: DosageUnit.G_PER_ACRE},
    {re: /\b(\d+(?:\.\d+)?)\s*(?:kg|kilogram(?:me)?s?)\s*(?:\/|per\s+)\s*(?:acre|hectare)s?\b/gi, unit: DosageUnit.KG_PER_ACRE},
    {re: /\b(\d+(?:\.\d+)?)\s*(?:l|litre|liter)s?\s*(?:\/|per\s+)\s*acres?\b/gi, unit: DosageUnit.L_PER_ACRE},
    {re: /\b(\d+(?:\.\d+)?)\s*%(?:\s*(?:w\/v|v\/v|w\/w))?\b/gi, unit: DosageUnit.PERCENT},
    {re: /\b(\d+(?:\.\d+)?)\s*ppm\b/gi, unit: DosageUnit.PPM},
    // Interleaved product name: "2 ml Nominee Gold per litre", "25 ml
    // monocrotophos per litre" — the name sits between the number+unit and
    // "per litre". Without these the dose is invisible to the gate.
    {re: /\b(\d+(?:\.\d+)?)\s*ml\s+[a-z][a-z\s-]*?\s*(?:\/|per\s+)\s*l(?:itre|iter)?s?\b/gi, unit: DosageUnit.ML_PER_L},
    {re: /\b(\d+(?:\.\d+)?)\s*g\s+[a-z][a-z\s-]*?\s*(?:\/|per\s+)\s*l(?:itre|iter)?s?\b/gi, unit: DosageUnit.G_PER_L},
  ];

  // ── Intervals: "every 5 days", "repeat after 15 days", ranges "every 5-7
  //    days" — a range becomes one claim at the upper bound (conservative:
  //    review sees the longest exposure). ──
  private static readonly INTERVAL_PATTERN =
    /\b(?:every|repeat(?:\s+(?:after|in))?|after|once\s+(?:in|every)?)\s+(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s+(days?|weeks?|hours?)\b/gi;

  // ── Spray/application counts: "3 sprays", "two applications" ──
  private static readonly COUNT_WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10,
  };
  private static readonly SPRAY_COUNT_PATTERN =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:times|sprays?|applications?|rounds?|doses?)\b/gi;

  // ── Ordninals that suggest a sequence of treatments ──
  private static readonly ORDINAL_PATTERN =
    /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\b/gi;

  // ── Words that must never be treated as a chemical name. Only shape is
  // checked in this file; reality is checked against the chemical catalogue by
  // the resolver. ──
  private static readonly CHEMICAL_STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'use', 'apply', 'spray',
    'mix', 'add', 'take', 'then', 'when', 'if', 'of', 'in', 'to', 'on',
    'farmer', 'farmers', 'crop', 'crops', 'plant', 'plants', 'seed',
    'seeds', 'soil', 'water', 'morning', 'evening', 'day', 'days', 'week',
    'weeks', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
    'saturday', 'sunday', 'this', 'that', 'do', 'not', 'repeat', 'every',
    'after', 'before', 'during', 'sprays', 'note', 'warning',
    'caution', 'recommended', 'solution', 'mixture', 'dose', 'dosage',
  ]);

  /**
   * Filler tokens that sit next to a product name but are not part of it: the
   * quantifiers/prepositions that surround doses, and the formulation codes
   * that follow a concentration ("36% SL", "50 WP", "5 EC"). Token runs made
   * only of these are rejected, and they are trimmed off either end of a
   * candidate name ("monocrotophos SL" → "monocrotophos").
   */
  private static readonly FILLER_WORDS = new Set([
    'about', 'approx', 'approximately', 'around', 'roughly', 'nearly', 'at',
    'the', 'a', 'an', 'and', 'then', 'also', 'just', 'only', 'total', 'each',
    // Formulation codes: EC (emulsifiable concentrate), WP (wettable powder),
    // SL (soluble liquid), SC (suspension concentrate), WG/SG (water-dispersible
    // granule), CS, OD, ME, SP, DP, GR, WS, TB, FS, EW, GL, GP, UL, BR, DF, DG.
    'sl', 'ec', 'wp', 'sc', 'wg', 'sg', 'cs', 'od', 'me', 'sp', 'dp', 'gr',
    'ws', 'tb', 'fs', 'ew', 'gl', 'gp', 'ul', 'br', 'df', 'dg', 'tk',
    'emulsifiable', 'concentrate', 'suspension', 'granules', 'powder',
  ]);

  /**
   * Product-name shapes that legitimately contain digits: "2,4-D", "BT-77",
   * "atrazine50". Only these bypass the digit rejection below — a bare number
   * can never become a name.
   */
  private static readonly PRODUCT_SHAPE_PATTERN =
    /\b(?:\d+(?:[,\-]\d+)*\s*[-–]\s*[a-z][a-z-]*|[a-z]{2,}[-–]\d+[a-z0-9-]*|[a-z]{3,}\d+[a-z0-9-]*)\b/gi;

  /**
   * "<name> NN% <formulation code>" — the trade-name + concentration shape
   * ("monocrotophos 36% SL", "Nominee Gold 3% SL"). The name is a strong
   * chemical signal even though the digits sit between it and the dose.
   */
  private static readonly FORMULATION_NAME_PATTERN =
    /\b([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+\d+(?:\.\d+)?\s*%\s*[a-z]{1,3}\b/gi;

  extract(answerText: string): IClaim[] {
    const claims: IClaim[] = [];
    if (!answerText || !answerText.trim()) return claims;

    for (const {re, unit} of RuleBasedClaimExtractor.DOSAGE_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(answerText)) !== null) {
        claims.push({
          kind: ClaimKind.DOSAGE,
          text: m[0].trim(),
          value: parseFloat(m[1]),
          unit,
        });
      }
    }

    const intervalRe = RuleBasedClaimExtractor.INTERVAL_PATTERN;
    intervalRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = intervalRe.exec(answerText)) !== null) {
      // Normalise to days so receipts compare intervals on one scale. Ranges
      // collapse to the upper bound — the conservative choice for review.
      const amount = parseFloat(m[2] ?? m[1]);
      const unit = m[3].toLowerCase();
      const days =
        unit.startsWith('hour') ? amount / 24 : unit.startsWith('week') ? amount * 7 : amount;
      claims.push({
        kind: ClaimKind.INTERVAL,
        text: m[0].trim(),
        value: days,
        unit: 'days',
      });
    }

    const countRe = RuleBasedClaimExtractor.SPRAY_COUNT_PATTERN;
    countRe.lastIndex = 0;
    while ((m = countRe.exec(answerText)) !== null) {
      const raw = m[1].toLowerCase();
      const value = /^\d+$/.test(raw)
        ? parseInt(raw, 10)
        : RuleBasedClaimExtractor.COUNT_WORDS[raw];
      claims.push({
        kind: ClaimKind.SPRAY_COUNT,
        text: m[0].trim(),
        value,
      });
    }

    const ordRe = RuleBasedClaimExtractor.ORDINAL_PATTERN;
    ordRe.lastIndex = 0;
    while ((m = ordRe.exec(answerText)) !== null) {
      claims.push({
        kind: ClaimKind.SPRAY_COUNT,
        text: m[0].trim(),
        ordinal: m[1].toLowerCase(),
      });
    }

    const mentions = this.extractChemicalMentions(answerText);
    claims.push(...mentions);
    this.annotateDosageSubjects(claims, answerText);

    return claims;
  }

  /**
   * Attach the nearest chemical subject to each dosage claim so receipts and
   * expert evidence show which product a dose refers to. Purely positional —
   * no catalogue knowledge here. Preference order, all within the same
   * sentence: a mention inside the dosage phrase ("25 ml monocrotophos per
   * litre"), then the closest mention before the dose ("monocrotophos 36% SL
   * at 25 ml per litre"), then the closest one after it ("25 ml per litre of
   * monocrotophos"). Sentence boundaries are never crossed, so a dose in a
   * later sentence is not attributed to an earlier chemical.
   */
  private annotateDosageSubjects(claims: IClaim[], answerText: string): void {
    const lower = answerText.toLowerCase();
    const subjects = [
      ...new Set(
        claims
          .filter(c => c.kind === ClaimKind.CHEMICAL_MENTION && c.subject)
          .map(c => c.subject as string),
      ),
    ];
    if (subjects.length === 0) return;

    // Every place each subject occurs, so distances can be compared.
    const occurrences: {subject: string; index: number}[] = [];
    for (const subject of subjects) {
      let from = 0;
      let at = lower.indexOf(subject, from);
      while (at !== -1) {
        occurrences.push({subject, index: at});
        from = at + subject.length;
        at = lower.indexOf(subject, from);
      }
    }
    occurrences.sort((a, b) => a.index - b.index);

    const crossesBoundary = (a: number, b: number) =>
      /[.;!?\n]/.test(lower.slice(Math.min(a, b), Math.max(a, b)));

    const usedDosageAt = new Map<string, number>();
    for (const claim of claims) {
      if (claim.kind !== ClaimKind.DOSAGE || claim.subject) continue;
      const dosageText = claim.text.toLowerCase();
      const searchFrom = usedDosageAt.get(dosageText) ?? 0;
      let dosageIdx = lower.indexOf(dosageText, searchFrom);
      if (dosageIdx === -1) dosageIdx = lower.indexOf(dosageText);
      if (dosageIdx === -1) continue;
      usedDosageAt.set(dosageText, dosageIdx + dosageText.length);

      const inside = occurrences.find(
        o => o.index > dosageIdx && o.index < dosageIdx + dosageText.length,
      );
      const before = occurrences
        .filter(o => o.index <= dosageIdx && !crossesBoundary(o.index, dosageIdx))
        .pop();
      const after = occurrences.find(
        o =>
          o.index >= dosageIdx + dosageText.length &&
          !crossesBoundary(dosageIdx, o.index),
      );
      const nearest = inside ?? before ?? after;
      if (nearest) claim.subject = nearest.subject;
    }
  }

  /**
   * Extract candidate chemical mentions: the token run that sits immediately
   * before a dosage phrase (e.g. "monocrotophos" in "monocrotophos 25 ml per
   * litre"), a name followed by a concentration + formulation code
   * ("monocrotophos 36% SL"), or a standalone product shape ("2,4-D",
   * "BT-77"). Leading instruction verbs and filler/formulation tokens are
   * stripped, digits inside a plain name are rejected, and the subject is
   * normalised (trimmed, lowercased) for catalogue lookup. Precision is not the
   * extractor's job — unknown names resolve to NOT_FOUND and escalate to
   * review.
   */
  extractChemicalMentions(answerText: string): IClaim[] {
    const mentions: IClaim[] = [];
    const seen = new Set<string>();

    const pushMention = (raw: string, options: {allowDigits?: boolean} = {}) => {
      let subject = raw.trim().toLowerCase().replace(/[.,;:]+$/, '');
      // Strip leading instruction verbs ("use", "apply", "spray with"…).
      subject = subject.replace(/^(?:and\s+|then\s+)*(?:use|apply|spray|mix|add|take|give|using|applied|spraying|applies)\s+(?:with\s+|of\s+)?/, '');
      // Trim filler/formulation tokens off either end ("sl at" → "",
      // "monocrotophos sl" → "monocrotophos").
      const tokens = subject.split(/\s+/).filter(Boolean);
      while (tokens.length && RuleBasedClaimExtractor.FILLER_WORDS.has(tokens[0])) tokens.shift();
      while (tokens.length && RuleBasedClaimExtractor.FILLER_WORDS.has(tokens[tokens.length - 1])) tokens.pop();
      subject = tokens.join(' ');
      if (!subject || subject.length < 3) return;
      // A plain chemical name cannot contain digits ("25"/"2" from the dose
      // leaked in) — only product shapes like "2,4-D" opt in via allowDigits.
      if (!options.allowDigits && /\d/.test(subject)) return;
      if (RuleBasedClaimExtractor.CHEMICAL_STOPWORDS.has(subject)) return;
      if (seen.has(subject)) return;
      seen.add(subject);
      mentions.push({
        kind: ClaimKind.CHEMICAL_MENTION,
        text: raw.trim(),
        subject,
      });
    };

    // 1. The word run directly before a dosage phrase — strong chemical signal.
    //    ([1] = words, [2] = the dosage number) — digits are excluded from the
    //    name run so "monocrotophos 25 ml/L" captures "monocrotophos", while
    //    "25 ml/L" alone captures nothing. A trailing "per litre"/"per acre"
    //    after the unit does not block the match ("25 ml monocrotophos per
    //    litre" → "monocrotophos").
    const beforeDosage =
      /([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)\s+(\d+(?:\.\d+)?)\s*(?:ml|millilit(?:re|er)s?|g|gram(?:me)?s?|kg|kilogram(?:me)?s?|l|litre|liter)s?\b(?:\s*(?:\/|per)\s*(?:l(?:itre|iter)?s?|acre|hectare)s?)?/gi;
    let m: RegExpExecArray | null;
    while ((m = beforeDosage.exec(answerText)) !== null) {
      pushMention(m[1]);
    }

    // 1b. A trade name followed by a concentration + formulation code
    //     ("monocrotophos 36% SL at 25 ml per litre") — the digits sit between
    //     the name and the dose, so pass 1 alone cannot see the name.
    const formulation = RuleBasedClaimExtractor.FORMULATION_NAME_PATTERN;
    while ((m = formulation.exec(answerText)) !== null) {
      pushMention(m[1]);
    }

    // 2. Product-name shapes ("BT-77", "2,4-D", "atrazine50"). These may
    //    contain digits — the only mentions allowed to.
    const productShape = RuleBasedClaimExtractor.PRODUCT_SHAPE_PATTERN;
    while ((m = productShape.exec(answerText)) !== null) {
      pushMention(m[0], {allowDigits: true});
    }

    // 3. "… of/with/using <name>" after a dosage phrase ("25 ml per litre of
    //    monocrotophos"). Stopwords reject filler like "of water".
    const ofPattern = /\b(?:of|with|using)\s+([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)/gi;
    while ((m = ofPattern.exec(answerText)) !== null) {
      pushMention(m[1]);
    }

    // 4. The name inside an interleaved dosage phrase — "25 ml monocrotophos
    //    per litre", "2 ml Nominee Gold per litre". Number+unit first, name
    //    second, then the rate denominator.
    const interleaved =
      /\b\d+(?:\.\d+)?\s*(?:ml|millilit(?:re|er)s?|g|gram(?:me)?s?|kg|kilogram(?:me)?s?|l|litre|liter)s?\s+([a-z][a-z\s-]*?)\s*(?:\/|per\s+)\s*(?:l(?:itre|iter)?s?|acre|hectare)s?\b/gi;
    while ((m = interleaved.exec(answerText)) !== null) {
      pushMention(m[1]);
    }

    return mentions;
  }
}
