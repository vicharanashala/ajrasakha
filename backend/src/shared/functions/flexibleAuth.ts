import { injectable } from 'inversify';
import { ExpressMiddlewareInterface } from 'routing-controllers';
import { getFirebaseAuth } from '#root/config/firebaseAdmin.js';
import { FirebaseAuthService } from '#root/modules/auth/services/FirebaseAuthService.js';
import { getFromContainer } from 'routing-controllers';

/**
 * Accepts either:
 *   - a valid Firebase JWT  (Authorization: Bearer <token>)  — used by the browser frontend
 *   - a valid internal API key (x-internal-api-key: <key>)   — used by external services
 *       (WhatsApp webhook, LangGraph adapter, etc.)
 */
@injectable()
export class FlexibleAuth implements ExpressMiddlewareInterface {
  async use(req: any, res: any, next: (err?: any) => any): Promise<any> {
    try {
      // 1. Try internal API key first (fast, no async)
      const apiKey = req.headers['x-internal-api-key'];
      if (apiKey) {
        if (apiKey === process.env.INTERNAL_API_KEY) {
          return next();
        }
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // 2. Fall back to Firebase JWT
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      getFirebaseAuth();
      const firebaseAuthService = getFromContainer(FirebaseAuthService);
      const decoded = await firebaseAuthService.getCurrentUserFromToken(token);

      // Moderators and Experts: access is gated by activity status, NOT isBlocked
      // (their check-in/checkout availability flag). Every other role is
      // unchanged: isBlocked denies access as before.
      const deniedAccess =
        decoded.role === 'moderator' || decoded.role === 'expert'
          ? decoded.status === 'in-active'
          : decoded.isBlocked;
      if (!decoded?.firebaseUID || deniedAccess) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      return next();
    } catch (err) {
      console.error('[FlexibleAuth] error:', err);
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  }
}
