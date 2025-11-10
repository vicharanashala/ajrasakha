import nodemailer from 'nodemailer'
export async function sendEmailNotification(email: string,title:string,message:string){
    console.log("crede ",process.env.EMAIL_USER,  process.env.EMAIL_PASS )
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
     transporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: title,
      text: message,
    });
    console.log("Otp sent successfully!")
  }
