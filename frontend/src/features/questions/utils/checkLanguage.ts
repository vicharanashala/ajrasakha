/**
 * Checks if the text contains only basic English/ASCII characters.
 * * @param text The string to evaluate.
 * @returns boolean True if it only contains basic English characters.
 */
export function isEnglishCharacters(text: string): boolean {
  if (!text || text.trim() === '') {
    return false; 
  }

  // Matches standard English letters, numbers, spaces, and common punctuation
  const englishRegex = /^[a-zA-Z0-9\s.,!?'"()\-;:_]*$/;
  return englishRegex.test(text);
}