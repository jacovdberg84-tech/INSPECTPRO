import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import assetsRoutes from "./routes/assets.routes.js";
import inspectionsRoutes from "./routes/inspections.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import breakdownRoutes from "./routes/breakdowns.routes.js";
import artisanRoutes from "./routes/artisan.routes.js";
import maintenanceRoutes from "./routes/maintenance.routes.js";
import supervisorRoutes from "./routes/supervisor.routes.js";

dotenv.config();

const app = express();

// CORS - restrict in production
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3002'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use("/api/assets", assetsRoutes);
app.use("/api/inspections", inspectionsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/breakdowns", breakdownRoutes);
app.use("/api/artisan", artisanRoutes);
app.use("/api/artisan/maintenance", maintenanceRoutes);
app.use("/api/supervisor", supervisorRoutes);

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

// Silence favicon noise
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Serve web frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webPath = path.join(__dirname, "../web");
app.use(express.static(webPath));

const PORT = process.env.PORT || 3002;

const server = app.listen(PORT, () => {
  console.log(`InspectPro running on port ${PORT}`);
  console.log(`Serving web from: ${webPath}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
  console.error('Server error:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});