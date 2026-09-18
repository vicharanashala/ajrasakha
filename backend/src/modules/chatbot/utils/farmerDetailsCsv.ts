import type {UserDetailEntry} from '#root/shared/database/interfaces/IChatbotRepository.js';

/**
 * Builds the "All Farmers" table (chatbot analytics dashboard) as CSV text, for the admin
 * "Download" button. Includes every column shown in the table plus the extra farmerProfile
 * fields shown in the row's "View More" (FarmerDetailsModal) panel, so the export always has
 * at least as much detail as the UI. Mirrors the csvEscape/UTF-8 BOM pattern already used for
 * the Response Adherence report in `responseAdherenceReport.ts`.
 */

function csvEscape(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? '');
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatBoolean(value?: boolean): string {
  if (value == null) return '';
  return value ? 'Yes' : 'No';
}

function formatList(value?: string[] | string): string {
  if (!value) return '';
  const items = Array.isArray(value) ? value : [value];
  return items.filter(Boolean).join('; ');
}

function formatDate(value?: Date | string): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

const CSV_HEADERS = [
  'Name',
  'Farmer Name',
  'Email',
  'User Role',
  'Verified',
  'Total Questions',
  'Created At',
  'Age',
  'Gender',
  'Phone',
  'Language',
  'Years Of Experience',
  'Village',
  'Block',
  'District',
  'State',
  'Crops Cultivated',
  'Primary Crop',
  'Secondary Crop',
  'Landhold (acres)',
  'Aware Of KCC',
  'Uses Agri Apps',
  'Highest Educated Person',
  'Number Of Smartphones',
  'Nearest KVK',
  'Platform',
];

export function buildFarmerDetailsCsv(users: UserDetailEntry[]): string {
  const lines = users.map(user => {
    const fp = user.farmerProfile;
    const values: (string | number | boolean | null | undefined)[] = [
      user.name,
      fp?.farmerName,
      user.email,
      user.userRole || user.role,
      formatBoolean(user.isVerified),
      user.totalQuestions,
      formatDate(user.createdAt),
      fp?.age,
      fp?.gender,
      fp?.phoneNo,
      fp?.languagePreference,
      fp?.yearsOfExperience,
      fp?.villageName,
      fp?.blockName,
      fp?.district,
      fp?.state,
      formatList(fp?.cropsCultivated),
      fp?.primaryCrop,
      fp?.secondaryCrop,
      fp?.landhold,
      formatBoolean(fp?.awarenessOfKCC),
      formatBoolean(fp?.usesAgriApps),
      fp?.highestEducatedPerson,
      fp?.numberOfSmartphones,
      fp?.nearestKVK,
      fp?.platform,
    ];

    return values.map(value => csvEscape(value)).join(',');
  });

  return ['﻿' + CSV_HEADERS.join(','), ...lines].join('\r\n');
}
