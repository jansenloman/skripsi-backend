const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  debug: true,
});

// Fungsi untuk test koneksi email
const testEmailConnection = async () => {
  try {
    // Log credentials (jangan gunakan di production)
    console.log("Testing email with credentials:", {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS ? "[PASSWORD SET]" : "[PASSWORD MISSING]",
    });

    await transporter.verify();
    console.log("Email server connection successful");
    return true;
  } catch (error) {
    console.error("Email server connection failed:", error);
    return false;
  }
};

const sendVerificationEmail = async (email, verificationCode) => {
  try {
    console.log("Attempting to send email to:", email);

    const info = await transporter.sendMail({
      from: `"Schedule App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verifikasi Email Anda",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verifikasi Email Anda</h2>
          <p>Terima kasih telah mendaftar. Untuk menyelesaikan pendaftaran, silakan klik link di bawah ini:</p>
          <p>
            <a href="http://localhost:5173/verify/${verificationCode}" 
               style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Verifikasi Email
            </a>
          </p>
          <p>Atau copy paste link berikut:</p>
          <p>http://localhost:5173/verify/${verificationCode}</p>
          <p>Link ini akan kadaluarsa dalam 24 jam.</p>
          <p>Jika Anda tidak mendaftar di aplikasi kami, abaikan email ini.</p>
        </div>
      `,
    });

    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Detailed email error:", error);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  testEmailConnection,
};
