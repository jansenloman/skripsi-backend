const openai = require("../config/openai");
const pool = require("../config/database");
const { getProfileData } = require("./profile");
const { formatDate, formatTime } = require("../utils/dateTimeHelper");

const model = "gpt-4o";

// Tambahkan fungsi helper untuk mengambil data jadwal
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

// Get jadwal mingguan
const getJadwalMingguan = async (req, res) => {
  try {
    // Debug: Log user ID
    console.log("Fetching schedule for user:", req.user.id);

    const result = await pool.query(
      `SELECT j.schedule_id, j.hari, 
        t.task_id, t.deskripsi, t.jam_mulai, t.jam_selesai, 
        t.type, t.suggestions
       FROM jadwal j 
       LEFT JOIN task t ON j.schedule_id = t.schedule_id 
       WHERE j.user_id = $1 
       ORDER BY 
         CASE j.hari 
           WHEN 'Monday' THEN 1 
           WHEN 'Tuesday' THEN 2 
           WHEN 'Wednesday' THEN 3 
           WHEN 'Thursday' THEN 4 
           WHEN 'Friday' THEN 5 
           WHEN 'Saturday' THEN 6 
           WHEN 'Sunday' THEN 7 
         END,
         t.jam_mulai`,
      [req.user.id]
    );

    // Debug: Log raw query result
    // console.log("Raw query result:", result.rows);

    // Mapping hari Inggris ke Indonesia
    const hariMapping = {
      Monday: "Senin",
      Tuesday: "Selasa",
      Wednesday: "Rabu",
      Thursday: "Kamis",
      Friday: "Jumat",
      Saturday: "Sabtu",
      Sunday: "Minggu",
    };

    // Daftar hari dalam seminggu
    const hariDefault = [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ];

    // Format data dengan memastikan semua hari ada
    const formattedSchedule = hariDefault.reduce((acc, hari) => {
      acc[hari] = [];
      return acc;
    }, {});

    // Debug log
    // console.log("Result rows:", result.rows);

    // Tambahkan task ke hari yang sesuai dengan pengecekan
    result.rows.forEach((row) => {
      if (row.task_id && row.hari && formattedSchedule[hariMapping[row.hari]]) {
        formattedSchedule[hariMapping[row.hari]].push({
          task_id: row.task_id,
          deskripsi: row.deskripsi,
          jam_mulai: row.jam_mulai,
          jam_selesai: row.jam_selesai,
          type: row.type,
          suggestions: row.suggestions,
        });
      }
    });

    // Debug: Log final formatted schedule
    // console.log("Formatted schedule:", formattedSchedule);

    return res.status(200).json({
      success: true,
      schedule: formattedSchedule,
    });
  } catch (error) {
    console.error("Error in getJadwalMingguan:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete jadwal mingguan setiap hari Minggu
const deleteWeeklySchedule = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM task 
       WHERE schedule_id IN (
         SELECT schedule_id FROM jadwal
       )`
    );
    await client.query("DELETE FROM jadwal");
    await client.query("COMMIT");
    console.log("Weekly schedule deleted successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting weekly schedule:", error);
  } finally {
    client.release();
  }
};

// Setup cron job untuk menghapus jadwal setiap hari Minggu jam 23:59
const cron = require("node-cron");
cron.schedule("59 23 * * 0", () => {
  deleteWeeklySchedule();
});

// Helper function untuk membersihkan response
const cleanJSONResponse = (response) => {
  try {
    // Mencari pattern JSON yang valid (dimulai dengan { dan diakhiri dengan })
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    // Parse JSON untuk memvalidasi
    const cleanedJSON = JSON.parse(jsonMatch[0]);
    return cleanedJSON;
  } catch (error) {
    throw new Error(`Failed to clean JSON response: ${error.message}`);
  }
};

// Mapping hari di level global
const hariMappingReverse = {
  Senin: "Monday",
  Selasa: "Tuesday",
  Rabu: "Wednesday",
  Kamis: "Thursday",
  Jumat: "Friday",
  Sabtu: "Saturday",
  Minggu: "Sunday",
};

// Generate schedule from OpenAI
const generateSchedule = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Simpan form input baru
    const formInputResult = await client.query(
      "INSERT INTO form_input (user_id, input, tambahan) VALUES ($1, $2, $3) RETURNING id",
      [req.user.id, req.body.input || "", req.body.tambahan || ""]
    );
    const formInputId = formInputResult.rows[0].id;

    // 2. Get all required data
    const profile = await getProfileData(req.user.id);
    const settings = await pool.query(
      "SELECT * FROM user_schedule_settings WHERE user_id = $1",
      [req.user.id]
    );
    const jadwalKuliah = await getJadwalKuliahData(req.user.id);
    const jadwalMendatang = await getJadwalMendatangData(req.user.id);

    // 3. Generate schedule dengan OpenAI
    const promptWithContext = `
      Buatkan jadwal mingguan lengkap (full day schedule) berdasarkan data berikut:

      INPUT PENGGUNA:
      ${req.body.input}
      
      DETAIL TAMBAHAN:
      ${req.body.tambahan || "Tidak ada"}

      PROFIL PENGGUNA:
      ${formatProfileData(profile)}

      PENGATURAN JADWAL:
      ${formatSettings(settings)}

      JADWAL KULIAH:
      ${formatJadwalKuliah(jadwalKuliah)}

      JADWAL MENDATANG:
      ${formatJadwalMendatang(jadwalMendatang)}

      ATURAN PENTING:
      1. Buat jadwal LENGKAP dari waktu bangun hingga waktu tidur sesuai pengaturan tanpa adanya waktu yang dilewatkan dari hari Senin sampai Minggu
      2. Waktu aktivitas harus dalam rentang waktu yang ditentukan di pengaturan
      3. Durasi setiap aktivitas tidak boleh melebihi ${
        settings.rows[0]?.durasi_max || 120
      } menit
      4. Berikan jeda waktu istirahat ${
        settings.rows[0]?.waktu_istirahat || 15
      } menit antar aktivitas
      5. Berikan kisaran waktu perjalanan antar tempat yang realistis
      6. Hindari konflik dengan jadwal kuliah dan jadwal mendatang
      7. Prioritaskan preferensi tambahan dari pengaturan
      8. PENTING: Jangan membuat jadwal yang tumpang tindih!

      ATURAN KESEJAHTERAAN PENGGUNA:
      9. Perhatikan pola aktivitas dan beban mental:
         - Setelah 2-3 jam aktivitas berat (kuliah/belajar), WAJIB ada istirahat minimal 15-30 menit
         - Setelah aktivitas menguras mental, berikan saran aktivitas refreshing
         - Jangan letakkan terlalu banyak aktivitas berat berturut-turut
         - Sisipkan waktu untuk sosialisasi dan relaksasi

      10. Waktu Luang dan Saran Aktivitas:
          - Untuk waktu luang pendek (< 1 jam): fokus pada aktivitas refreshing atau persiapan
          - Untuk waktu luang medium (1-2 jam): bisa untuk aktivitas produktif ringan atau hobi
          - Untuk waktu luang panjang (> 2 jam): bisa dibagi untuk produktif dan hobi
          - PENTING: Saran harus mempertimbangkan:
            * Tingkat kelelahan dari aktivitas sebelumnya
            * Persiapan untuk aktivitas selanjutnya
            * Kebutuhan sosialisasi
            * Hobi dan preferensi pengguna

      11. Fleksibilitas dan Keseimbangan:
          - Berikan minimal 2-3 opsi saran untuk setiap waktu luang
          - Sertakan kombinasi aktivitas produktif dan refreshing
          - Untuk waktu malam, prioritaskan aktivitas yang menenangkan
          - Jika ada jadwal padat di siang hari, berikan waktu istirahat yang cukup di malam hari

      12. Format Waktu dan Transisi:
          - Contoh format jadwal:
            * "Kuliah Pagi (09:00 - 12:00)" [fixed]
            * "Istirahat & Makan Siang (12:00 - 13:00)" [basic]
            * "Waktu Luang (13:00 - 14:00)" [free] - Saran: 1) Review materi kuliah, 2) Istirahat sejenak, 3) Persiapan kuliah siang
            * "Perjalanan ke Kampus (14:00 - 14:30)" [basic]
            * "Kuliah Siang (14:30 - 17:00)" [fixed]
      
      13. Akhiri hari dengan waktu Tidur dan Waktu Bangun yang sudah diatur di pengaturan

      PENTING: Berikan respons HANYA dalam format JSON berikut:
      {
        "schedule": [
          {
            "day": "string (Senin/Selasa/Rabu/Kamis/Jumat/Sabtu/Minggu)",
            "daily": [
              {
                "task": "string (deskripsi aktivitas)",
                "time": "HH:mm - HH:mm (format 24 jam)",
                "type": "fixed|basic|free",
                "suggestions": "string (wajib diisi untuk type free, berikan 2-3 opsi yang relevan)"
              }
            ]
          }
        ]
      }

      Pastikan tidak ada jadwal yang tumpang tindih dan setiap aktivitas panjang dibagi menjadi beberapa sesi dengan istirahat yang jelas.
    `;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah JSON generator yang HANYA menghasilkan output JSON tanpa teks tambahan. Setiap respons HARUS dimulai dengan { dan diakhiri dengan } tanpa karakter tambahan apapun.",
        },
        {
          role: "user",
          content: promptWithContext,
        },
      ],
      model: model,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const rawResponse = completion.choices[0].message.content;
    const generatedSchedule = cleanJSONResponse(rawResponse);

    // 4. Simpan ke generated_schedules
    await client.query(
      `INSERT INTO generated_schedules (user_id, form_input_id, schedule_data)
       VALUES ($1, $2, $3)`,
      [req.user.id, formInputId, generatedSchedule]
    );

    // 5. Hapus jadwal lama jika ada
    await client.query(
      `DELETE FROM task 
       WHERE schedule_id IN (
         SELECT schedule_id FROM jadwal WHERE user_id = $1
       )`,
      [req.user.id]
    );
    await client.query("DELETE FROM jadwal WHERE user_id = $1", [req.user.id]);

    // 6. Simpan jadwal baru
    for (const day of generatedSchedule.schedule) {
      // console.log("Saving day:", day);

      const jadwalResult = await client.query(
        "INSERT INTO jadwal (user_id, hari, form_input_id) VALUES ($1, $2, $3) RETURNING schedule_id",
        [req.user.id, hariMappingReverse[day.day], formInputId]
      );

      const scheduleId = jadwalResult.rows[0].schedule_id;

      // Simpan tasks dengan type dan suggestions
      for (const task of day.daily) {
        const [jamMulai, jamSelesai] = task.time.split(" - ");

        await client.query(
          `INSERT INTO task (
            schedule_id, 
            deskripsi, 
            jam_mulai, 
            jam_selesai, 
            type, 
            suggestions
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            scheduleId,
            task.task,
            jamMulai,
            jamSelesai,
            task.type || "basic",
            task.suggestions || null,
          ]
        );
      }
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      schedule: generatedSchedule.schedule,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in generateSchedule:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Tambahkan fungsi helper untuk format settings
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

