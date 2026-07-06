export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '';
  
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+91 ${cleaned.slice(2)}`;
  }
  
  if (cleaned.length === 10) {
    return `+91 ${cleaned}`;
  }
  
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  return `+${cleaned}`;
}
