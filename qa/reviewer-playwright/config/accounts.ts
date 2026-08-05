export type Account = {
  email: string;
  password: string;
};

export const expertAccounts: Record<string, Account> = {};

for (let i = 1; i <= 8; i++) {
  const suffix = i === 1 ? "" : `_${i}`;

  const email = process.env[`EXPERT_EMAIL${suffix}`];
  const password = process.env[`EXPERT_PASSWORD${suffix}`];

  if (email && password) {
    expertAccounts[email] = {
      email,
      password,
    };
  }
}

export const moderatorAccounts = {
  primary: {
    email: process.env.MODERATOR_EMAIL!,
    password: process.env.MODERATOR_PASSWORD!,
  },

  secondary: {
    email: process.env.MODERATOR_EMAIL_2!,
    password: process.env.MODERATOR_PASSWORD_2!,
  },
};

export const adminAccount = {
  email: process.env.ADMIN_EMAIL!,
  password: process.env.ADMIN_PASSWORD!,
};
