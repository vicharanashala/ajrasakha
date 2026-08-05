import { expertAccounts } from "../config/accounts.js";

export function getExpertAccount(email: string) {
  const account = expertAccounts[email];

  if (!account) {
    throw new Error(`No account configured for ${email}`);
  }

  return account;
}
