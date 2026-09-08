import {emailConfig} from '#root/config/mail.js';
import {env} from './env.js';
import nodemailer from 'nodemailer';

/**
 * SMTP transport configuration is read from env so the same code works against
 * Zoho (production default), Gmail (dev / common case), AWS SES, etc.
 *
 *   SMTP_SERVICE=gmail|hotmail|outlook|yahoo|...  → uses nodemailer's built-in preset
 *   SMTP_HOST=smtp.zoho.in                         → explicit host (overrides SERVICE)
 *   SMTP_PORT=465
 *   SMTP_SECURE=true|false
 *
 * Defaults intentionally preserve the legacy Zoho-in:465 behaviour so existing
 * deployments keep working unchanged.
 */
const SMTP_SERVICE: string | null = env('SMTP_SERVICE') || null;
const SMTP_HOST = env('SMTP_HOST') || 'smtp.zoho.in';
const SMTP_PORT = Number(env('SMTP_PORT') || 465);
const SMTP_SECURE =
  env('SMTP_SECURE') !== undefined
    ? String(env('SMTP_SECURE')).toLowerCase() === 'true'
    : true; // 465 is implicit TLS — preserve legacy behaviour

/**
 * Builds the nodemailer transport options. When neither `EMAIL_USER` nor
 * `EMAIL_PASS` is configured we return `null` so callers can short-circuit
 * instead of constructing a transport that will fail authentication with 535.
 *
 * Returning `any` here is intentional — nodemailer's `TransportOptions` union
 * type doesn't accept both `{service}` and `{host, port}` literals, so we let
 * `createTransport()` validate the shape at the call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTransportOptions(): any | null {
  const user = emailConfig.EMAIL_USER;
  const pass = emailConfig.EMAIL_PASS;
  if (!user || !pass) return null;

  if (SMTP_SERVICE) {
    return {service: SMTP_SERVICE, auth: {user, pass}};
  }
  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {user, pass},
  };
}

export async function sendEmailNotification(
  email: string | string[],
  title: string,
  message: string,
  html?: string,
) {
  const transportOptions = buildTransportOptions();
  if (!transportOptions) {
    console.warn(
      '[mailer] EMAIL_USER/EMAIL_PASS not configured — skipping email.',
    );
    return;
  }

  const transporter = nodemailer.createTransport(transportOptions);

  try {
    const info = await transporter.sendMail({
      from: `"Agri Platform" <${emailConfig.EMAIL_USER}>`,
      to: email,
      subject: title,
    // text: message,
      html,
    });
  } catch (error) {
    throw error;
  }
}


export async function sendEmailWithAttachment(
  email: string | string[],
  title: string,
  html: string,
  // fileContent: string,
  fileContent: string | Buffer,
  filename: string,
  contentType?: string,
  // Inline (CID) images referenced from `html` as `<img src="cid:...">`. Passed straight through
  // to nodemailer's `attachments`, which treats an entry carrying a `cid` as an inline part rather
  // than a downloadable file.
  inlineImages?: {
    filename: string;
    content: Buffer;
    contentType: string;
    cid: string;
  }[],
  // Optional CC recipient(s), passed straight through to nodemailer's `cc` field.
  cc?: string | string[],
) {
  const transportOptions = buildTransportOptions();
  if (!transportOptions) {
    console.warn(
      '[mailer] EMAIL_USER/EMAIL_PASS not configured — skipping email.',
    );
    return;
  }

  const transporter = nodemailer.createTransport(transportOptions);
  await transporter.sendMail({
    from: `"Agri Platform" <${emailConfig.EMAIL_USER}>`,
    to: email,
    ...(cc ? {cc} : {}),
    subject: title,
    html,
    attachments: [
      {
        filename,
        content: fileContent,
        // contentType: 'text/csv',
        contentType: contentType || 'text/csv',
      },
      ...(inlineImages ?? []),
    ],
  });
}