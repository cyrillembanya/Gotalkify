/**
 * Chat safety rules — the catalogue of things that must never travel between
 * a student and a tutor, and the matcher that finds them.
 *
 * This file is pure: no Convex, no database. `convex/moderation.js` loads the
 * admin-editable rows on top of it and decides what to do with a hit; the
 * admin screen reads the same catalogue to seed and label rules.
 *
 * Three severities, in order:
 *   "flag"          – the message goes through, an admin sees it afterwards.
 *   "block_message" – the message is refused; the sender and the tutor are
 *                     told to contact GoTalkify support.
 *   "block_chat"    – the message is refused *and* the whole chat is closed;
 *                     both people are emailed to contact the help desk and the
 *                     safety contact is notified.
 *
 * Matching runs on a de-obfuscated copy of the text (leetspeak folded back to
 * letters) so "f4ck" and "s.e.x" are caught, while word boundaries keep
 * "class", "Sussex" and "assassin" out of it. Regex rules run on the raw text,
 * because an email address or a phone number is written in plain characters.
 */

export const CATEGORIES = {
  personal_info: {
    label: "Personal information",
    description:
      "Email addresses and phone numbers. Sharing these closes the chat and alerts the safety contact.",
  },
  contact_evasion: {
    label: "Off-platform contact",
    description:
      "Attempts to move the conversation to WhatsApp, Telegram, social handles and the like.",
  },
  profanity: {
    label: "Vulgar language",
    description: "Swearing and insults aimed at the other person.",
  },
  hate: {
    label: "Racial / hateful language",
    description:
      "Racial slurs and discriminatory language. Treated as the most serious category.",
  },
  sexual: {
    label: "Sexual content",
    description: "Sexual or otherwise inappropriate content.",
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

export const SEVERITIES = {
  flag: {
    label: "Flag only",
    description: "Deliver the message but record it for admin review.",
  },
  block_message: {
    label: "Block the message",
    description:
      "Refuse the message, record it, and email the sender and the tutor to contact support.",
  },
  block_chat: {
    label: "Block the whole chat",
    description:
      "Refuse the message, close the chat for both people, email them to contact the help desk and alert the safety contact.",
  },
};

export const SEVERITY_KEYS = Object.keys(SEVERITIES);

const SEVERITY_RANK = { flag: 1, block_message: 2, block_chat: 3 };

export function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

/** The harsher of two severities. */
export function worstSeverity(a, b) {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/* -------------------------------- normalising -------------------------------- */

/** Digits that stand in for letters — only folded when they sit next to one. */
const DIGIT_LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b" };
/** Symbols that stand in for letters — always folded. */
const SYMBOL_LEET = { "@": "a", $: "s", "!": "i", "|": "l" };

const isLetter = (ch) => ch >= "a" && ch <= "z";

/**
 * Lowercase the text and fold leetspeak back to letters, character for
 * character — the result is the same length as the input, so an offset in it
 * still points at the right place in the original.
 *
 * A digit only becomes a letter when a letter sits next to it, so "a55hole"
 * is caught while the price "455" and the year "2026" stay numbers.
 */
export function normalize(text) {
  const lower = String(text ?? "").toLowerCase();
  const chars = Array.from(lower);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (SYMBOL_LEET[ch]) {
      out += SYMBOL_LEET[ch];
      continue;
    }
    const folded = DIGIT_LEET[ch];
    if (folded && (isLetter(chars[i - 1] ?? "") || isLetter(chars[i + 1] ?? ""))) {
      out += folded;
      continue;
    }
    out += ch;
  }
  return out;
}

/* --------------------------------- compiling --------------------------------- */

const escapeRe = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turn a keyword into a regex that also catches the usual dodges: repeated
 * letters ("fuuuck"), punctuation between them ("s.e.x", "f u c k") and
 * leetspeak (already folded by `normalize`). Word boundaries on both ends keep
 * innocent words containing the keyword out.
 */
function keywordPattern(phrase) {
  const cleaned = normalize(phrase).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = [];
  for (const ch of cleaned) {
    if (ch === " ") {
      parts.push("[^a-z0-9]{1,3}");
      continue;
    }
    parts.push(`${escapeRe(ch)}+`);
  }
  // Join letters with an optional separator, but never insert one where the
  // phrase already asked for whitespace.
  let body = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const prev = parts[i - 1];
    if (i > 0 && part !== "[^a-z0-9]{1,3}" && prev !== "[^a-z0-9]{1,3}") {
      body += "[^a-z0-9]{0,2}";
    }
    body += part;
  }
  return `\\b${body}\\b`;
}

// Compiled regexes are reused across calls within a Convex isolate.
const COMPILED = new Map();

/** The regex for one rule, or null when the pattern does not compile. */
export function compileRule(rule) {
  const kind = rule.kind === "regex" ? "regex" : "keyword";
  const key = `${kind}::${rule.pattern}`;
  if (COMPILED.has(key)) return COMPILED.get(key);
  let compiled = null;
  try {
    const source = kind === "regex" ? rule.pattern : keywordPattern(rule.pattern);
    if (source) compiled = new RegExp(source, kind === "regex" ? "gi" : "g");
  } catch {
    compiled = null; // an admin typed an invalid regex — ignore that rule
  }
  COMPILED.set(key, compiled);
  return compiled;
}

/** Called after an admin edits or deletes a rule. */
export function forgetCompiled(rule) {
  COMPILED.delete(`${rule.kind === "regex" ? "regex" : "keyword"}::${rule.pattern}`);
}

/* ---------------------------------- scanning --------------------------------- */

/** Nothing longer than this is worth scanning — chats are capped well below it. */
const MAX_SCAN_CHARS = 8000;

/**
 * Run `rules` over one message.
 * Returns `{ hits, severity, categories }`; `severity` is null when clean.
 * Each hit carries the snippet of the *original* text that matched, so an
 * admin reviewing the flag sees exactly what was written.
 */
export function scanText(text, rules) {
  const raw = String(text ?? "").slice(0, MAX_SCAN_CHARS);
  if (!raw.trim()) return { hits: [], severity: null, categories: [] };
  const folded = normalize(raw);

  const hits = [];
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const regex = compileRule(rule);
    if (!regex) continue;
    const target = rule.kind === "regex" ? raw : folded;
    regex.lastIndex = 0;
    const match = regex.exec(target);
    if (!match || !match[0]) continue;
    hits.push({
      ruleId: rule._id ?? null,
      label: rule.label || rule.pattern,
      category: rule.category,
      severity: rule.severity,
      match: raw.slice(match.index, match.index + match[0].length).trim().slice(0, 120),
    });
  }

  let severity = null;
  for (const hit of hits) severity = worstSeverity(severity, hit.severity);
  return {
    hits,
    severity,
    categories: [...new Set(hits.map((hit) => hit.category))],
  };
}

