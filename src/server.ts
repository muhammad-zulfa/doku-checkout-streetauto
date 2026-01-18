import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import {
  createDokuCheckoutPayment,
  createDokuPaymentFromPayload,
  checkDokuPaymentStatus,
} from "./doku/client";
import { buildDokuSignature } from "./doku/signature";

dotenv.config();

const app = express();
app.use(cors());

// Normal JSON parsing for most routes
app.use(express.json({ limit: "1mb" }));

const envSchema = z.object({
  PORT: z.string().default("3000"),
  DOKU_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  DOKU_CLIENT_ID: z.string().min(1),
  DOKU_SECRET_KEY: z.string().min(1),
  PUBLIC_BASE_URL: z.string().optional(),
  API_SECRET_KEY: z.string().min(1),
});

const ENV = envSchema.parse(process.env);

// API Key Authentication Middleware
const authenticateApiKey = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  const apiKey =
    req.header("X-API-Key") ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!apiKey) {
    return res.status(401).json({
      message: "UNAUTHORIZED",
      detail:
        "API key is required. Include X-API-Key header or Authorization Bearer token.",
    });
  }

  if (apiKey !== ENV.API_SECRET_KEY) {
    return res.status(401).json({
      message: "UNAUTHORIZED",
      detail: "Invalid API key provided.",
    });
  }

  next();
};

// 1) Create payment -> returns payment.url
app.post("/payments/doku/create", authenticateApiKey, async (req, res) => {
  const bodySchema = z.object({
    amount: z.number().int().positive(),
    invoiceNumber: z.string().min(1).max(64),
  });

  const input = bodySchema.parse(req.body);

  try {
    const callbackBase = ENV.PUBLIC_BASE_URL;
    const result = await createDokuCheckoutPayment({
      env: ENV.DOKU_ENV,
      clientId: ENV.DOKU_CLIENT_ID,
      secretKey: ENV.DOKU_SECRET_KEY,
      amount: input.amount,
      invoiceNumber: input.invoiceNumber,
      callbackUrl: callbackBase ? `${callbackBase}/payment/return` : undefined,
      callbackUrlResult: callbackBase
        ? `${callbackBase}/payment/result`
        : undefined,
    });

    // Many responses include `payment.url` (your frontend redirects there) :contentReference[oaicite:15]{index=15}
    res.json(result);
  } catch (e: any) {
    console.error("Create payment failed:", {
      message: e.message,
      status: e.status,
      data: e.data,
    });
    res
      .status(e.status || 500)
      .json({ message: "CREATE_PAYMENT_FAILED", detail: e.data || e.message });
  }
});

// 1b) Create payment with comprehensive payload -> returns payment.url
app.post(
  "/payments/doku/create-comprehensive",
  authenticateApiKey,
  async (req, res) => {
    const lineItemSchema = z.object({
      type: z.string(),
      image_url: z.string(),
      url: z.string(),
      sku: z.string(),
      category: z.string(),
      name: z.string(),
      price: z.number(),
      quantity: z.number(),
    });

    const customerSchema = z.object({
      id: z.string().optional(),
      address: z.string().optional(),
      country: z.string().optional(),
      state: z.string().optional(),
      city: z.string().optional(),
      postcode: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().email().optional(),
      name: z.string().optional(),
      phone: z.string().optional(),
    });

    const addressSchema = z.object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      postal_code: z.string().optional(),
      phone: z.string().optional(),
      country_code: z.string().optional(),
    });

    const bodySchema = z.object({
      customer: customerSchema,
      order: z.object({
        amount: z.number().int().positive(),
        callback_url: z.string().optional(),
        currency: z.string().default("IDR"),
        invoice_number: z.string().min(1).max(64),
        line_items: z.array(lineItemSchema),
        session_id: z.string().optional(),
      }),
      payment: z.object({
        payment_due_date: z.number().optional(),
      }),
      shipping_address: addressSchema,
      billing_address: addressSchema,
      amount: z.number().int().positive(),
      invoiceNumber: z.string().min(1).max(64),
    });

    try {
      const payload = bodySchema.parse(req.body);
      const result = await createDokuPaymentFromPayload(
        ENV.DOKU_ENV,
        ENV.DOKU_CLIENT_ID,
        ENV.DOKU_SECRET_KEY,
        payload,
      );
      console.log(result);
      res.json(result);
    } catch (e: any) {
      console.error("Create comprehensive payment failed:", {
        message: e.message,
        status: e.status,
        data: e.data,
      });
      res.status(e.status || 500).json({
        message: "CREATE_PAYMENT_FAILED",
        detail: e.data || e.message,
      });
    }
  },
);

// 3) Check payment status
app.get(
  "/payments/doku/status/:invoiceNumber",
  authenticateApiKey,
  async (req, res) => {
    const { invoiceNumber } = req.params;

    if (!invoiceNumber) {
      return res.status(400).json({ message: "Invoice number is required" });
    }

    try {
      const result = await checkDokuPaymentStatus({
        env: ENV.DOKU_ENV,
        clientId: ENV.DOKU_CLIENT_ID,
        secretKey: ENV.DOKU_SECRET_KEY,
        invoiceNumber: invoiceNumber as string,
      });

      res.json(result);
    } catch (e: any) {
      console.error("Check payment status failed:", {
        message: e.message,
        status: e.status,
        data: e.data,
        invoiceNumber,
      });
      res
        .status(e.status || 500)
        .json({ message: "CHECK_STATUS_FAILED", detail: e.data || e.message });
    }
  },
);

// 2) Webhook: DOKU -> your server
// IMPORTANT: we need RAW body bytes for digest/signature verification.
// So override parser for this route:
app.post(
  "/payments/doku/notify",
  express.raw({ type: "*/*", limit: "1mb" }),
  (req, res) => {
    const clientId = req.header("Client-Id") || "";
    const requestId = req.header("Request-Id") || "";
    const requestTimestamp = req.header("Request-Timestamp") || "";
    const signature = req.header("Signature") || "";

    const requestTarget = "/payments/doku/notify"; // path of your notification endpoint :contentReference[oaicite:16]{index=16}
    const rawBody = req.body as Buffer;
    const bodyJson = rawBody.toString("utf8");

    // Recompute expected signature using the same algorithm/components :contentReference[oaicite:17]{index=17}
    const expected = buildDokuSignature({
      clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      bodyJson,
      secretKey: ENV.DOKU_SECRET_KEY,
    });

    if (signature !== expected) {
      console.warn("Invalid DOKU signature", { signature, expected });
      return res.status(401).json({ message: "INVALID_SIGNATURE" });
    }

    // At this point the notification is authentic (best practice) :contentReference[oaicite:18]{index=18}
    let payload: any = {};
    try {
      payload = JSON.parse(bodyJson);
    } catch {}

    console.log("DOKU notification payload:", payload);

    // TODO: update your order status in DB here (idempotently!)
    return res.status(200).json({ message: "OK" });
  },
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(Number(ENV.PORT), () => {
  console.log(`Server running on http://localhost:${ENV.PORT}`);
});
