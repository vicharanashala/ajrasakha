import { createLogger, format, transports } from 'winston';
import {
  IsArray,
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  ValidationError,
} from 'class-validator';
import {
  Middleware,
  ExpressErrorMiddlewareInterface,
  HttpError,
  UnauthorizedError,
} from 'routing-controllers';
import { Request, Response } from 'express';
import { JSONSchema } from 'class-validator-jsonschema';
import { Type } from 'class-transformer';

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.prettyPrint()),
  transports: [
    new transports.File({ filename: 'error.log', level: 'error' }),
  ],
});

export class ErrorResponse<T> {
  message: string;
  errors?: T;

  constructor(message: string, errors?: T) {
    if (errors) this.errors = errors;
    this.message = message;
  }
}

class ValidationErrorResponse {
  @JSONSchema({
    type: 'object',
    description: 'The object that was validated.',
    readOnly: true,
  })
  @IsObject()
  target!: object;

  @JSONSchema({
    type: 'string',
    description: 'The property that failed validation.',
    readOnly: true,
  })
  @IsString()
  @IsDefined()
  property!: string;

  @JSONSchema({
    type: 'object',
    description: 'The value that failed validation.',
    readOnly: true,
  })
  value: any;

  @JSONSchema({
    type: 'object',
    description: 'Constraints that failed validation with error messages.',
    readOnly: true,
  })
  @IsObject()
  constraints!: { [type: string]: string };

  @JSONSchema({
    type: 'array',
    format: 'ValidationErrorResponse',
    description: 'Contains all nested validation errors of the property.',
    readOnly: true,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidationErrorResponse)
  children!: ValidationErrorResponse[];

  @JSONSchema({
    type: 'object',
    description: 'Contains all nested validation errors of the property.',
    readOnly: true,
  })
  @IsObject()
  @IsOptional()
  contexts!: { [type: string]: any };
}

class DefaultErrorResponse {
  @IsString()
  @JSONSchema({
    type: 'string',
    description: 'The error message.',
    readOnly: true,
  })
  message!: string;
}

class BadRequestErrorResponse {
  @JSONSchema({
    type: 'string',
    description: 'The error message.',
    readOnly: true,
  })
  @IsString()
  message!: string;

  @JSONSchema({
    type: 'object',
    description: 'The error details.',
    readOnly: true,
  })
  @IsObject()
  @ValidateNested()
  errors?: ValidationErrorResponse;
}

@Middleware({ type: 'after' })
export class HttpErrorHandler implements ExpressErrorMiddlewareInterface {
  error(error: any, request: Request, response: Response): void {
    logger.error({
      message: error.message,
      errors: error.errors,
      stack: error.stack,
      status: error.httpCode || 500,
    });

    if (response.headersSent) {
      return;
    }

    if (error instanceof UnauthorizedError) {
      response
        .status(401)
        .json(
          new ErrorResponse<null>(
            'You are not authorized to access this resource.',
            null,
          ),
        );
    } else if (error instanceof HttpError) {
      if (
        'errors' in error &&
        (error.errors as any)[0] instanceof ValidationError
      ) {
        response
          .status(400)
          .json(
            new ErrorResponse<typeof error.errors>(error.message, error.errors),
          );
      } else {
        response
          .status(error.httpCode)
          .json(new ErrorResponse<null>(error.message, null));
      }
    } else if (error instanceof Error) {
      response.status(500).json(
        new ErrorResponse<null>(error.message, null)
      );
    } else {
      response
        .status(500)
        .json(new ErrorResponse<null>('An unexpected error occurred.', null));
    }
  }
}

export { DefaultErrorResponse, ValidationErrorResponse, BadRequestErrorResponse };
