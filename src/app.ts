import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import healthRouter from "./routes/health";
import videosRouter from "./routes/videos";
import categoriesRouter from "./routes/categories";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

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
    methods: ["GET"],
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

// Error handling
app.use(errorHandler);

export default app;
