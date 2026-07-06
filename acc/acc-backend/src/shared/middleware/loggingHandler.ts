import { Request, Response, NextFunction } from 'express';

export function loggingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = Date.now();
  const method = req.method;
  const url = req.url;
  const ip = req.socket.remoteAddress || '-';
  const timestamp = `[${new Date().toISOString()}]`;

  console.log(`${timestamp} ${method} ${url} from ${ip}`);

  res.on('finish', () => {
    const duration = `${Date.now() - start}ms`;
    const status = res.statusCode;
    console.log(
      `${timestamp} ${method} ${url} from ${ip} - Status: ${status} (${duration})`,
    );
  });

  next();
}
