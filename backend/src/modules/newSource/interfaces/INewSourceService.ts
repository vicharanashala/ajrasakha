import {INewSource, INewSourceItem} from '#root/shared/interfaces/models.js';

export interface CreateNewSourceInput {
  answerId: string;
  questionId: string;
  sources: INewSourceItem[];
}

export interface INewSourceService {
  createNewSource(input: CreateNewSourceInput): Promise<INewSource>;
}
