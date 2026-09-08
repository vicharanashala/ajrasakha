import {IOrganization} from '#root/shared/interfaces/models.js';

export interface IOrganizationService {
  search(search?: string, limit?: number): Promise<{organizations: IOrganization[]}>;
}
