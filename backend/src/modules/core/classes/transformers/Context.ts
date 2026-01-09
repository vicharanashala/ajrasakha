// import {
//   ObjectIdToString,
//   StringToObjectId,
// } from '#shared/constants/transformerConstants.js';
// import { IContext } from '#shared/interfaces/models.js';
// import { Expose, Transform } from 'class-transformer';
// import { ObjectId } from 'mongodb';

// class Context implements IContext {
//   @Transform(ObjectIdToString.transformer, { toPlainOnly: true })
//   @Transform(StringToObjectId.transformer, { toClassOnly: true })
//   @Expose()
//   _id?: string | ObjectId;

//   @Expose()
//   text: string;

//   @Expose()
//   createdAt?: Date;

//   constructor(data?: Partial<IContext>) {
//     // this._id = data?._id ? new ObjectId(data._id) : undefined;
//     this.text = data?.text;
//     this.createdAt = data?.createdAt ?? new Date();
//   }
// }

// export { Context };
