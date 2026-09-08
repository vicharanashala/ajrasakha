export interface PopLookupResult {
  found: boolean;
  shareable_name?: string;
  shareable_link?: string;
}

export interface IPopService {
  lookupBySource(source: string): Promise<PopLookupResult>;
}
