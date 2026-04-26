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
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
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
