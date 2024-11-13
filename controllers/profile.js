const pool = require("../config/database");

const getProfileData = async (userId) => {
  const result = await pool.query("SELECT * FROM profile WHERE user_id = $1", [
    userId,
  ]);
  return result.rows[0];
};

const getProfile = async (req, res) => {
  try {
    const profile = await getProfileData(req.user.id);
    res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, hobby, daily_task, other_details } = req.body;

    const result = await pool.query(
      `INSERT INTO profile (user_id, name, hobby, daily_task, other_details) 
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET 
       name = EXCLUDED.name,
       hobby = EXCLUDED.hobby,
       daily_task = EXCLUDED.daily_task,
       other_details = EXCLUDED.other_details
       RETURNING *`,
      [req.user.id, name, hobby, daily_task, other_details]
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  getProfileData,

  getProfile,
  updateProfile,
};
