const pool = require("../config/database");

const validateTime = (jamMulai, jamSelesai) => {
  const [startHour, startMinute] = jamMulai.split(":").map(Number);
  const [endHour, endMinute] = jamSelesai.split(":").map(Number);

  const startTime = startHour * 60 + startMinute;
  const endTime = endHour * 60 + endMinute;

  return endTime > startTime;
};

// Get jadwal mendatang (yang belum lewat)
const getJadwalMendatang = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM jadwal_mendatang 
       WHERE user_id = ? 
       AND (tanggal > CURDATE() 
            OR (tanggal = CURDATE() AND jam_selesai > TIME(NOW())))
       ORDER BY tanggal, jam_mulai`,
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

// Add jadwal mendatang
const addJadwalMendatang = async (req, res) => {
  try {
    const {
      tanggal,
      kegiatan,
      deskripsi = null,
      jam_mulai,
      jam_selesai,
    } = req.body;

    // Validasi tanggal
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inputDate = new Date(tanggal + "T00:00:00");

    if (inputDate < today) {
      return res.status(400).json({
        success: false,
        error: "Tidak dapat menambahkan jadwal untuk tanggal yang sudah lewat",
      });
    }

    // Jika tanggal sama dengan hari ini, validasi jam
    if (inputDate.getTime() === today.getTime()) {
      const now = new Date();
      const [hours, minutes] = jam_mulai.split(":");
      const inputTime = new Date();
      inputTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (inputTime < now) {
        return res.status(400).json({
          success: false,
          error: "Tidak dapat menambahkan jadwal untuk waktu yang sudah lewat",
        });
      }
    }

    // Validasi waktu
    if (!validateTime(jam_mulai, jam_selesai)) {
      return res.status(400).json({
        success: false,
        error: "Jam selesai harus lebih besar dari jam mulai",
      });
    }

    const [result] = await pool.query(
      "INSERT INTO jadwal_mendatang (user_id, tanggal, kegiatan, deskripsi, jam_mulai, jam_selesai) VALUES (?, ?, ?, ?, ?, ?)",
      [
        req.user.id,
        tanggal,
        kegiatan,
        deskripsi || null,
        jam_mulai,
        jam_selesai,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Jadwal mendatang berhasil ditambahkan",
      data: {
        id: result.insertId,
        user_id: req.user.id,
        tanggal,
        kegiatan,
        deskripsi,
        jam_mulai,
        jam_selesai,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Edit jadwal mendatang
const editJadwalMendatang = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tanggal,
      kegiatan,
      deskripsi = null,
      jam_mulai,
      jam_selesai,
    } = req.body;

    // Validasi waktu
    if (!validateTime(jam_mulai, jam_selesai)) {
      return res.status(400).json({
        success: false,
        error: "Jam selesai harus lebih besar dari jam mulai",
      });
    }

    const [result] = await pool.query(
      "UPDATE jadwal_mendatang SET tanggal = ?, kegiatan = ?, deskripsi = ?, jam_mulai = ?, jam_selesai = ? WHERE id = ? AND user_id = ?",
      [
        tanggal,
        kegiatan,
        deskripsi || null,
        jam_mulai,
        jam_selesai,
        id,
        req.user.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Jadwal mendatang tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Jadwal mendatang berhasil diupdate",
      data: {
        id,
        user_id: req.user.id,
        tanggal,
        kegiatan,
        deskripsi,
        jam_mulai,
        jam_selesai,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete jadwal mendatang
const deleteJadwalMendatang = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      "DELETE FROM jadwal_mendatang WHERE id = ? AND user_id = ?",
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Jadwal mendatang tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Jadwal mendatang berhasil dihapus",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get jadwal mendatang history (yang sudah lewat)
const getJadwalMendatangHistory = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM jadwal_mendatang 
       WHERE user_id = ? 
       AND (
         tanggal < CURDATE() 
         OR (
           tanggal = CURDATE() 
           AND TIME(NOW()) > jam_selesai
         )
       )
       ORDER BY tanggal ASC, jam_mulai DESC`,
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

module.exports = {
  getJadwalMendatang,
  addJadwalMendatang,
  editJadwalMendatang,
  deleteJadwalMendatang,
  getJadwalMendatangHistory,
};
