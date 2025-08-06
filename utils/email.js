const nodemailer = require("nodemailer");
require("dotenv").config();

const BASE_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  debug: true,
});

// Fungsi untuk test koneksi email
const testEmailConnection = async () => {
  try {
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

    const link = `${BASE_URL}/verify/${verificationCode}`;

    const htmlContent = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">

    <div style="background-color: #4CAF50; padding: 16px; text-align: center;">
      <h1 style="color: white; font-size: 24px; margin: 0;">Schedule App</h1>
    </div>

    <div style="padding: 24px;">
      <h2 style="color: #333; font-size: 20px;">Verifikasi Email Anda</h2>
      <p style="font-size: 16px; color: #555;">Terima kasih telah mendaftar di Schedule App! Untuk menyelesaikan pendaftaran, klik tombol di bawah ini:</p>

      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
        <tr>
          <td align="center" bgcolor="#4CAF50" style="border-radius: 5px;">
            <a href="${link}"
               style="font-size: 16px; font-family: Arial, sans-serif; color: #ffffff; text-decoration: none; padding: 12px 24px; display: inline-block;">
               Verifikasi Email
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size: 14px; color: #555;">Atau copy-paste link berikut ke browser Anda jika tombol tidak berfungsi:</p>
      <p style="word-break: break-all; color: #007BFF;">${link}</p>

      <p style="font-size: 13px; color: #999;">Link ini akan kedaluwarsa dalam 24 jam.</p>
      <p style="font-size: 13px; color: #999;">Jika Anda tidak mendaftar di aplikasi kami, abaikan email ini.</p>
    </div>

    <div style="background-color: #f9f9f9; text-align: center; padding: 16px;">
      <p style="font-size: 12px; color: #aaa;">© ${new Date().getFullYear()} Schedule App. All rights reserved.</p>
    </div>
  </div>
`;

    const plainTextContent = `Terima kasih telah mendaftar.

Untuk menyelesaikan pendaftaran, silakan klik link berikut:
${link}

Link ini akan kadaluarsa dalam 24 jam.

Jika Anda tidak mendaftar di aplikasi kami, abaikan email ini.`;

    const info = await transporter.sendMail({
      from: `"Schedule App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verifikasi Email Anda",
      text: plainTextContent,
      html: htmlContent,
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
