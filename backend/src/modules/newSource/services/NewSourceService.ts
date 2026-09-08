import {INewSourceRepository} from '#root/shared/database/interfaces/INewSourceRepository.js';
import {INewSource} from '#root/shared/interfaces/models.js';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {inject, injectable} from 'inversify';
import {CreateNewSourceInput, INewSourceService} from '../interfaces/INewSourceService.js';

@injectable()
export class NewSourceService implements INewSourceService {
  constructor(
    @inject(CORE_TYPES.NewSourceRepository)
    private readonly newSourceRepo: INewSourceRepository,
  ) {}

  async createNewSource(input: CreateNewSourceInput): Promise<INewSource> {
    // sourceStatus, timeTaken and organizationStatus are placeholders for now —
    // always null until their real meaning/shape is defined in a follow-up.
    return await this.newSourceRepo.create({
      answerId: input.answerId,
      questionId: input.questionId,
      sources: input.sources,
      sourceStatus: null,
      timeTaken: null,
      organizationStatus: null,
    });
  }
}
