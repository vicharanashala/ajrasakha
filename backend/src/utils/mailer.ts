import nodemailer from 'nodemailer'

// const transporter = nodemailer.createTransport({
// //   host: process.env.SMTP_HOST,
//   host: 'smtp.ethereal.email',
//   port: Number(process.env.SMTP_PORT), // make sure it's a number
//   secure: true,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// } as TransportOptions);

// // Function to send an email
// async function sendEmail(to, subject, htmlContent) {
//   try {
//     const info = await transporter.sendMail({
//       from: `"Annam AI" <${process.env.EMAIL_USER}>`,
//       to,
//       subject,
//       html: htmlContent,
//     });

//     console.log("✅ Email sent successfully:", info.messageId);
//   } catch (error) {
//     console.error("❌ Error sending email:", error);
//   } 
// }

// // Example usage
// sendEmail("abiramk@annam.ai", "Welcome to Annam AI", "<h2>Hello from Zoho!</h2>");



function sendOTP(email: string, otp: string){
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
     transporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}. It is valid for 10 minutes.`,
    });
    // return { message: "Otp sent successfully!" };
    console.log("Otp sent successfully!")
  }

  sendOTP('bibin.t@annam.ai','12334')