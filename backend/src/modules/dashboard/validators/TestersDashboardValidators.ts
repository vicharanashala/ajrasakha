import { IsIn, IsOptional, IsString, IsBooleanString } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

// Query params for the server-side-filtered Testers Dashboard summary
// endpoint - the 9 filter dimensions plus Date Range, matching filters.ts's
// TestersDashboardFilters shape. Every filter value is a normalized value
// (e.g. "GDB", "Pass", "Critical") or "all"/omitted for no filter - the
// same values buildFilterOptions() returns for each dropdown, so the
// frontend can pass a selected option straight through.
export class GetTestersDashboardQuery {
  @JSONSchema({
    example: '7days',
    description: 'Date range filter: all, today, 7days, 30days, or custom',
  })
  // Deliberately typed as plain `string`, NOT TestersDashboardDateRange (a
  // string-literal union). TypeScript erases type aliases at compile time,
  // so a property typed with a union has no runtime constructor for
  // emitDecoratorMetadata to reflect - routing-controllers then treats the
  // param as "not a primitive" and tries JSON.parse() on the raw query
  // string, which throws a 400 for every value including valid ones (e.g.
  // "7days" -> "cannot be parsed into JSON"). @IsIn still fully validates
  // the allowed values at runtime regardless of the compile-time type;
  // TestersDashboardService casts to TestersDashboardDateRange after this
  // validation has already run.
  @IsOptional()
  @IsIn(['all', 'today', '7days', '30days', 'custom'])
  dateRange?: string;

  @JSONSchema({
    example: '2026-08-01',
    description: 'Custom range start date (YYYY-MM-DD) - only used when dateRange="custom"',
  })
  @IsOptional()
  @IsString()
  customStart?: string;

  @JSONSchema({
    example: '2026-08-10',
    description: 'Custom range end date (YYYY-MM-DD) - only used when dateRange="custom"',
  })
  @IsOptional()
  @IsString()
  customEnd?: string;

  @JSONSchema({ example: 'GDB', description: 'Type of Question filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  type?: string;

  @JSONSchema({ example: 'Insect–Pest Management', description: 'Question Category filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  category?: string;

  @JSONSchema({ example: '0.1', description: 'Build / Version filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  build?: string;

  @JSONSchema({ example: 'Web App', description: 'Channel Tested filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  channel?: string;

  @JSONSchema({ example: 'English', description: 'Language Tested filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  language?: string;

  @JSONSchema({ example: 'Joydeep', description: 'Tester Name filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  tester?: string;

  @JSONSchema({ example: 'Pass', description: 'Overall Test Status filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  status?: string;

  @JSONSchema({ example: 'Critical', description: 'Defect Severity filter (normalized value, or "all")' })
  @IsOptional()
  @IsString()
  severity?: string;

  @JSONSchema({
    example: 'Weather,Mandi Prices',
    description:
      'Dynamic sub-type filter (multi-select, OR logic) - comma-separated list of dynamicSubBucketFor values ' +
      '(Weather, Mandi Prices, Government Schemes). Independent of `type` - selecting sub-types does not require ' +
      'type=Dynamic. Omitted/empty means no filter.',
  })
  // A true array-typed query param (@IsArray()) would need the frontend to
  // send repeated keys (?dynamicSubTypes=Weather&dynamicSubTypes=Mandi...),
  // which adds client-side serialization complexity for no real benefit
  // here - a single comma-separated string is simpler on both ends and
  // avoids relying on this endpoint's array/union-type query parsing (see
  // dateRange's comment above on this same class for a related quirk).
  // Parsed into a string[] in TestersDashboardService.buildFiltersFromQuery.
  @IsOptional()
  @IsString()
  dynamicSubTypes?: string;

  @JSONSchema({
    example: 'Dynamic',
    description:
      'Dynamic/Static tree filter (whole-branch selection, no sub-type chosen): "Dynamic" or "Static", or ' +
      'omitted/"all" for no filter. Independent of the legacy `type` param above. See filters.ts\'s TypeBranch.',
  })
  @IsOptional()
  @IsIn(['all', 'Dynamic', 'Static'])
  typeBranch?: string;

  @JSONSchema({
    example: 'GDB,Unique',
    description:
      'Static sub-type filter (multi-select, OR logic) - comma-separated list of "GDB"/"Unique"/"Outreach". Only ' +
      'meaningful when typeBranch="Static" - omitted/empty means "match the whole Static branch" (GDB+Unique+' +
      'Outreach combined). Same wire format as dynamicSubTypes above.',
  })
  @IsOptional()
  @IsString()
  staticSubTypes?: string;

  @JSONSchema({
    example: 'true',
    description: 'Exclude rows with a DB-save failure, a wrongly-flagged duplicate, or a Critical defect - "true" or "false"',
  })
  // Query params always arrive as strings and this app's routing-controllers
  // setup doesn't enable implicit type conversion, so @IsBoolean() would
  // reject every real request (e.g. ?excludeFailures=true is the string
  // "true", not a boolean). @IsBooleanString() + string type matches the
  // existing convention elsewhere in this codebase (see
  // QuestionVaidators.ts's isRequiredAiInitialAnswer/isOutreachQuestion) -
  // the consumer compares against the literal string "true".
  @IsOptional()
  @IsBooleanString()
  excludeFailures?: string;
}
