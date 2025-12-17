import {emailConfig} from '#root/config/mail.js';
import nodemailer from 'nodemailer';

export async function sendEmailNotification(
  email: string | string[],
  title: string,
  message: string,
  html?: string,
) {
  const user = emailConfig.EMAIL_USER;
  const pass = emailConfig.EMAIL_PASS;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {user, pass},
  });
  await transporter.sendMail({
    from: process.env.EMAIL,
    to: email,
    subject: title,
    // text: message,
    html,
  });
}
