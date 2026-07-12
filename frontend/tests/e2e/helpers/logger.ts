/**
 * Tiny level-aware logger that respects E2E_LOG_LEVEL.
 *
 * Levels (in order of verbosity):
 *   silent  — no output
 *   error   — only errors
 *   warn    — warnings + errors
 *   info    — informational + above (default)
 *   debug   — everything
 *
 * Honors NO_COLOR convention: set NO_COLOR=1 to disable ANSI colours.
 */

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type Level = keyof typeof LEVELS;

const CURRENT: Level = ((process.env.E2E_LOG_LEVEL as Level | undefined) ?? 'info');
const COLOUR = process.env.NO_COLOR ? false : true;

const COLOURS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function paint(colour: string, text: string): string {
  return COLOUR ? `${colour}${text}${COLOURS.reset}` : text;
}

export class Logger {
  constructor(private readonly namespace: string) {}

  private log(level: Level, message: string): void {
    if (LEVELS[CURRENT] < LEVELS[level]) return;
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const tag = paint(COLOURS.gray, `[${ts}]`);
    const ns = paint(COLOURS.blue, `[${this.namespace}]`);
    let body: string;
    switch (level) {
      case 'error':
        body = paint(COLOURS.red, message);
        break;
      case 'warn':
        body = paint(COLOURS.yellow, message);
        break;
      case 'debug':
        body = paint(COLOURS.gray, message);
        break;
      default:
        body = message;
    }
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(`${tag} ${ns} ${body}\n`);
  }

  error(message: string, err?: unknown): void {
    const extra = err instanceof Error ? ` — ${err.message}` : '';
    this.log('error', message + extra);
  }
  warn(message: string): void {
    this.log('warn', message);
  }
  info(message: string): void {
    this.log('info', message);
  }
  debug(message: string): void {
    this.log('debug', message);
  }
}
