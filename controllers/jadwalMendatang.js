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
    const currentDate = new Date();
    const currentTime = currentDate.toLocaleTimeString("id-ID", {
      hour12: false,
      timeZone: "Asia/Jakarta",
    });
    // console.log("Current DateTime:", currentDate.toISOString());
    // console.log("Current Time (WIB):", currentTime);

    const result = await pool.query(
      `SELECT 
        *,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::TIME as current_time,
        (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta')::DATE as current_date
       FROM jadwal_mendatang 
       WHERE user_id = $1 
       AND (tanggal > (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta')::DATE
            OR (tanggal = (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta')::DATE 
                AND jam_selesai > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::TIME))
       ORDER BY tanggal, jam_mulai`,
      [req.user.id]
    );

    // Log each schedule's comparison
    // result.rows.forEach((row) => {
    //   console.log("\nSchedule Comparison:");
    //   console.log("Schedule ID:", row.id);
    //   console.log("Tanggal:", row.tanggal);
    //   console.log("Current Date:", row.current_date);
    //   console.log("Jam Mulai:", row.jam_mulai);
    //   console.log("Jam Selesai:", row.jam_selesai);
    //   console.log("Current Time:", row.current_time);
    //   console.log("Is Future Date:", row.tanggal > row.current_date);
    //   console.log(
    //     "Is Today:",
    //     row.tanggal.toDateString() === new Date().toDateString()
    //   );
    //   console.log("Is Not Finished:", row.jam_selesai > row.current_time);
    // });

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error in getJadwalMendatang:", error);
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

    const result = await pool.query(
      "INSERT INTO jadwal_mendatang (user_id, tanggal, kegiatan, deskripsi, jam_mulai, jam_selesai) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
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
      data: result.rows[0],
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

    const result = await pool.query(
      "UPDATE jadwal_mendatang SET tanggal = $1, kegiatan = $2, deskripsi = $3, jam_mulai = $4, jam_selesai = $5 WHERE id = $6 AND user_id = $7 RETURNING *",
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

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Jadwal mendatang tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Jadwal mendatang berhasil diupdate",
      data: result.rows[0],
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

    const result = await pool.query(
      "DELETE FROM jadwal_mendatang WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
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
    const currentDate = new Date();
    const currentTime = currentDate.toLocaleTimeString("id-ID", {
      hour12: false,
      timeZone: "Asia/Jakarta",
    });
    // console.log("Current DateTime:", currentDate.toISOString());
    // console.log("Current Time (WIB):", currentTime);

    const result = await pool.query(
      `SELECT 
         id,
         user_id,
         tanggal,
         kegiatan,
         deskripsi,
         jam_mulai,
         jam_selesai,
         (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::TIME as current_time,
         (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta')::DATE as current_date
       FROM jadwal_mendatang 
       WHERE user_id = $1 
       AND (tanggal < (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta')::DATE
            OR (tanggal = (CURRENT_DATE AT TIME ZONE 'Asia/Jakarta')::DATE 
                AND jam_selesai <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::TIME))
       ORDER BY tanggal DESC, jam_mulai DESC`,
      [req.user.id]
    );

    // Log each history schedule's comparison
    // result.rows.forEach((row) => {
    //   console.log("\nHistory Schedule Comparison:");
    //   console.log("Schedule ID:", row.id);
    //   console.log("Tanggal:", row.tanggal);
    //   console.log("Current Date:", row.current_date);
    //   console.log("Jam Mulai:", row.jam_mulai);
    //   console.log("Jam Selesai:", row.jam_selesai);
    //   console.log("Current Time:", row.current_time);
    //   console.log("Is Past Date:", row.tanggal < row.current_date);
    //   console.log(
    //     "Is Today:",
    //     row.tanggal.toDateString() === new Date().toDateString()
    //   );
    //   console.log("Is Finished:", row.jam_selesai <= row.current_time);
    // });

    res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        tanggal: row.tanggal,
        kegiatan: row.kegiatan,
        deskripsi: row.deskripsi,
        jam_mulai: row.jam_mulai,
        jam_selesai: row.jam_selesai,
      })),
    });
  } catch (error) {
    console.error("Error in getJadwalMendatangHistory:", error);
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
