const formatDate = (dateString) => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.error("Invalid date:", dateString);
      return dateString;
    }
    const options = { day: "numeric", month: "long", year: "numeric" };
    return date.toLocaleDateString("id-ID", options);
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateString;
  }
};

const formatTime = (timeString) => {
  try {
    if (!timeString) return "";
    // Pastikan format waktu valid
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    if (!timeRegex.test(timeString)) {
      console.error("Invalid time format:", timeString);
      return timeString;
    }
    return timeString.slice(0, 5);
  } catch (error) {
    console.error("Error formatting time:", error);
    return timeString || "";
  }
};

module.exports = {
  formatDate,
  formatTime,
};
