import dotenv from "dotenv";
dotenv.config();

import app from "./app";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 AI Tube API server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}/api/v1/health`);
});
