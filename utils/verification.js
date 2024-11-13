const crypto = require("crypto");

const generateVerificationCode = () => {
  return crypto.randomBytes(32).toString("hex");
};

const generateExpirationTime = () => {
  const expirationTime = new Date();
  expirationTime.setHours(expirationTime.getHours() + 24); // Kode berlaku 24 jam
  return expirationTime;
};

module.exports = {
  generateVerificationCode,
  generateExpirationTime,
};
