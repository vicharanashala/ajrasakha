/**
 * Formats a raw phone number string into a human-readable format.
 * Example: "918888888888" -> "+91 8888888888"
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '';
  
  // Remove any non-digit characters for processing
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // If it's a 12-digit number starting with 91 (India country code)
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+91 ${cleaned.slice(2)}`;
  }
  
  // If it's a 10-digit number, assume India and add +91
  if (cleaned.length === 10) {
    return `+91 ${cleaned}`;
  }
  
  // If it already starts with a plus, return it as is or format slightly
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // Fallback: prepend a plus to the cleaned digits
  return `+${cleaned}`;
}
