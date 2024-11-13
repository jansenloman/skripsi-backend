const express = require("express");
const {
  checkEmail,
  registerOrLoginAccount,
  verifyEmail,
  resendVerification,
  checkVerification,
} = require("../controllers/account");

const router = express.Router();

// Route for checking if email exists
router.post("/check-email", checkEmail);

// Route for login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await registerOrLoginAccount(email, password);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route for registration
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  console.log("Registration attempt for:", email);

  try {
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const result = await registerOrLoginAccount(email, password);

    res.status(200).json(result);
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).json({
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Add verification route
router.get("/verify/:code", verifyEmail);

// Add resend verification route
router.post("/resend-verification", resendVerification);

// Add check verification route
router.post("/check-verification", checkVerification);

module.exports = router;
