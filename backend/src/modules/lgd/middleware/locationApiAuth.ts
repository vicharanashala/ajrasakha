import {injectable} from 'inversify';
import {ExpressMiddlewareInterface, Middleware} from 'routing-controllers';
import {appConfig} from '#root/config/app.js';

@injectable()
@Middleware({type: 'before'})
export class LocationApiAuth implements ExpressMiddlewareInterface {
  use(req: any, res: any, next: (err?: any) => any): any {
    try {
      const apiKey = req.body?.apiKey ?? req.body?.api_key ?? '';

      if (!apiKey) {
        console.log('[LocationApiAuth] UNAUTHORIZED - apiKey missing from body');
        return res.status(401).json({
          success: false,
          message: 'Missing apiKey in request body',
        });
      }

      const validKey = appConfig.LOCATION_API_SECRET;

      if (!validKey) {
        console.log('[LocationApiAuth] BLOCKED - LOCATION_API_SECRET not configured');
        return res.status(401).json({
          success: false,
          message: 'LOCATION_API_SECRET not configured on server',
        });
      }

      if (apiKey !== validKey) {
        console.log('[LocationApiAuth] UNAUTHORIZED - invalid apiKey');
        return res.status(401).json({
          success: false,
          message: 'Invalid apiKey',
        });
      }

      console.log('[LocationApiAuth] AUTHORIZED - proceeding');
      next();
    } catch (err) {
      console.error('[LocationApiAuth] unexpected error:', err);
      next(err);
    }
  }
}