// Get last form input
const getLastFormInput = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM form_input 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No previous form input found",
      });
    }

    res.status(200).json({
      success: true,
      formInput: result.rows[0],
    });
  } catch (error) {
    console.error("Error in getLastFormInput:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const getUpcomingSchedule = async (req, res) => {
  try {
    const currentTime = new Date();
    const currentDay = currentTime.toLocaleString("en-US", { weekday: "long" });
    const currentTimeStr = currentTime.toTimeString().slice(0, 5);

    console.log("Debug Info:");
    console.log("User ID:", req.user.id);
    console.log("Current Day:", currentDay);
    console.log("Current Time:", currentTimeStr);

    const result = await pool.query(
      `SELECT 
        j.hari,
        t.deskripsi as title,
        t.jam_mulai,
        t.jam_selesai,
        t.type,
        t.suggestions as description
      FROM jadwal j
      INNER JOIN task t ON j.schedule_id = t.schedule_id
      WHERE j.user_id = $1
      AND j.hari = $2  -- Hanya ambil jadwal hari ini
      AND t.jam_mulai > $3  -- Waktu harus lebih besar dari waktu sekarang
      AND (
        -- Ambil jadwal fixed (kuliah, meeting, dll)
        t.type = 'fixed'
        OR
        -- Ambil jadwal free yang penting (belajar, tugas)
        (t.type = 'free' AND (
          t.deskripsi ILIKE '%belajar%' OR
          t.deskripsi ILIKE '%tugas%' OR
          t.deskripsi ILIKE '%kerja%' OR
          t.deskripsi ILIKE '%meeting%' OR
          t.deskripsi ILIKE '%rapat%' OR
          t.deskripsi ILIKE '%deadline%' OR
          t.deskripsi ILIKE '%project%' OR
          t.deskripsi ILIKE '%presentasi%' OR
          t.deskripsi ILIKE '%ujian%' OR
          t.deskripsi ILIKE '%kuis%'
        ))
      )
      ORDER BY 
        CASE j.hari 
          WHEN 'Monday' THEN 1
          WHEN 'Tuesday' THEN 2
          WHEN 'Wednesday' THEN 3
          WHEN 'Thursday' THEN 4
          WHEN 'Friday' THEN 5
          WHEN 'Saturday' THEN 6
          WHEN 'Sunday' THEN 7
        END,
        t.jam_mulai
      LIMIT 1`,
      [req.user.id, currentDay, currentTimeStr]
    );

    // Mapping hari untuk response
    const hariMapping = {
      Monday: "Senin",
      Tuesday: "Selasa",
      Wednesday: "Rabu",
      Thursday: "Kamis",
      Friday: "Jumat",
      Saturday: "Sabtu",
      Sunday: "Minggu",
    };

    if (result.rows.length > 0) {
      const nextSchedule = result.rows[0];
      res.json({
        success: true,
        schedule: {
          title: nextSchedule.title,
          time: `${nextSchedule.jam_mulai.slice(
            0,
            5
          )} - ${nextSchedule.jam_selesai.slice(0, 5)}`,
          description: nextSchedule.description,
          type: nextSchedule.type,
          day: hariMapping[nextSchedule.hari],
        },
      });
    } else {
      res.json({
        success: true,
        schedule: null,
      });
    }
  } catch (error) {
    console.error("Error in getUpcomingSchedule:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  generateSchedule,
  getJadwalMingguan,
  getLastFormInput,
  getUpcomingSchedule,
};
