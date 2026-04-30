import {defaultMetadataStorage} from 'class-transformer';

/**
 * Generates a MongoDB projection object from a DTO class decorated with class-transformer.
 * This assumes fields to be included are decorated with @Expose().
 */
export function getProjectionFromDto(dtoClass: any): Record<string, number> {
  const metadataStorage = defaultMetadataStorage;
  const exposedMetadatas = metadataStorage.getExposedMetadatas(dtoClass);
  
  const projection: Record<string, number> = {};
  
  if (exposedMetadatas.length > 0) {
    exposedMetadatas.forEach(meta => {
      if (meta.propertyName) {
        projection[meta.propertyName] = 1;
      }
    });
  } else {
    // Fallback: If no @Expose decorators are found, we might need another way
    // or just return an empty object (which means project all)
    // For now, let's encourage using @Expose() or provide a manual way.
  }
  
  return projection;
}
