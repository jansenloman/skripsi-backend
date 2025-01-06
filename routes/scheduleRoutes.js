const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");

const {
  generateSchedule,
  getJadwalMingguan,
  getUpcomingSchedule,
  getLastFormInput,
  toggleTaskVisibility,
  resolveConflict
} = require("../controllers/schedule");

const {
  getJadwalKuliah,
  addJadwalKuliah,
  editJadwalKuliah,
  deleteJadwalKuliah,
} = require("../controllers/jadwalKuliah");

const {
  getJadwalMendatang,
  addJadwalMendatang,
  editJadwalMendatang,
  deleteJadwalMendatang,
  getJadwalMendatangHistory,
  getJadwalMendatangHistoryDetail,
} = require("../controllers/jadwalMendatang");

const scheduleController = require("../controllers/schedule");

// Protect all routes
router.use(authMiddleware);

// Generate schedule
router.post("/generate-schedule", generateSchedule);

// Get jadwal mingguan
router.get("/jadwal-mingguan", getJadwalMingguan);

// Get last form input
router.get("/last-form-input", getLastFormInput);

// Get upcoming schedule
router.get("/upcoming", getUpcomingSchedule);

// Resolve schedule conflict
router.post("/resolve-conflict", resolveConflict);

// Toggle task visibility
router.put("/task/:taskId/toggle-visibility", toggleTaskVisibility);

// Delete a task
router.delete('/task/:taskId', authMiddleware, scheduleController.deleteTask);

// Get jadwal kuliah
router.get("/jadwal-kuliah", getJadwalKuliah);
router.post("/jadwal-kuliah", addJadwalKuliah);
router.put("/jadwal-kuliah/:kuliah_id", editJadwalKuliah);
router.delete("/jadwal-kuliah/:kuliah_id", deleteJadwalKuliah);

// Get jadwal mendatang
router.get("/jadwal-mendatang", getJadwalMendatang);
router.post("/jadwal-mendatang", addJadwalMendatang);
router.put("/jadwal-mendatang/:id", editJadwalMendatang);
router.delete("/jadwal-mendatang/:id", deleteJadwalMendatang);

// Get jadwal mendatang history
router.get("/jadwal-mendatang-history", getJadwalMendatangHistory);
router.get("/jadwal-mendatang-history/:id", getJadwalMendatangHistoryDetail);

module.exports = router;
