const pool = require("../config/database");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const fs = require("fs");

// Get jadwal kuliah
const getJadwalKuliah = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM jadwal_kuliah 
       WHERE user_id = $1 
       ORDER BY 
         CASE hari 
           WHEN 'Senin' THEN 1 
           WHEN 'Selasa' THEN 2 
           WHEN 'Rabu' THEN 3 
           WHEN 'Kamis' THEN 4 
           WHEN 'Jumat' THEN 5 
           WHEN 'Sabtu' THEN 6 
           WHEN 'Minggu' THEN 7 
         END,
         jam_mulai`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      data: result.rows,
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

    const result = await pool.query(
      "INSERT INTO jadwal_kuliah (user_id, hari, jam_mulai, jam_selesai, mata_kuliah) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.user.id, hari, jam_mulai, jam_selesai, mata_kuliah]
    );

    res.status(201).json({
      success: true,
      message: "Jadwal kuliah berhasil ditambahkan",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
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

    const result = await pool.query(
      "UPDATE jadwal_kuliah SET hari = $1, jam_mulai = $2, jam_selesai = $3, mata_kuliah = $4 WHERE kuliah_id = $5 AND user_id = $6 RETURNING *",
      [hari, jam_mulai, jam_selesai, mata_kuliah, kuliah_id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Jadwal kuliah tidak ditemukan",
      });
    }

    res.status(200).json({
      success: true,
      message: "Jadwal kuliah berhasil diupdate",
      data: result.rows[0],
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

    const result = await pool.query(
      "DELETE FROM jadwal_kuliah WHERE kuliah_id = $1 AND user_id = $2 RETURNING *",
      [kuliah_id, req.user.id]
    );

    if (result.rowCount === 0) {
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

const hariList = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

// Upload dan parsing file jadwal kuliah
const uploadJadwalKuliah = async (req, res) => {
  try {
    const file = req.file;
    let jadwal = [];
    if (!file) return res.status(400).json({ success: false, error: "No file uploaded" });

    let text = "";
    if (file.mimetype === "application/pdf") {
      // PDF parsing
      const dataBuffer = fs.readFileSync(file.path);
      const pdfData = await pdfParse(dataBuffer);
      text = pdfData.text;
    } else if (file.mimetype.startsWith("image/")) {
      // OCR parsing
      const ocrResult = await Tesseract.recognize(file.path, "ind+eng");
      text = ocrResult.data.text;
    } else {
      fs.unlinkSync(file.path);
      return res.status(400).json({ success: false, error: "File type not supported" });
    }
    fs.unlinkSync(file.path); // hapus file upload setelah parsing

    // Parsing text ke array jadwal
    // Asumsi: Setiap baris = Hari, Mata Kuliah, Jam Mulai, Jam Selesai (dipisah tab/koma/spasi)
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      // Cek apakah baris mengandung nama hari
      const hari = hariList.find(h => line.toLowerCase().includes(h.toLowerCase()));
      if (hari) {
        // Ekstrak jam dan mata kuliah
        // Contoh baris: Senin Matematika 08:00 09:40
        // atau: Senin, Matematika, 08:00, 09:40
        const parts = line.split(/[\s,;|\t]+/).filter(Boolean);
        // Cari index hari
        const idxHari = parts.findIndex(p => p.toLowerCase() === hari.toLowerCase());
        // Cari jam (format HH:mm)
        const jamRegex = /([01]?[0-9]|2[0-3]):[0-5][0-9]/g;
        const jamMatches = line.match(jamRegex);
        if (jamMatches && jamMatches.length >= 2) {
          // Mata kuliah = gabungan setelah hari sampai sebelum jam
          let mataKuliah = parts.slice(idxHari + 1, parts.length - 2).join(" ");
          if (!mataKuliah) mataKuliah = "-";
          jadwal.push({
            hari,
            mata_kuliah: mataKuliah,
            jam_mulai: jamMatches[0],
            jam_selesai: jamMatches[1],
          });
        }
      }
    }
    if (jadwal.length === 0) {
      return res.status(400).json({ success: false, error: "Tidak ditemukan data jadwal valid di file." });
    }
    res.json({ success: true, data: jadwal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Simpan hasil parsing ke database
const confirmUploadJadwalKuliah = async (req, res) => {
  try {
    const { jadwal } = req.body;
    if (!Array.isArray(jadwal)) return res.status(400).json({ success: false, error: "Invalid data" });
    for (const item of jadwal) {
      await pool.query(
        "INSERT INTO jadwal_kuliah (user_id, hari, jam_mulai, jam_selesai, mata_kuliah) VALUES ($1, $2, $3, $4, $5)",
        [req.user.id, item.hari, item.jam_mulai, item.jam_selesai, item.mata_kuliah]
      );
    }
    res.json({ success: true, message: "Jadwal berhasil disimpan" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getJadwalKuliah,
  addJadwalKuliah,
  editJadwalKuliah,
  deleteJadwalKuliah,
  uploadJadwalKuliah,
  confirmUploadJadwalKuliah,
};
