export const env = {
  baseURL: process.env.BASE_URL || 'http://127.0.0.1:4173',
  moderatorEmail: process.env.MODERATOR_EMAIL || 'moderator@annam.local',
  moderatorPassword: process.env.MODERATOR_PASSWORD || 'Moderator@123',
  expertEmail: process.env.EXPERT_EMAIL || 'expert@annam.local',
  expertPassword: process.env.EXPERT_PASSWORD || 'Expert@123',
};

export const hasModeratorCreds = Boolean(
  env.moderatorEmail && env.moderatorPassword,
);

export const hasExpertCreds = Boolean(env.expertEmail && env.expertPassword);
