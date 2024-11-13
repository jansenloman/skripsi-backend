const openai = require("../config/openai");
const pool = require("../config/database");
const {
  getProfileData,
  getJadwalKuliahData,
  getJadwalMendatangData,
} = require("./profile");

// Get jadwal mingguan
const getJadwalMingguan = async (req, res) => {
  try {
    const [jadwal] = await pool.query(
      `SELECT j.schedule_id, j.hari, t.task_id, t.deskripsi, t.jam_mulai, t.jam_selesai 
       FROM jadwal j 
       LEFT JOIN task t ON j.schedule_id = t.schedule_id 
       WHERE j.user_id = ? 
       ORDER BY FIELD(j.hari, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'), t.jam_mulai`,
      [req.user.id]
    );

    // Reformat data menjadi struktur yang lebih mudah dibaca
    const formattedSchedule = jadwal.reduce((acc, curr) => {
      if (!acc[curr.hari]) {
        acc[curr.hari] = [];
      }
      if (curr.task_id) {
        acc[curr.hari].push({
          task_id: curr.task_id,
          deskripsi: curr.deskripsi,
          jam_mulai: curr.jam_mulai,
          jam_selesai: curr.jam_selesai,
        });
      }
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      schedule: formattedSchedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete jadwal mingguan setiap hari Minggu
const deleteWeeklySchedule = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Hapus semua jadwal dan task
    await connection.query(
      "DELETE j, t FROM jadwal j LEFT JOIN task t ON j.schedule_id = t.schedule_id"
    );

    await connection.commit();
    console.log("Weekly schedule deleted successfully");
  } catch (error) {
    await connection.rollback();
    console.error("Error deleting weekly schedule:", error);
  } finally {
    connection.release();
  }
};

// Setup cron job untuk menghapus jadwal setiap hari Minggu jam 23:59
const cron = require("node-cron");
cron.schedule("59 23 * * 0", () => {
  deleteWeeklySchedule();
});

// Generate schedule from OpenAI
const generateSchedule = async (req, res) => {
  try {
    // Ambil semua data yang diperlukan
    const profile = await getProfileData(req.user.id);
    const jadwalKuliah = await getJadwalKuliahData(req.user.id);
    const jadwalMendatang = await getJadwalMendatangData(req.user.id);
    const [formInput] = await pool.query(
      "SELECT input, tambahan FROM form_input WHERE user_id = ? ORDER BY form_id DESC LIMIT 1",
      [req.user.id]
    );

    const promptWithContext = `
      Buatkan jadwal mingguan berdasarkan data berikut:

      1. PROFIL PENGGUNA (untuk personalisasi jadwal):
      ${(() => {
        if (!profile) return "Tidak ada data profil";
        return `
        - Nama: ${profile.name || "Tidak ada"}
        - Hobi: ${profile.hobby || "Tidak ada"}
        - Kegiatan Harian: ${profile.daily_task || "Tidak ada"}
        - Detail Lain: ${profile.other_details || "Tidak ada"}`;
      })()}

      2. INPUT JADWAL DARI PENGGUNA:
      ${formInput?.input || "Tidak ada input jadwal"}
      Detail Tambahan: ${formInput?.tambahan || "Tidak ada"}

      3. JADWAL TETAP:
      Jadwal Kuliah:
      ${
        jadwalKuliah.length > 0
          ? jadwalKuliah
              .map(
                (jk) =>
                  `- ${jk.hari}: ${jk.mata_kuliah} (${jk.jam_mulai} - ${jk.jam_selesai})`
              )
              .join("\n")
          : "Tidak ada jadwal kuliah"
      }

      Jadwal Mendatang:
      ${
        jadwalMendatang.length > 0
          ? jadwalMendatang
              .map(
                (jm) =>
                  `- ${formatDate(jm.tanggal)}: ${jm.kegiatan} (${formatTime(
                    jm.jam_mulai
                  )} - ${formatTime(jm.jam_selesai)})`
              )
              .join("\n")
          : "Tidak ada jadwal mendatang"
      }

      ATURAN PEMBUATAN JADWAL:
      1. Jadwal kuliah dan jadwal mendatang adalah jadwal tetap yang tidak bisa diubah, kecuali jika user mengubahnya dari form_input
      2. Sesuaikan jadwal dengan kegiatan harian dan hobi pengguna
      3. Berikan jadwal yang seimbang antara kegiatan akademik, pribadi, dan waktu istirahat
      4. Periksa konflik jadwal sebelum memberikan hasil final

      Harap berikan jadwal dalam format JSON berikut:
      {
        "hasConflict": boolean,
        "conflicts": [
          {
            "day": "string",
            "eventA": { "task": "string", "time": "HH:mm - HH:mm" },
            "eventB": { "task": "string", "time": "HH:mm - HH:mm" },
            "options": [
              {
                "id": number,
                "description": "string",
                "impact": "string"
              }
            ]
          }
        ],
        "schedule": [
          {
            "day": "string",
            "daily": [
              {
                "task": "string",
                "time": "HH:mm - HH:mm"
              }
            ]
          }
        ]
      }
    `;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Anda adalah asisten AI yang ahli dalam membuat jadwal mingguan yang terstruktur, efisien, dan mempertimbangkan keseimbangan waktu. Anda akan menganalisis semua input dan membuat jadwal yang optimal dengan mempertimbangkan jadwal tetap, preferensi pengguna, dan menghindari konflik jadwal.",
        },
        {
          role: "user",
          content: promptWithContext,
        },
      ],
      model: "gpt-4",
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0].message.content);

    // Preview jadwal ke user
    res.status(200).json({
      success: true,
      hasConflict: response.hasConflict,
      conflicts: response.conflicts,
      schedule: response.schedule,
    });
  } catch (error) {
    console.error("Error in generateSchedule:", error);

    // Handle OpenAI API errors
    if (error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      });
    }

    // Handle database errors
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({
        success: false,
        error: "Database table not found",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Regenerate schedule from OpenAI
const regenerateSchedule = async (req, res) => {
  try {
    // Ambil input sebelumnya dari database
    const [previousInput] = await pool.query(
      "SELECT input, tambahan FROM form_input WHERE user_id = ? ORDER BY form_id DESC LIMIT 1",
      [req.user.id]
    );

    // Gunakan input yang baru jika ada, atau gunakan input sebelumnya
    const formInput = req.body.input || previousInput?.input;
    const tambahan = req.body.tambahan || previousInput?.tambahan;

    // Gunakan logika yang sama dengan generateSchedule
    const profile = await getProfileData(req.user.id);
    const jadwalKuliah = await getJadwalKuliahData(req.user.id);
    const jadwalMendatang = await getJadwalMendatangData(req.user.id);

    const promptWithContext = `
      Buatkan jadwal mingguan dengan detail berikut:

      PROFIL PENGGUNA:
      ${(() => {
        if (!profile) return "Tidak ada data profil";

        return `
      - Nama: ${profile.name ? profile.name : "Tidak ada"}
      - Hobi: ${profile.hobby ? profile.hobby : "Tidak ada"}
      - Kegiatan Harian: ${
        profile.daily_task ? profile.daily_task : "Tidak ada"
      }
      - Detail Lain: ${
        profile.other_details ? profile.other_details : "Tidak ada"
      }`;
      })()}

      JADWAL KULIAH:
      ${
        jadwalKuliah.length > 0
          ? jadwalKuliah
              .map(
                (jk) =>
                  `- ${jk.hari}: ${jk.mata_kuliah} (${jk.jam_mulai} - ${jk.jam_selesai})`
              )
              .join("\n")
          : "Tidak ada jadwal kuliah"
      }

      JADWAL MENDATANG:
      ${
        jadwalMendatang.length > 0
          ? jadwalMendatang
              .map(
                (jm) => `- ${jm.tanggal}: ${jm.jam_mulai} - ${jm.jam_selesai}`
              )
              .join("\n")
          : "Tidak ada jadwal mendatang"
      }

      DETAIL TAMBAHAN:
      ${tambahan || "Tidak ada detail tambahan"}

      JADWAL SEBELUMNYA:
      ${JSON.stringify(previousInput, null, 2)}

      PENTING: Sebelum memberikan jadwal final, periksa apakah ada konflik jadwal.
      Jika menemukan konflik jadwal (jadwal yang waktunya bertabrakan), berikan response dalam format berikut:
      {
        "hasConflict": true,
        "conflicts": [
          {
            "day": "Nama Hari",
            "eventA": {
              "task": "Deskripsi Event A",
              "time": "HH:mm - HH:mm"
            },
            "eventB": {
              "task": "Deskripsi Event B",
              "time": "HH:mm - HH:mm"
            },
            "options": [
              {
                "id": 1,
                "description": "Prioritaskan [Event A]",
                "impact": "[Event B] akan dijadwalkan ulang ke waktu berikutnya yang tersedia"
              },
              {
                "id": 2,
                "description": "Prioritaskan [Event B]",
                "impact": "[Event A] akan dijadwalkan ulang ke waktu berikutnya yang tersedia"
              },
              {
                "id": 3,
                "description": "Bagi waktu untuk kedua event",
                "impact": "Kedua event akan dipersingkat durasinya"
              }
            ]
          }
        ]
      }

      Jika tidak ada konflik, berikan jadwal dalam format JSON berikut:
      {
        "hasConflict": false,
        "schedule": [
          {
            "day": "Nama Hari, Tanggal",
            "daily": [
              {
                "task": "Deskripsi Kegiatan",
                "time": "HH:mm" atau "HH:mm - HH:mm"
              }
            ]
          }
        ]
      }

      Aturan pembuatan jadwal:
      1. Waktu bangun pagi: 07:00
      2. Waktu tidur malam: 23:00
      3. Sertakan waktu makan (sarapan, makan siang, makan malam)
      4. Berikan waktu istirahat setelah 2-3 jam aktivitas
      5. Prioritaskan jadwal kuliah yang sudah ada
      6. Sesuaikan dengan hobi dan kegiatan harian dari profil
      7. Masukkan jadwal mendatang yang sudah direncanakan
    `;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Anda adalah asisten yang membantu membuat jadwal mingguan yang terstruktur dan efisien.",
        },
        {
          role: "user",
          content: promptWithContext,
        },
      ],
      model: "gpt-4",
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0].message.content);

    // Cek apakah ada konflik
    if (response.hasConflict) {
      res.status(200).json({
        success: true,
        hasConflict: true,
        conflicts: response.conflicts,
      });
    } else {
      // Validasi schedule format
      if (!response.schedule || !Array.isArray(response.schedule)) {
        throw new Error("Invalid schedule format from OpenAI");
      }

      res.status(200).json({
        success: true,
        hasConflict: false,
        schedule: response.schedule,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Save generated schedule to database
const saveSchedule = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { schedule } = req.body;
    await connection.beginTransaction();

    // Hapus jadwal lama user
    await connection.query(
      "DELETE j, t FROM jadwal j LEFT JOIN task t ON j.schedule_id = t.schedule_id WHERE j.user_id = ?",
      [req.user.id]
    );

    // Validasi schedule
    if (!schedule?.schedule || !Array.isArray(schedule.schedule)) {
      throw new Error("Invalid schedule format");
    }

    for (const daySchedule of schedule.schedule) {
      if (
        !daySchedule.day ||
        !daySchedule.daily ||
        !Array.isArray(daySchedule.daily)
      ) {
        throw new Error("Invalid day schedule format");
      }

      const hari = daySchedule.day.split(",")[0].trim();

      // Validasi hari
      if (
        ![
          "Senin",
          "Selasa",
          "Rabu",
          "Kamis",
          "Jumat",
          "Sabtu",
          "Minggu",
        ].includes(hari)
      ) {
        throw new Error(`Invalid day format: ${hari}`);
      }

      const [jadwalResult] = await connection.query(
        "INSERT INTO jadwal (user_id, hari) VALUES (?, ?)",
        [req.user.id, hari]
      );

      const schedule_id = jadwalResult.insertId;

      for (const task of daySchedule.daily) {
        if (!task.task || !task.time) {
          throw new Error("Invalid task format");
        }

        let [jam_mulai, jam_selesai] = task.time.includes(" - ")
          ? task.time.split(" - ")
          : [task.time, null];

        // Validasi format waktu
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (
          !timeRegex.test(jam_mulai) ||
          (jam_selesai && !timeRegex.test(jam_selesai))
        ) {
          throw new Error(`Invalid time format: ${task.time}`);
        }

        await connection.query(
          "INSERT INTO task (schedule_id, deskripsi, jam_mulai, jam_selesai) VALUES (?, ?, ?, ?)",
          [schedule_id, task.task, jam_mulai, jam_selesai]
        );
      }
    }

    await connection.commit();
    res.status(200).json({
      success: true,
      message: "Schedule saved successfully",
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({
      success: false,
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

const resolveScheduleConflict = async (req, res) => {
  try {
    const { conflictResolutions } = req.body;
    // conflictResolutions format:
    // [{
    //   day: "Nama Hari",
    //   selectedOption: 1|2|3,
    //   eventA: {...},
    //   eventB: {...}
    // }]

    const profile = await getProfileData(req.user.id);
    const jadwalKuliah = await getJadwalKuliahData(req.user.id);
    const jadwalMendatang = await getJadwalMendatangData(req.user.id);

    const promptWithContext = `
      Buatkan ulang jadwal dengan mempertimbangkan resolusi konflik berikut:
      ${JSON.stringify(conflictResolutions, null, 2)}

      Detail resolusi yang dipilih user:
      ${conflictResolutions
        .map(
          (resolution) => `
        Hari: ${resolution.day}
        Event A: ${resolution.eventA.task} (${resolution.eventA.time})
        Event B: ${resolution.eventB.task} (${resolution.eventB.time})
        Pilihan: ${resolution.selectedOption}
      `
        )
        .join("\n")}

      PROFIL PENGGUNA:
      ${(() => {
        if (!profile) return "Tidak ada data profil";

        return `
      - Nama: ${profile.name ? profile.name : "Tidak ada"}
      - Hobi: ${profile.hobby ? profile.hobby : "Tidak ada"}
      - Kegiatan Harian: ${
        profile.daily_task ? profile.daily_task : "Tidak ada"
      }
      - Detail Lain: ${
        profile.other_details ? profile.other_details : "Tidak ada"
      }`;
      })()}

      JADWAL KULIAH:
      ${
        jadwalKuliah.length > 0
          ? jadwalKuliah
              .map(
                (jk) =>
                  `- ${jk.hari}: ${jk.mata_kuliah} (${jk.jam_mulai} - ${jk.jam_selesai})`
              )
              .join("\n")
          : "Tidak ada jadwal kuliah"
      }

      JADWAL MENDATANG:
      ${
        jadwalMendatang.length > 0
          ? jadwalMendatang
              .map(
                (jm) => `- ${jm.tanggal}: ${jm.jam_mulai} - ${jm.jam_selesai}`
              )
              .join("\n")
          : "Tidak ada jadwal mendatang"
      }

      Harap berikan jadwal baru dalam format JSON berikut:
      {
        "schedule": [
          {
            "day": "Nama Hari, Tanggal",
            "daily": [
              {
                "task": "Deskripsi Kegiatan",
                "time": "HH:mm" atau "HH:mm - HH:mm"
              }
            ]
          }
        ]
      }
    `;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "Anda adalah asisten yang membantu membuat jadwal mingguan yang terstruktur dan efisien.",
        },
        {
          role: "user",
          content: promptWithContext,
        },
      ],
      model: "gpt-4",
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const schedule = JSON.parse(completion.choices[0].message.content);

    res.status(200).json({
      success: true,
      schedule: schedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  generateSchedule,
  regenerateSchedule,
  saveSchedule,
  getJadwalMingguan,
  resolveScheduleConflict,
};
