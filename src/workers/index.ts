import "../config/env";
import { logger } from "../utils/logger";

// Import all background BullMQ workers in a single Node process to save ~300MB RAM
import "./transcribe.worker";
import "./keyword-extraction.worker";
import "./broll.worker";
import "./crop.worker";
import "./render.worker";

logger.info("All BullMQ background workers initialized in unified runner");
