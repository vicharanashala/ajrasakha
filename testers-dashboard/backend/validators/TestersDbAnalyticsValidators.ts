import { IsIn, IsOptional, IsString } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

// Query params for GET /dashboard/testers/db/entries (Database Logs Analytics).
// Every value is a DB filter option value from dbFilterOptions.ts (a Tester
// UI form option, a stored legacy/Build value, or a submittedByUserId) or
// "all"/omitted. Same conventions as TestersDashboardValidators.ts: plain
// `string` types (validated with @IsIn at runtime) and comma-separated
// multi-selects. No `source` or `excludeFailures` - this endpoint is DB-only,
// and Exclude Failures is a Google Sheet-only control.
export class GetTestersDbAnalyticsQuery {
  @JSONSchema({ example: '7days', description: 'Date range: all, today, 7days, 30days, or custom' })
  @IsOptional()
  @IsIn(['all', 'today', '7days', '30days', 'custom'])
  dateRange?: string;

  @JSONSchema({ example: '2026-08-01', description: 'Custom range start (YYYY-MM-DD) - only used when dateRange="custom"' })
  @IsOptional()
  @IsString()
  customStart?: string;

  @JSONSchema({ example: '2026-08-10', description: 'Custom range end (YYYY-MM-DD) - only used when dateRange="custom"' })
  @IsOptional()
  @IsString()
  customEnd?: string;

  @JSONSchema({ example: 'GDB', description: 'Single Type of Question option, or "all"' })
  @IsOptional()
  @IsString()
  type?: string;

  @JSONSchema({ example: 'Weed Management', description: 'Question Category option, or "all"' })
  @IsOptional()
  @IsString()
  category?: string;

  @JSONSchema({ example: '0.1', description: 'Stored Build / Version value, or "all"' })
  @IsOptional()
  @IsString()
  build?: string;

  @JSONSchema({ example: 'WebApp', description: 'Channel Tested option (WhatsApp, WebApp, Both), or "all"' })
  @IsOptional()
  @IsString()
  channel?: string;

  @JSONSchema({ example: 'English', description: 'Language Tested option, or "all"' })
  @IsOptional()
  @IsString()
  language?: string;

  @JSONSchema({ example: '64b7f0c2a1b2c3d4e5f60718', description: 'Tester identity (submittedByUserId), or "all"' })
  @IsOptional()
  @IsString()
  tester?: string;

  @JSONSchema({ example: 'Pass', description: 'Overall Test Status option, or "all"' })
  @IsOptional()
  @IsString()
  status?: string;

  @JSONSchema({ example: 'Critical', description: 'Defect Severity option, or "all"' })
  @IsOptional()
  @IsString()
  severity?: string;

  @JSONSchema({
    example: 'Weather Dynamic,Mandi Dynamic',
    description: 'Dynamic sub-types (comma-separated Type of Question options, OR logic). Omitted/empty = no filter.',
  })
  @IsOptional()
  @IsString()
  dynamicSubTypes?: string;

  @JSONSchema({ example: 'Dynamic', description: 'Whole Dynamic/Static branch: "Dynamic", "Static", or omitted/"all"' })
  @IsOptional()
  @IsIn(['all', 'Dynamic', 'Static'])
  typeBranch?: string;

  @JSONSchema({
    example: 'GDB,Unique',
    description: 'Static sub-types (comma-separated Type of Question options, OR logic). Omitted/empty = no filter.',
  })
  @IsOptional()
  @IsString()
  staticSubTypes?: string;
}
