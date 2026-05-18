import { IChemical } from '#root/shared/interfaces/models.js';

export class ChemicalErrorResponse {
  success: false;
  error: string;
  message?: string;
}

export class ChemicalSuccessResponse {
  success: true;
  message: string;
  data: IChemical;
}

export class PaginatedChemicalsResponse {
  success: true;
  data: {
    chemicals: IChemical[];
    totalCount: number;
    totalPages: number;
  };
}

export class ChemicalSingleResponse {
  success: true;
  data: IChemical;
}
