import { injectable } from 'inversify';
import { ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
@injectable()
@Middleware({ type: 'before' })
export class InternalApiAuth implements ExpressMiddlewareInterface {
  use(req: any, res: any, next: (err?: any) => any): any {
    try {
      const apiKey = req.headers['x-internal-api-key'];
      const origin = req.headers.origin;

      // const allowedOrigins = [
      //   'https://chat.annam.ai',
      //   'https://chat.vicharanshala.ai'
      // ];

      

      if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
        console.log('[InternalApiAuth] UNAUTHORIZED - key missing or mismatch');
        let reso = res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
        return reso;
      }

      // if (origin && !allowedOrigins.includes(origin)) {
      //   return res.status(403).json({
      //     success: false,
      //     message: 'Forbidden origin',
      //   });
      // }

      console.log('[InternalApiAuth] AUTHORIZED - proceeding');
      next();
    } catch (err) {
      console.error('[InternalApiAuth] unexpected error:', err);
      next(err);
    }
  }
}