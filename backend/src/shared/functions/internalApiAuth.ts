import { injectable } from 'inversify';
import { ExpressMiddlewareInterface, Middleware } from 'routing-controllers';
@injectable()
@Middleware({ type: 'before' })
export class InternalApiAuth implements ExpressMiddlewareInterface {
  use(req: any, res: any, next: (err?: any) => any): any {

    const apiKey = req.headers['x-internal-api-key'];
    const origin = req.headers.origin;

    // const allowedOrigins = [
    //   'https://chat.annam.ai',
    //   'https://chat.vicharanshala.ai'
    // ];

    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // if (origin && !allowedOrigins.includes(origin)) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Forbidden origin',
    //   });
    // }

    next();
  }
}