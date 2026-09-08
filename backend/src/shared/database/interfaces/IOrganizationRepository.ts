import {IOrganization} from '#root/shared/interfaces/models.js';

export interface IOrganizationRepository {
  /**
   * Searches the `organization` collection by org_name (case-insensitive).
   * @param search - Optional text to match against org_name; returns the first
   *   page of organizations (alphabetical by org_name) when omitted.
   * @param limit - Maximum number of results to return.
   */
  search(search?: string, limit?: number): Promise<IOrganization[]>;
}
