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
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: {user, pass},
  // });
  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: {
      user,
      pass,
    },
  });
  await transporter.sendMail({
    from: `"Review System Report" <${user}>`,
    to: email,
    subject: title,
    // text: message,
    html,
  });
}
