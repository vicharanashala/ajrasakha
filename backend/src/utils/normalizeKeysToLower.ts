export const normalizeKeysToLower = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeysToLower);
  } else if (obj && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      acc[key.toLowerCase()] = normalizeKeysToLower(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj;
};
