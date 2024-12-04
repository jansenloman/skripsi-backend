const bcrypt = require("bcrypt");
const pool = require("../config/database");
const jwt = require("jsonwebtoken");
const {
  generateVerificationCode,
  generateExpirationTime,
} = require("../utils/verification");
const { sendVerificationEmail } = require("../utils/email");

// Check user exist or not (Login)
const checkEmail = async (req, res) => {
  const { email } = req.body;
  const client = await pool.connect();

  try {
    const result = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    res.json({ exists: result.rows.length > 0 });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Register atau Login Function
const registerOrLoginAccount = async (email, password) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    let user = result.rows[0];
    let isNewUser = false;

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationCode = generateVerificationCode();
      const codeExpiration = generateExpirationTime();

      const insertResult = await client.query(
        "INSERT INTO users (email, password, verification_code, code_expiration, verified) VALUES ($1, $2, $3, $4, FALSE) RETURNING user_id",
        [email, hashedPassword, verificationCode, codeExpiration]
      );

      user = {
        user_id: insertResult.rows[0].user_id,
        email,
        verified: false,
      };
      isNewUser = true;
    } else {
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error("Password salah, coba periksa kembali");
      }
    }

    await client.query("COMMIT");

    const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    return {
      userId: user.user_id,
      email: user.email,
      isNewUser,
      verified: user.verified,
      token: user.verified ? token : null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Fungsi verifikasi (Email)
const verifyEmail = async (req, res) => {
  const { code } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Verifying code:", code);

    // Get user with verification code
    const result = await client.query(
      "SELECT user_id, email, verified, code_expiration FROM users WHERE verification_code = $1",
      [code]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Kode verifikasi tidak valid",
      });
    }

    const user = result.rows[0];

    // Cek expired
    if (new Date(user.code_expiration) < new Date()) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Kode verifikasi sudah kadaluarsa",
      });
    }

    // Generate token
    const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    // Update user status
    await client.query(
      "UPDATE users SET verified = TRUE, verification_code = NULL WHERE user_id = $1",
      [user.user_id]
    );

    await client.query("COMMIT");

    console.log("Verification successful for user:", user.email);

    return res.status(200).json({
      success: true,
      message: "Email berhasil diverifikasi",
      token: token,
      email: user.email,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat verifikasi",
    });
  } finally {
    client.release();
  }
};

// Fungsi resendVerification
const resendVerification = async (req, res) => {
  const { email } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM users WHERE email = $1 AND verified = FALSE",
      [email]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Email tidak ditemukan atau sudah terverifikasi",
      });
    }

    const verificationCode = generateVerificationCode();
    const codeExpiration = generateExpirationTime();

    await client.query(
      "UPDATE users SET verification_code = $1, code_expiration = $2 WHERE user_id = $3",
      [verificationCode, codeExpiration, result.rows[0].user_id]
    );

    const emailSent = await sendVerificationEmail(email, verificationCode);
    if (!emailSent) {
      await client.query("ROLLBACK");
      throw new Error("Gagal mengirim email verifikasi");
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Email verifikasi telah dikirim ulang",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    client.release();
  }
};

const checkVerification = async (req, res) => {
  const { email } = req.body;
  const client = await pool.connect();

  try {
    const result = await client.query(
      "SELECT user_id, email, verified FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const user = result.rows[0];

    if (user.verified) {
      // Generate token jika terverifikasi
      const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });

      return res.status(200).json({
        success: true,
        verified: true,
        token: token,
        email: user.email,
      });
    }

    return res.status(200).json({
      success: true,
      verified: false,
    });
  } catch (error) {
    console.error("Check verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat mengecek verifikasi",
    });
  } finally {
    client.release();
  }
};

// Tambahkan fungsi changePassword
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    // Get user's current password
    const result = await client.query(
      "SELECT user_id, password FROM users WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User tidak ditemukan",
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      result.rows[0].password
    );

    if (!isValidPassword) {
      return res.status(400).json({
        message: "Password saat ini tidak sesuai",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await client.query("UPDATE users SET password = $1 WHERE user_id = $2", [
      hashedNewPassword,
      userId,
    ]);

    res.json({
      message: "Password berhasil diubah",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      message: "Terjadi kesalahan saat mengubah password",
    });
  } finally {
    client.release();
  }
};

module.exports = {
  checkEmail,
  registerOrLoginAccount,
  verifyEmail,
  resendVerification,
  checkVerification,
  changePassword,
};
