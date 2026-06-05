import { env } from '#root/utils/env.js';

export const faqPopConfig = {
  faqApiUrl: env('FAQ_API_URL') || '',
  popApiUrl: env('POP_API_URL') || '',
};
