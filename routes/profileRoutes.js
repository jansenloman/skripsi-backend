const express = require("express");
const router = express.Router();
const { getProfile, updateProfile } = require("../controllers/profile");
const authMiddleware = require("../middleware/auth");

// Apply auth middleware to all routes
router.use(authMiddleware);

// Profile routes
router.get("/", getProfile);
router.put("/update", updateProfile);

module.exports = router;
