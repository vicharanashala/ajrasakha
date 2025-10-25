
import { NotificationResponse } from '#root/modules/core/classes/validators/NotificationValidators.js';
import { INotification } from '#root/shared/interfaces/models.js';
import {ClientSession, ObjectId} from 'mongodb';

/**
 * Interface representing a repository for notification-related operations.
 */
export interface INotificationRepository {
  /**
   * Adds a new answer for a specific question.
   * @param userId - The ID of the person notification is asigned.
   * @param enitity_id - The ID of the related entity of that notification.
   * @param type - The type of the notification.
   * @param message - The message to show in the notification.
   * @param session - Optional MongoDB client session for transactions.
   * @returns A promise that resolves to an object containing the inserted answer ID.
   */

  addNotification(userId:string,enitity_id:string,type:string,message:string,session?: ClientSession,):Promise<{insertedId: string}>;

  /**
   * Adds a new answer for a specific question.
   * @param userId - The ID of the person notification is asigned.
   * @returns A promise that resolves to an object containing the inserted answer ID.
   */
  getNotifications(userId:string,session?:ClientSession):Promise<NotificationResponse | null>
}
