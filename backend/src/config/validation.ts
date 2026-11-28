import type {ValidatorOptions} from 'class-validator';

// Validation errors must not echo submitted values (e.g. passwords) into responses, error.log or Sentry.
export const requestValidationOptions: ValidatorOptions = {
  validationError: {target: false, value: false},
};
