/**
 * @typedef {'living'|'historical'|'extinct'|'ancient'|'constructed'|'special'} Type
 *   Category of a language:
 *
 *   *   `'living'`
 *       — currently spoken language
 *       (example: `nhi` for `Zacatlán-Ahuacatlán-Tepetzintla Nahuatl`)
 *   *   `'historical'`
 *       — extinct language distinct from modern languages that descended from it
 *       (example: `ofs` for `Old Frisian`)
 *   *   `'extinct'`
 *       — language that went extinct recently
 *       (example: `rbp` for `Barababaraba`)
 *   *   `'ancient'`
 *       — language that went extinct long ago
 *       (example: `got` for `Gothic`)
 *   *   `'constructed'`
 *       — artificial languages, excluding programming languages
 *       (example: `epo` for `Esperanto`)
 *   *   `'special'`
 *       — non-language codes
 *       (example: `und` for `Undetermined`)
 *
 * @typedef {'individual'|'macrolanguage'|'special'} Scope
 *   Scope of a language:
 *
 *   *   `'individual'`
 *       — normal, single language
 *       (example: `eng` for `English`)
 *   *   `'macrolanguage'`
 *       — one-to-many grouping of languages, because older ISO 639s included them
 *       (example: `ara` for `Arabic`)
 *   *   `'special'`
 *       — non-language codes
 *       (example: `und` for `Undetermined`)
 *
 * @typedef Language
 *   Object representing a language.
 * @property {string} name
 *   Name (example: `'English'`).
 * @property {Type} type
 *   Type (example: `'living'`).
 * @property {Scope} scope
 *   Scope (example: `'individual'`)
 * @property {string} iso6393
 *   ISO 639-3 code.
 * @property {string} [iso6392B]
 *   ISO 639-2 (bibliographic) code (example: `'eng'`).
 * @property {string} [iso6392T]
 *   ISO 639-2 (terminologic) code (example: `'eng'`).
 * @property {string} [iso6391]
 *   ISO 639-1 code (example: `'en'`).
 */
/**
 * List of ISO 639-3 languages.
 *
 * @type {Array<Language>}
 */
export const iso6393: Array<Language>
/**
 * Category of a language:
 *
 * *   `'living'`
 *   — currently spoken language
 *   (example: `nhi` for `Zacatlán-Ahuacatlán-Tepetzintla Nahuatl`)
 * *   `'historical'`
 *   — extinct language distinct from modern languages that descended from it
 *   (example: `ofs` for `Old Frisian`)
 * *   `'extinct'`
 *   — language that went extinct recently
 *   (example: `rbp` for `Barababaraba`)
 * *   `'ancient'`
 *   — language that went extinct long ago
 *   (example: `got` for `Gothic`)
 * *   `'constructed'`
 *   — artificial languages, excluding programming languages
 *   (example: `epo` for `Esperanto`)
 * *   `'special'`
 *   — non-language codes
 *   (example: `und` for `Undetermined`)
 */
export type Type =
  | 'living'
  | 'historical'
  | 'extinct'
  | 'ancient'
  | 'constructed'
  | 'special'
/**
 * Scope of a language:
 *
 * *   `'individual'`
 *   — normal, single language
 *   (example: `eng` for `English`)
 * *   `'macrolanguage'`
 *   — one-to-many grouping of languages, because older ISO 639s included them
 *   (example: `ara` for `Arabic`)
 * *   `'special'`
 *   — non-language codes
 *   (example: `und` for `Undetermined`)
 */
export type Scope = 'individual' | 'macrolanguage' | 'special'
/**
 * Object representing a language.
 */
export type Language = {
  /**
   *   Name (example: `'English'`).
   */
  name: string
  /**
   *   Type (example: `'living'`).
   */
  type: Type
  /**
   *   Scope (example: `'individual'`)
   */
  scope: Scope
  /**
   *   ISO 639-3 code.
   */
  iso6393: string
  /**
   * ISO 639-2 (bibliographic) code (example: `'eng'`).
   */
  iso6392B?: string | undefined
  /**
   * ISO 639-2 (terminologic) code (example: `'eng'`).
   */
  iso6392T?: string | undefined
  /**
   * ISO 639-1 code (example: `'en'`).
   */
  iso6391?: string | undefined
}
