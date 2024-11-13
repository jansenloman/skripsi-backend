const pool = require("../config/database");

const getProfileData = async (userId) => {
  const [rows] = await pool.query("SELECT * FROM profile WHERE user_id = ?", [
    userId,
  ]);
  return rows[0];
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

    await pool.query(
      `INSERT INTO profile (user_id, name, hobby, daily_task, other_details) 
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
       name = VALUES(name),
       hobby = VALUES(hobby),
       daily_task = VALUES(daily_task),
       other_details = VALUES(other_details)`,
      [req.user.id, name, hobby, daily_task, other_details]
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
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
