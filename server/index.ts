import "dotenv/config";

import cors from "cors";
import express from "express";

import { categories, menuCatalogItems } from "../src/data/menu-catalog";

import { interpretOrderPrompt } from "./lib/ai/interpret-order";
import { interpretRequestSchema } from "./lib/api-schema";
import { getServerRuntimeLabel, serverAiConfig } from "./lib/config";

const app = express();
const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3001", 10);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    runtime: getServerRuntimeLabel(),
    provider: serverAiConfig.provider,
    model: serverAiConfig.ollamaModel,
  });
});

app.get("/menu", (_request, response) => {
  response.json({
    categories,
    items: menuCatalogItems,
  });
});

app.post("/ai/interpret", async (request, response) => {
  const parsedRequest = interpretRequestSchema.safeParse(request.body);

  if (!parsedRequest.success) {
    response.status(400).json({
      error: "Invalid AI request payload.",
      issues: parsedRequest.error.flatten(),
    });
    return;
  }

  try {
    const aiResponse = await interpretOrderPrompt(parsedRequest.data);
    response.json(aiResponse);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : "The Bistro AI request failed.",
    });
  }
});

app.listen(port, host, () => {
  console.log(`[bistro-api] listening on http://${host}:${port}`);
});
