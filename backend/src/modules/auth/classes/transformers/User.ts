import {
  ObjectIdToString,
  StringToObjectId,
} from '#shared/constants/transformerConstants.js';
import {IPreference, IUser, NotificationRetentionType, UserRole} from '#shared/interfaces/models.js';
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
  role: UserRole;

  @Expose()
  status: 'active' | 'in-active' ;

  @Expose()
  isBlocked: boolean ;

  @Expose()
  lastCheckInAt?: Date;

  @Expose()
  notificationRetention?: NotificationRetentionType;

  @Expose()
  mobile?: string;

  @Expose()
  university?: string;

  @Expose()
  isVerified: boolean;

  @Expose()
  isCallAgentActive?: boolean;

  @Expose()
  agent?: string;

  @Expose()
  isBusy?: boolean;

  @Expose()
  currentCallUuid?: string | null;

  constructor(data: Partial<IUser>) {
    this._id = data?._id ? new ObjectId(data?._id) : null;
    this.firebaseUID = data?.firebaseUID;
    this.email = data?.email;
    this.firstName = data?.firstName;
    this.lastName = data?.lastName;
    this.role = data?.role || 'expert';
    // Preserve the real persisted values; only fall back to defaults when the
    // field is genuinely absent (e.g. brand-new user). Hardcoding these caused
    // /me to always report status='active' and isBlocked=false.
    this.status = data?.status ?? 'active';
    this.isBlocked = data?.isBlocked ?? false;
    this.lastCheckInAt = data?.lastCheckInAt;
    this.isVerified = data?.isVerified ?? false;
    this.preference = {
      crop: data?.preference?.crop || 'all',
      state: data?.preference?.state || 'all',
      domain: data?.preference?.domain || 'all',
    };
    this.reputation_score = data?.reputation_score || 0;
    this.notificationRetention=data.notificationRetention;
    this.createdAt = data?.createdAt || new Date();
    this.updatedAt = data?.updatedAt || new Date();
    this.mobile = data?.mobile || '';
    this.university = data?.university || '';
    this.isCallAgentActive = data?.isCallAgentActive;
    this.agent = data?.agent || 'not_available';
    this.isBusy = data?.isBusy || false;
    this.currentCallUuid = data?.currentCallUuid || null;
  }
}

export {User};
