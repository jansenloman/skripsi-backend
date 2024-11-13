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
  const connection = await pool.getConnection();

  try {
    const [users] = await connection.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    res.json({ exists: users.length > 0 });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// Register atau Login Function
const registerOrLoginAccount = async (email, password) => {
  const connection = await pool.getConnection();

  try {
    // Validasi input
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    // Log untuk debugging
    console.log("Checking existing user for:", email);

    const [users] = await connection.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    let user = users[0];
    let isNewUser = false;

    if (!user) {
      console.log("Creating new user for:", email);

      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationCode = generateVerificationCode();
      const codeExpiration = generateExpirationTime();

      const [result] = await connection.execute(
        "INSERT INTO users (email, password, verification_code, code_expiration, verified) VALUES (?, ?, ?, ?, FALSE)",
        [email, hashedPassword, verificationCode, codeExpiration]
      );

      console.log("User created with ID:", result.insertId);

      const emailSent = await sendVerificationEmail(email, verificationCode);
      if (!emailSent) {
        console.error("Failed to send verification email to:", email);
      }

      user = {
        user_id: result.insertId,
        email,
        verified: false,
        emailSent: emailSent,
      };
      isNewUser = true;
    } else {
      if (!user.verified) {
        const verificationCode = generateVerificationCode();
        const codeExpiration = generateExpirationTime();

        await connection.execute(
          "UPDATE users SET verification_code = ?, code_expiration = ? WHERE user_id = ?",
          [verificationCode, codeExpiration, user.user_id]
        );

        await sendVerificationEmail(email, verificationCode);

        throw new Error("Please verify your email first");
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        throw new Error("Invalid password");
      }
    }

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
    console.error("Detailed error in registerOrLoginAccount:", error);
    throw error;
  } finally {
    connection.release();
  }
};

// Fungsi verifikasi (Email)
const verifyEmail = async (req, res) => {
  const { code } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    console.log("Verifying code:", code);

    // Get user with verification code
    const [users] = await connection.execute(
      "SELECT user_id, email, verified, code_expiration FROM users WHERE verification_code = ?",
      [code]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Kode verifikasi tidak valid",
      });
    }

    const user = users[0];

    // Cek expired
    if (new Date(user.code_expiration) < new Date()) {
      await connection.rollback();
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
    await connection.execute(
      "UPDATE users SET verified = TRUE, verification_code = NULL WHERE user_id = ?",
      [user.user_id]
    );

    await connection.commit();

    console.log("Verification successful for user:", user.email);

    return res.status(200).json({
      success: true,
      message: "Email berhasil diverifikasi",
      token: token,
      email: user.email,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat verifikasi",
    });
  } finally {
    connection.release();
  }
};

// Fungsi resendVerification
const resendVerification = async (req, res) => {
  const { email } = req.body;
  const connection = await pool.getConnection();

  try {
    const [users] = await connection.execute(
      "SELECT * FROM users WHERE email = ? AND verified = FALSE",
      [email]
    );

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Email tidak ditemukan atau sudah terverifikasi",
      });
    }

    const verificationCode = generateVerificationCode();
    const codeExpiration = generateExpirationTime();

    await connection.execute(
      "UPDATE users SET verification_code = ?, code_expiration = ? WHERE user_id = ?",
      [verificationCode, codeExpiration, users[0].user_id]
    );

    const emailSent = await sendVerificationEmail(email, verificationCode);
    if (!emailSent) {
      throw new Error("Gagal mengirim email verifikasi");
    }

    res.json({
      success: true,
      message: "Email verifikasi telah dikirim ulang",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    connection.release();
  }
};

const checkVerification = async (req, res) => {
  const { email } = req.body;
  const connection = await pool.getConnection();

  try {
    const [users] = await connection.execute(
      "SELECT user_id, email, verified FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const user = users[0];

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
    connection.release();
  }
};

module.exports = {
  checkEmail,
  registerOrLoginAccount,
  verifyEmail,
  resendVerification,
  checkVerification,
};
