const { formatDate, formatTime } = require("../utils/dateTimeHelper");
const pool = require("../config/database");

//  fungsi helper untuk mengambil data jadwal
const getJadwalKuliahData = async (userId) => {
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
      [userId]
    );
    return result.rows;
  } catch (error) {
    throw error;
  }
};

const getJadwalMendatangData = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT * FROM jadwal_mendatang 
       WHERE user_id = $1 
       AND tanggal >= CURRENT_DATE 
       ORDER BY tanggal, jam_mulai`,
      [userId]
    );
    return result.rows;
  } catch (error) {
    throw error;
  }
};

//  fungsi helper untuk format settings
const formatSettings = (settings) => {
  if (!settings.rows[0]) return "Tidak ada pengaturan jadwal";

  const s = settings.rows[0];
  return `
    Waktu Bangun: ${formatTime(s.wake_time)}
    Waktu Tidur: ${formatTime(s.sleep_time)}
    
    Waktu Makan:
    - Sarapan: ${formatTime(s.breakfast_time)} (${s.breakfast_duration} menit)
    - Makan Siang: ${formatTime(s.lunch_time)} (${s.lunch_duration} menit)
    - Makan Malam: ${formatTime(s.dinner_time)} (${s.dinner_duration} menit)
    
    Waktu Istirahat: ${formatTime(s.rest_time)} (${s.rest_duration} menit)
    
    Waktu Produktif:
    - Mulai: ${formatTime(s.productive_time_start)}
    - Selesai: ${formatTime(s.productive_time_end)}
  `.trim();
};

// Pastikan semua fungsi format sudah ada
const formatProfileData = (profile) => {
  if (!profile) return "Tidak ada data profil";
  return `
    Nama: ${profile.name || "Tidak diisi"}
    Hobi: ${profile.hobby || "Tidak diisi"}
    Kegiatan Harian: ${profile.daily_task || "Tidak diisi"}
    Detail Lain: ${profile.other_details || "Tidak diisi"}
  `.trim();
};

const formatJadwalKuliah = (jadwalKuliah) => {
  if (!jadwalKuliah.length) return "Tidak ada jadwal kuliah";
  return jadwalKuliah
    .map(
      (jk) =>
        `- ${jk.hari}: ${jk.mata_kuliah} (${formatTime(
          jk.jam_mulai
        )} - ${formatTime(jk.jam_selesai)})`
    )
    .join("\n");
};

const formatJadwalMendatang = (jadwalMendatang) => {
  if (!jadwalMendatang.length) return "Tidak ada jadwal mendatang";
  return jadwalMendatang
    .map(
      (jm) =>
        `- ${formatDate(jm.tanggal)}: ${jm.kegiatan} (${formatTime(
          jm.jam_mulai
        )} - ${formatTime(jm.jam_selesai)})`
    )
    .join("\n");
};

module.exports = {
  getJadwalKuliahData,
  getJadwalMendatangData,
  formatSettings,
  formatProfileData,
  formatJadwalKuliah,
  formatJadwalMendatang,
};
