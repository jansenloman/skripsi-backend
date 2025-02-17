const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { testEmailConnection } = require("./utils/email");
require("dotenv").config();

const app = express();

const accountRoutes = require("./routes/accountRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");
const profileRoutes = require("./routes/profileRoutes");

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow specific origins and any subdomain of trycloudflare.com
      const allowedOrigins = [
        "http://localhost:5173", // for development
        "https://skripsi-frontend-production.up.railway.app", // production frontend domain
        /^https:\/\/.*\.trycloudflare\.com$/, // Allow any subdomain of trycloudflare.com
      ];

      if (
        allowedOrigins.some((regexOrUrl) =>
          typeof regexOrUrl === "string"
            ? origin === regexOrUrl
            : regexOrUrl.test(origin)
        )
      ) {
        callback(null, true); // Allow the request
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(bodyParser.json());

// Test email connection on startup
testEmailConnection().then((success) => {
  if (!success) {
    console.error("WARNING: Email service is not configured correctly!");
  } else {
    console.log("Email service is ready");
  }
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`${new Date().toISOString()} - Error:`, err);
  res.status(err.status || 500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Something went wrong!"
        : err.message,
  });
});

app.use("/api/accounts", accountRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/profile", profileRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
