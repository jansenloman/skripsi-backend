const pool = require("../config/database");

const getScheduleSettings = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM user_schedule_settings WHERE user_id = $1",
      [req.user.id]
    );

    // Jika belum ada settings, buat default
    if (result.rows.length === 0) {
      await pool.query(
        "INSERT INTO user_schedule_settings (user_id) VALUES ($1)",
        [req.user.id]
      );

      // Ambil default settings yang baru dibuat
      const newResult = await pool.query(
        "SELECT * FROM user_schedule_settings WHERE user_id = $1",
        [req.user.id]
      );

      res.status(200).json({
        success: true,
        settings: newResult.rows[0],
      });
    } else {
      res.status(200).json({
        success: true,
        settings: result.rows[0],
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const updateScheduleSettings = async (req, res) => {
  try {
    // console.log("User ID:", req.user.id);
    // console.log("Request body:", req.body);

    const {
      wake_time,
      sleep_time,
      breakfast_time,
      breakfast_duration,
      lunch_time,
      lunch_duration,
      dinner_time,
      dinner_duration,
      rest_time,
      rest_duration,
      productive_time_start,
      productive_time_end,
    } = req.body;

    // Validasi: jika duration diisi, time harus diisi juga
    const validateTimeAndDuration = (time, duration, name) => {
      if (duration && !time) {
        throw new Error(`${name} time harus diisi jika duration diisi`);
      }
    };

    // Jika semua nilai null (reset), skip validasi
    const allNull = [
      wake_time, sleep_time, breakfast_time, breakfast_duration,
      lunch_time, lunch_duration, dinner_time, dinner_duration,
      rest_time, rest_duration, productive_time_start, productive_time_end
    ].every(value => value === null || value === undefined || value === "" || value === 0);

    if (!allNull) {
      validateTimeAndDuration(breakfast_time, breakfast_duration, "Breakfast");
      validateTimeAndDuration(lunch_time, lunch_duration, "Lunch");
      validateTimeAndDuration(dinner_time, dinner_duration, "Dinner");
      validateTimeAndDuration(rest_time, rest_duration, "Rest");
      
      // Validasi waktu produktif hanya jika tidak reset
      if (
        (productive_time_start && !productive_time_end) ||
        (!productive_time_start && productive_time_end)
      ) {
        throw new Error(
          "Waktu produktif harus diisi keduanya atau tidak sama sekali"
        );
      }
    }

    const result = await pool.query(
      `UPDATE user_schedule_settings 
       SET wake_time = $2, sleep_time = $3,
           breakfast_time = $4, breakfast_duration = $5,
           lunch_time = $6, lunch_duration = $7,
           dinner_time = $8, dinner_duration = $9,
           rest_time = $10, rest_duration = $11,
           productive_time_start = $12, productive_time_end = $13,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING *`,
      [
        req.user.id,
        wake_time || null,
        sleep_time || null,
        breakfast_time || null,
        breakfast_duration || null,
        lunch_time || null,
        lunch_duration || null,
        dinner_time || null,
        dinner_duration || null,
        rest_time || null,
        rest_duration || null,
        productive_time_start || null,
        productive_time_end || null,
      ]
    );

    if (result.rows.length === 0) {
      const insertResult = await pool.query(
        `INSERT INTO user_schedule_settings (
          user_id, wake_time, sleep_time, 
          breakfast_time, breakfast_duration,
          lunch_time, lunch_duration,
          dinner_time, dinner_duration,
          rest_time, rest_duration,
          productive_time_start, productive_time_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          req.user.id,
          wake_time || null,
          sleep_time || null,
          breakfast_time || null,
          breakfast_duration || null,
          lunch_time || null,
          lunch_duration || null,
          dinner_time || null,
          dinner_duration || null,
          rest_time || null,
          rest_duration || null,
          productive_time_start || null,
          productive_time_end || null,
        ]
      );

      return res.status(200).json({
        success: true,
        settings: insertResult.rows[0],
      });
    }

    res.status(200).json({
      success: true,
      settings: result.rows[0],
    });
  } catch (error) {
    console.error("Error in updateScheduleSettings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getScheduleSettings,
  updateScheduleSettings,
};
