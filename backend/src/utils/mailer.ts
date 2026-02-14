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
  
  try {
    const info = await transporter.sendMail({
      from: `"Review System Report" <${user}>`,
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
  fileContent: string,
  filename: string,
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
    from: `"Review System Report" <${emailConfig.EMAIL_USER}>`,
    to: email,
    subject: title,
    html,
    attachments: [
      {
        filename,
        content: fileContent,
        contentType: 'text/csv',
      },
    ],
  });
}