/* ------------------------------- the seed rules ------------------------------- */

const regexRule = (label, pattern, category, severity, notes) => ({
  label,
  pattern,
  kind: "regex",
  category,
  severity,
  notes,
});

const words = (category, severity, list) =>
  list.map((pattern) => ({
    label: pattern,
    pattern,
    kind: "keyword",
    category,
    severity,
  }));

/**
 * Everything the platform ships with. Seeded into `moderationRules` on first
 * use, after which admins own the list — adding, editing, disabling or
 * deleting rows from the moderation screen.
 */
export const DEFAULT_RULES = [
  /* ------------------------------ personal info ------------------------------ */
  regexRule(
    "Email address",
    "\\b[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}\\b",
    "personal_info",
    "block_chat",
    "A written-out email address, e.g. marie@example.com."
  ),
  regexRule(
    "Email address (spelled out)",
    "\\b[A-Za-z0-9._%+-]{2,}\\s*(?:\\(\\s*at\\s*\\)|\\[\\s*at\\s*\\]|\\{\\s*at\\s*\\}|\\s+at\\s+)\\s*[A-Za-z0-9-]{2,}\\s*(?:\\(\\s*dot\\s*\\)|\\[\\s*dot\\s*\\]|\\{\\s*dot\\s*\\}|\\s+dot\\s+)\\s*(?:com|net|org|edu|gov|co|io|me|info|mail|fr|uk|de|es|it|nl|be|ca|us|ru|in|br)\\b",
    "personal_info",
    "block_chat",
    "Dodges like \"marie at gmail dot com\" or \"marie (at) gmail (dot) com\"."
  ),
  regexRule(
    "Phone number",
    "\\d(?:[\\s.()\\-]{0,2}\\d){8,}",
    "personal_info",
    "block_chat",
    "Nine or more digits with the usual separators. Dates (2026-09-22) are eight digits and stay clear."
  ),
  regexRule(
    "International phone number",
    "\\+\\s?\\d(?:[\\s.()\\-]{0,2}\\d){6,}",
    "personal_info",
    "block_chat",
    "A number written with a country code, e.g. +33 6 12 34 56 78."
  ),

  /* ---------------------------- off-platform contact --------------------------- */
  regexRule(
    "Messaging app handle",
    "\\b(?:whats\\s*app|telegram|skype|snapchat|wechat|viber|discord|instagram|insta|messenger|kakao|zalo)\\b[^A-Za-z0-9\\n]{0,4}(?:(?:id|handle|user(?:name)?|account|number|no)\\b[^A-Za-z0-9\\n]{0,4}(?:is\\b[^A-Za-z0-9\\n]{0,4})?|[:=@][^A-Za-z0-9\\n]{0,4})@?[A-Za-z0-9._+-]{3,}",
    "contact_evasion",
    "block_message",
    "\"telegram: @marie\" or \"my skype id is marie.d\" — an actual handle, not just the word."
  ),
  regexRule(
    "Social handle",
    "(?:^|[\\s(])@[A-Za-z0-9._]{4,}\\b",
    "contact_evasion",
    "flag",
    "An @handle written in the chat."
  ),
  ...words("contact_evasion", "flag", [
    "whatsapp",
    "telegram",
    "snapchat",
    "wechat",
    "viber",
    "my personal email",
    "my personal number",
    "off the platform",
    "outside the platform",
    "outside gotalkify",
    "pay me directly",
    "pay directly",
    "cash app",
    "venmo",
    "paypal me",
    "zelle",
  ]),

  /* ------------------------------ vulgar language ------------------------------ */
  ...words("profanity", "block_message", [
    "fuck",
    "fucker",
    "fucking",
    "fuk",
    "fck",
    "motherfucker",
    "mother fucker",
    "shit",
    "shitty",
    "bullshit",
    "bitch",
    "bitches",
    "bastard",
    "asshole",
    "arsehole",
    "ass hole",
    "dickhead",
    "dumbass",
    "jackass",
    "prick",
    "cunt",
    "twat",
    "wanker",
    "douchebag",
    "son of a bitch",
    "piss off",
    "pissed off",
    "screw you",
    "shut the hell up",
    "go to hell",
    "bollocks",
    "goddamn",
    "god damn",
    "damn you",
    "stupid idiot",
    "moron",
    "retard",
    "retarded",
    "pendejo",
    "puta",
    "merde",
    "connard",
    "salope",
    "enculé",
    "putain",
  ]),

  /* ----------------------------- sexual / explicit ----------------------------- */
  ...words("sexual", "block_message", [
    "sex",
    "sexy",
    "sexting",
    "sexual",
    "nude",
    "nudes",
    "naked",
    "porn",
    "porno",
    "pornhub",
    "onlyfans",
    "blowjob",
    "handjob",
    "masturbate",
    "masturbation",
    "horny",
    "dick pic",
    "send pics",
    "boobs",
    "tits",
    "penis",
    "vagina",
    "pussy",
    "cum",
    "orgasm",
    "erotic",
    "fetish",
    "bdsm",
    "hookup",
    "hook up with me",
    "sugar daddy",
    "sugar baby",
    "escort service",
    "webcam show",
    "strip for me",
    "rape",
    "molest",
    "pedophile",
  ]),

  /* ---------------------------- racial / hate speech ---------------------------- */
  ...words("hate", "block_chat", [
    "nigger",
    "nigga",
    "niggers",
    "chink",
    "chinks",
    "gook",
    "spic",
    "wetback",
    "beaner",
    "kike",
    "paki",
    "towelhead",
    "raghead",
    "sand nigger",
    "coon",
    "darkie",
    "jungle bunny",
    "tar baby",
    "golliwog",
    "half breed",
    "white trash",
    "zipperhead",
    "slant eye",
    "go back to your country",
    "go back to africa",
    "inferior race",
    "master race",
    "white power",
    "heil hitler",
    "gas the jews",
    "subhuman",
    "monkey people",
    "all muslims are",
    "all blacks are",
    "all jews are",
    "all whites are",
    "all asians are",
  ]),
];

/** Fast lookup used when re-seeding, so existing rows are never duplicated. */
export const DEFAULT_RULE_KEYS = new Set(
  DEFAULT_RULES.map((rule) => `${rule.kind}::${rule.pattern}`)
);
