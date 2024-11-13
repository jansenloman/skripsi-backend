const pool = require("../config/database");

// Get jadwal kuliah
const getJadwalKuliah = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM jadwal_kuliah WHERE user_id = ? ORDER BY FIELD(hari, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'), jam_mulai",
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const validateTime = (jamMulai, jamSelesai) => {
  const [startHour, startMinute] = jamMulai.split(":").map(Number);
  const [endHour, endMinute] = jamSelesai.split(":").map(Number);

  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;

  return endTime > startTime;
};

// Add jadwal kuliah
const addJadwalKuliah = async (req, res) => {
  try {
    const { hari, jam_mulai, jam_selesai, mata_kuliah } = req.body;

    // Validasi input
    if (!hari || !jam_mulai || !jam_selesai || !mata_kuliah) {
      return res.status(400).json({
        success: false,
        error: "Semua field harus diisi",
      });
    }

    // Validasi format waktu
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(jam_mulai) || !timeRegex.test(jam_selesai)) {
      return res.status(400).json({
        success: false,
        error: "Format waktu tidak valid (HH:mm)",
      });
    }

    // Validasi waktu
    if (!validateTime(jam_mulai, jam_selesai)) {
      return res.status(400).json({
        success: false,
        error: "Jam selesai harus lebih besar dari jam mulai",
      });
    }

    const [result] = await pool.query(
      "INSERT INTO jadwal_kuliah (user_id, hari, jam_mulai, jam_selesai, mata_kuliah) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, hari, jam_mulai, jam_selesai, mata_kuliah]
    );

    res.status(201).json({
      success: true,
      message: "Jadwal kuliah berhasil ditambahkan",
      data: {
        kuliah_id: result.insertId,
        user_id: req.user.id,
        hari,
        jam_mulai,
        jam_selesai,
        mata_kuliah,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Edit jadwal kuliah
const editJadwalKuliah = async (req, res) => {
  try {
    const { kuliah_id } = req.params;
    const { hari, jam_mulai, jam_selesai, mata_kuliah } = req.body;

    // Validasi waktu
    if (!validateTime(jam_mulai, jam_selesai)) {
      return res.status(400).json({
        success: false,
        error: "Jam selesai harus lebih besar dari jam mulai",
      });
    }

    const [result] = await pool.query(
      "UPDATE jadwal_kuliah SET hari = ?, jam_mulai = ?, jam_selesai = ?, mata_kuliah = ? WHERE kuliah_id = ? AND user_id = ?",
      [hari, jam_mulai, jam_selesai, mata_kuliah, kuliah_id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Jadwal kuliah tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Jadwal kuliah berhasil diupdate",
      data: {
        kuliah_id,
        user_id: req.user.id,
        hari,
        jam_mulai,
        jam_selesai,
        mata_kuliah,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete jadwal kuliah
const deleteJadwalKuliah = async (req, res) => {
  try {
    const { kuliah_id } = req.params;

    const [result] = await pool.query(
      "DELETE FROM jadwal_kuliah WHERE kuliah_id = ? AND user_id = ?",
      [kuliah_id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Jadwal kuliah tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Jadwal kuliah berhasil dihapus",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getJadwalKuliah,
  addJadwalKuliah,
  editJadwalKuliah,
  deleteJadwalKuliah,
};
