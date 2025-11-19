import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {IUser, NotificationRetentionType} from '#root/shared/interfaces/models.js';
import {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import {InternalServerError, NotFoundError} from 'routing-controllers';
import {BaseService, MongoDatabase} from '#root/shared/index.js';
import {ClientSession} from 'mongodb';
import {
  PreferenceDto,
  UsersNameResponseDto,
} from '../classes/validators/UserValidators.js';
import { INotificationRepository } from '#root/shared/database/interfaces/INotificationRepository.js';

@injectable()
export class UserService extends BaseService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,

    @inject(GLOBAL_TYPES.NotificationRepository)
    private readonly notificationRepository: INotificationRepository,

    @inject(GLOBAL_TYPES.Database)
    private readonly mongoDatabase: MongoDatabase,
  ) {
    super(mongoDatabase);
  }

  async getUserById(userId: string): Promise<IUser> {
    try {
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        let user = await this.userRepo.findById(userId, session);
        if (!user) throw new NotFoundError(`User with ID ${userId} not found`);
        let notifications = await this.notificationRepository.getNotificationsCount(userId,session)
        const usersWithNotification = {
          ...user,
          notifications
        }
        return usersWithNotification;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to fetch user with ID ${userId}: ${error}`,
      );
    }
  }

  async updateUser(userId: string, data: Partial<IUser>): Promise<IUser> {
    try {
      if (!userId) throw new NotFoundError('User ID is required');

      return this._withTransaction(async (session: ClientSession) => {
        const updatedUser = await this.userRepo.edit(userId, data, session);
        if (!updatedUser)
          throw new NotFoundError(`User with ID ${userId} not found`);
        return updatedUser;
      });
    } catch (error) {
      throw new InternalServerError(
        `Failed to update user with ID ${userId}: ${error}`,
      );
    }
  }

  async getAllUsers(userId: string): Promise<UsersNameResponseDto> {
    try {
      return await this._withTransaction(async session => {
        const me = await this.userRepo.findById(userId, session);
        const users = await this.userRepo.findAll(session);

        const usersExceptMe = users.filter(
          user => user._id.toString() !== userId,
        );

        const myPreference: PreferenceDto = {
          state: me?.preference?.state ?? null,
          crop: me?.preference?.crop ?? null,
          domain: me?.preference?.domain ?? null,
        };

        return {
          myPreference,
          users: users.map(u => ({
            _id: u._id.toString(),
            role: u.role,
            email: u.email,
            preference: u.preference,
            userName: `${u.firstName} ${u.lastName ? u.lastName : ''}`.trim(),
          })),
        };
      });
    } catch (error) {
      throw new InternalServerError(`Failed to fetch users: ${error}`);
    }
  }

  async updateAutoDeleteNotificationPreference(preference:NotificationRetentionType,userId:string):Promise<void>{
    await this._withTransaction(async (session:ClientSession) => {
      await this.userRepo.updateAutoDeleteNotificationPreference(preference,userId,session)
    })
  }

  async updatePenaltyAndIncentive(userId:string,type:'penalty' | 'incentive'):Promise<void>{
    await this._withTransaction(async (session:ClientSession) => {
      await this.userRepo.updatePenaltyAndIncentive(userId,type,session)
    })
  }

  async findAllExperts(page:number,limit:number,search:string,sort:string,filter:string):Promise<{experts:IUser[]; totalExperts:number; totalPages:number}>{
    return await this._withTransaction(async (session:ClientSession) => {
      return await this.userRepo.findAllExperts(page,limit,search,sort,filter,session)
    })
  }

  async blockUnblockExperts(userId:string,action:string){
    return await this._withTransaction(async (session:ClientSession) => {
      return await this.userRepo.updateIsBlocked(userId,action,session)
    })
  }

}
