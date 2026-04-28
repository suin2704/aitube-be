import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import healthRouter from "./routes/health";
import videosRouter from "./routes/videos";
import categoriesRouter from "./routes/categories";
import searchRouter from "./routes/search";
import crawlRouter from "./routes/crawl";
import analyticsRouter from "./routes/analytics";
import commentsRouter from "./routes/comments";
import adminAuthRouter from "./routes/admin/auth";
import adminDashboardRouter from "./routes/admin/dashboard";
import adminVideosRouter from "./routes/admin/videos";
import adminChannelsRouter from "./routes/admin/channels";
import adminAnalyticsRouter from "./routes/admin/analytics";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Trust proxy (Railway runs behind a reverse proxy)
app.set("trust proxy", 1);

// Security
app.use(helmet());

const allowedOrigins = [
  "https://aitube-fe.vercel.app",
  "http://localhost:3000",
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN.replace(/\/$/, ""));
}

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "x-cron-secret"],
  })
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Body parsing
app.use(express.json());

// Routes
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/videos", videosRouter);
app.use("/api/v1/categories", categoriesRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/crawl", crawlRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/videos", commentsRouter);

// Admin routes
app.use("/api/v1/admin", adminAuthRouter);
app.use("/api/v1/admin/dashboard", adminDashboardRouter);
app.use("/api/v1/admin/videos", adminVideosRouter);
app.use("/api/v1/admin/channels", adminChannelsRouter);
app.use("/api/v1/admin/analytics", adminAnalyticsRouter);

// Error handling
app.use(errorHandler);

export default app;
