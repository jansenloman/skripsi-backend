const formatDate = (dateString) => {
  const options = { day: "numeric", month: "long", year: "numeric" };
  return new Date(dateString).toLocaleDateString("id-ID", options);
};

const formatTime = (timeString) => {
  return timeString?.slice(0, 5) || "";
};

module.exports = {
  formatDate,
  formatTime,
};
