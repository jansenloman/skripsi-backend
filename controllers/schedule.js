const openai = require("../config/openai");
const pool = require("../config/database");
const { getProfileData } = require("./profile");
const {
  hariMappingReverse,
  hariMapping,
  hariDefault,
} = require("../utils/constant");

const {
  getJadwalKuliahData,
  getJadwalMendatangData,
} = require("../utils/scheduleHelper");

const {
  formatSettings,
  formatProfileData,
  formatJadwalKuliah,
  formatJadwalMendatang,
} = require("../utils/scheduleHelper");

const model = "gpt-4o";

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
      4. Jika ada tugas yang di mention user, tambahkan sebagai saran di setiap waktu luang sampai hari deadline
      5. Berikan jeda waktu istirahat ${
        settings.rows[0]?.waktu_istirahat || 15
      } menit antar aktivitas
      6. Berikan kisaran waktu perjalanan antar tempat yang realistis
      7. Hindari konflik dengan jadwal kuliah dan jadwal mendatang
      8. Prioritaskan preferensi tambahan dari pengaturan
      9. PENTING: Jangan membuat jadwal yang tumpang tindih!

      ATURAN KESEJAHTERAAN PENGGUNA:
        10. Perhatikan pola aktivitas dan beban mental:
         - Setelah 2-3 jam aktivitas berat (kuliah/belajar), WAJIB ada istirahat minimal 15-30 menit
         - Setelah aktivitas menguras mental, berikan saran aktivitas refreshing
         - Jangan letakkan terlalu banyak aktivitas berat berturut-turut
         - Sisipkan waktu untuk sosialisasi dan relaksasi

      11. Waktu Luang dan Saran Aktivitas:
          - Untuk waktu luang pendek (< 1 jam): fokus pada aktivitas refreshing atau persiapan
          - Untuk waktu luang medium (1-2 jam): bisa untuk aktivitas produktif ringan atau hobi
          - Untuk waktu luang panjang (> 2 jam): bisa dibagi untuk produktif dan hobi
          - PENTING: Saran harus mempertimbangkan:
            * Tingkat kelelahan dari aktivitas sebelumnya
            * Persiapan untuk aktivitas selanjutnya
            * Kebutuhan sosialisasi
            * Hobi dan preferensi pengguna

      12. Fleksibilitas dan Keseimbangan:
          - Berikan minimal 2-3 opsi saran untuk setiap waktu luang
          - Sertakan kombinasi aktivitas produktif dan refreshing
          - Untuk waktu malam, prioritaskan aktivitas yang menenangkan
          - Jika ada jadwal padat di siang hari, berikan waktu istirahat yang cukup di malam hari

      13. Format Waktu dan Transisi:
      PENTING: untuk setiap aktivitas
          - Contoh format jadwal:
            * "Kuliah Pagi (09:00 - 12:00)" [fixed]
            * "Istirahat & Makan Siang (12:00 - 13:00)" [basic]
            * "Waktu Luang (13:00 - 14:00)" [free] - Saran: 1) Review materi kuliah, 2) Istirahat sejenak, 3) Persiapan kuliah siang
            * "Perjalanan ke Kampus (14:00 - 14:30)" [basic]
            * "Kuliah Siang (14:30 - 17:00)" [fixed]
      
      14. Akhiri hari dengan waktu Tidur dan Waktu Bangun yang sudah diatur di pengaturan

      PENTING: Berikan respons HANYA dalam format JSON berikut:
      {
        "schedule": [
          {
            "day": "string (Senin/Selasa/Rabu/Kamis/Jumat/Sabtu/Minggu)",
            "daily": [
              {
                "task": "string (deskripsi aktivitas)",
                "time": "HH:mm - HH:mm (format 24 jam)",
                "type": "fixed|basic|free|background",
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
            "Kamu adalah JSON generator yang HANYA menghasilkan output JSON tanpa teks tambahan. " +
            "Setiap respons HARUS dimulai dengan { dan diakhiri dengan }. " +
            "Untuk setiap task, tentukan type sebagai: " +
            "- 'fixed' untuk kegiatan yang tidak bisa diubah (kuliah, meeting) " +
            "- 'basic' untuk kegiatan rutin (makan, tidur) " +
            "- 'free' untuk kegiatan fleksibel (belajar, tugas) " +
            "- 'background' untuk kegiatan latar belakang yang tidak terlalu signifikan",
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
    const result = await pool.query(
      `WITH current_time_jakarta AS (
        SELECT 
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::TIME as time,
          to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE, 'Day') as day,
          EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::TIME) * 60 + 
          EXTRACT(MINUTE FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::TIME) as current_minutes
      ),
      filtered_tasks AS (
        SELECT 
          j.hari,
          t.deskripsi as title,
          t.jam_mulai,
          t.jam_selesai,
          t.type,
          t.suggestions as description,
          (EXTRACT(HOUR FROM t.jam_mulai) * 60 + EXTRACT(MINUTE FROM t.jam_mulai)) as start_minutes
        FROM jadwal j
        INNER JOIN task t ON j.schedule_id = t.schedule_id
        CROSS JOIN current_time_jakarta ct
        WHERE j.user_id = $1
        AND j.hari = INITCAP(ct.day)
        AND t.type != 'background'
        AND t.type != 'free'
        AND (
          t.type = 'fixed' 
          OR t.type = 'basic'
        )
      )
      SELECT 
        ft.*,
        ct.time as current_time,
        ct.day as current_day
      FROM filtered_tasks ft
      CROSS JOIN current_time_jakarta ct
      WHERE ft.start_minutes > ct.current_minutes
      ORDER BY ft.start_minutes
      LIMIT 2`, // Ubah limit menjadi 2
      [req.user.id]
    );

    console.log("Debug Info:");
    console.log("User ID:", req.user.id);
    console.log("Query result:", result.rows);

    if (result.rows.length > 0) {
      // Map semua jadwal yang ditemukan
      const schedules = result.rows.map((schedule) => ({
        title: schedule.title,
        time: `${formatTime(schedule.jam_mulai)} - ${formatTime(
          schedule.jam_selesai
        )}`,
        description: schedule.description,
        type: schedule.type,
        day: HARI_MAPPING[schedule.hari],
      }));

      res.json({
        success: true,
        schedules: schedules, // Kirim array jadwal
      });
    } else {
      res.json({
        success: true,
        schedules: [], // Kirim array kosong jika tidak ada jadwal
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
