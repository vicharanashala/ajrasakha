import {
  ObjectIdToString,
  StringToObjectId,
} from '#shared/constants/transformerConstants.js';
import {IPreference, IUser, NotificationRetentionType} from '#shared/interfaces/models.js';
import {Expose, Transform} from 'class-transformer';
import {ObjectId} from 'mongodb';

class User implements IUser {
  @Transform(ObjectIdToString.transformer, {toPlainOnly: true})
  @Transform(StringToObjectId.transformer, {toClassOnly: true})
  @Expose()
  _id: string | ObjectId | null;

  @Expose()
  firebaseUID: string;

  @Expose()
  email: string;

  @Expose()
  firstName: string;

  @Expose()
  preference?: IPreference;

  @Expose()
  lastName: string;

  @Expose()
  reputation_score: number;

  @Expose()
  createdAt?: Date;

  @Expose()
  updatedAt?: Date;

  @Expose()
  role: 'admin' | 'moderator' | 'expert';

  @Expose()
  status: 'active' | 'in-active' ;

  @Expose()
  isBlocked: boolean ;

  @Expose()
  notificationRetention?: NotificationRetentionType;

  constructor(data: Partial<IUser>) {
    this._id = data?._id ? new ObjectId(data?._id) : null;
    this.firebaseUID = data?.firebaseUID;
    this.email = data?.email;
    this.firstName = data?.firstName;
    this.lastName = data?.lastName;
    this.role = data?.role || 'expert';
    this.status =  'active';
    this.isBlocked=false;
    this.preference = {
      crop: data?.preference?.crop || 'all',
      state: data?.preference?.state || 'all',
      domain: data?.preference?.domain || 'all',
    };
    this.reputation_score = data?.reputation_score || 0;
    this.notificationRetention=data.notificationRetention;
    this.createdAt = data?.createdAt || new Date();
    this.updatedAt = data?.updatedAt || new Date();
  }
}

export {User};
