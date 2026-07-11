import OpenAI from "openai";
import { env } from "../config/env";

const openaiClient = new OpenAI({
  apiKey: env.OPEN_AI_API_KEY,
});

export default openaiClient;
