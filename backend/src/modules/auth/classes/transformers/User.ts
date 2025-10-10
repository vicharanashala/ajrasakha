import {
  ObjectIdToString,
  StringToObjectId,
} from '#shared/constants/transformerConstants.js';
import {IPreference, IUser} from '#shared/interfaces/models.js';
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
  role: 'admin' | 'user' | 'expert';

  constructor(data: Partial<IUser>) {
    this._id = data?._id ? new ObjectId(data?._id) : null;
    this.firebaseUID = data?.firebaseUID;
    this.email = data?.email;
    this.firstName = data?.firstName;
    this.lastName = data?.lastName;
    this.role = data?.role || 'user';
    this.preference = data?.preference;
  }
}

export {User};
