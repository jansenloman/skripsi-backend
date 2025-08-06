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
        `- ${formatDate(jm.tanggal)} (${getDayName(jm.tanggal)}): ${jm.kegiatan} (${formatTime(
          jm.jam_mulai
        )} - ${formatTime(jm.jam_selesai)})`
    )
    .join("\n");
};

function getDayName(dateString) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const date = new Date(dateString);
  return days[date.getDay()];
}

/**
 * Filter jadwal mendatang hanya untuk minggu berjalan (mulai hari ini sampai Minggu)
 * @param {Array} jadwalMendatang - array jadwal mendatang
 * @returns {Array} - array jadwal mendatang yang hanya di minggu ini
 */
function filterJadwalMendatangUntukMingguIni(jadwalMendatang) {
  const now = new Date();
  // Hari dalam JS: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  const hariIni = now.getDay();
  // Hitung sisa hari ke Minggu (0 = Minggu)
  const hariKeMinggu = 7 - hariIni;
  // Tanggal akhir minggu (Minggu)
  const akhirMinggu = new Date(now);
  akhirMinggu.setDate(now.getDate() + hariKeMinggu);
  akhirMinggu.setHours(23,59,59,999);

  return jadwalMendatang.filter(jm => {
    const tgl = new Date(jm.tanggal);
    // Hanya ambil jadwal mulai hari ini (>= now) sampai Minggu (<= akhirMinggu)
    return tgl >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && tgl <= akhirMinggu;
  });
}

module.exports = {
  getJadwalKuliahData,
  getJadwalMendatangData,
  formatSettings,
  formatProfileData,
  formatJadwalKuliah,
  formatJadwalMendatang,
  filterJadwalMendatangUntukMingguIni,
};
