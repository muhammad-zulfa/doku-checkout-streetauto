import { buildDokuSignature } from "./signature";
import { randomUUID } from "crypto";

type DokuEnv = "sandbox" | "production";

interface LineItem {
  type: string;
  image_url: string;
  url: string;
  sku: string;
  category: string;
  name: string;
  price: number;
  quantity: number;
}

interface Customer {
  id?: string;
  address?: string;
  country?: string;
  state?: string;
  city?: string;
  postcode?: string;
  last_name?: string;
  email?: string;
  name?: string;
  phone?: string;
}

interface Address {
  first_name?: string;
  last_name?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  country_code?: string;
}

interface PaymentDetails {
  payment_due_date?: number;
  payment_method_types?: string[];
}

interface OrderDetails {
  amount: number;
  callback_url?: string;
  currency?: string;
  invoice_number: string;
  line_items?: LineItem[];
  session_id?: string;
  auto_redirect?: boolean;
}

export function getDokuBaseUrl(env: DokuEnv) {
  return env === "production"
    ? "https://api.doku.com"
    : "https://api-sandbox.doku.com";
}

export async function createDokuCheckoutPayment(input: {
  env: DokuEnv;
  clientId: string;
  secretKey: string;

  // Basic required fields
  amount: number;
  invoiceNumber: string;

  // Optional comprehensive payment data
  customer?: Customer;
  order?: Partial<OrderDetails>;
  payment?: PaymentDetails;
  shipping_address?: Address;
  billing_address?: Address;
  line_items?: LineItem[];
  session_id?: string;

  // recommended so DOKU can call back / notify
  callbackUrl?: string;
  callbackUrlResult?: string;
}) {
  const requestTarget = "/checkout/v1/payment"; // :contentReference[oaicite:10]{index=10}
  const url = `${getDokuBaseUrl(input.env)}${requestTarget}`;

  const requestId = randomUUID();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); // ISO8601 UTC :contentReference[oaicite:11]{index=11}

  // Construct order object with required and optional fields
  const order: any = {
    amount: input.amount,
    invoice_number: input.invoiceNumber,
    currency: input.order?.currency || "IDR",
    auto_redirect: input.order?.auto_redirect ?? true,
  };

  // Add optional order fields
  if (input.order?.line_items || input.line_items) {
    order.line_items = input.order?.line_items || input.line_items;
  }
  if (input.order?.session_id || input.session_id) {
    order.session_id = input.order?.session_id || input.session_id;
  }
  if (input.callbackUrl) order.callback_url = input.callbackUrl;
  if (input.callbackUrlResult)
    order.callback_url_result = input.callbackUrlResult;

  // Construct the complete body
  const body: any = {
    order,
    payment: {
      payment_due_date: input.payment?.payment_due_date,
      payment_method_types: input.payment?.payment_method_types,
    },
    customer: input.customer || {},
    additional_info: {
      // Add any additional metadata here
    },
  };

  console.log("DOKU Payment Request Body:", body);

  // Add shipping and billing addresses if provided
  if (input.shipping_address) {
    body.shipping_address = input.shipping_address;
  }
  if (input.billing_address) {
    body.billing_address = input.billing_address;
  }

  // Clean up undefined values from payment object
  Object.keys(body.payment).forEach((key) => {
    if (body.payment[key] === undefined) {
      delete body.payment[key];
    }
  });

  const bodyJson = JSON.stringify(body);

  const signature = buildDokuSignature({
    clientId: input.clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    bodyJson,
    secretKey: input.secretKey,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": input.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": requestTimestamp,
      Signature: signature,
    },
    body: bodyJson,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`DOKU error ${res.status}`);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }

  return data; // should include payment.url per integration guide :contentReference[oaicite:14]{index=14}
}

/**
 * Helper function to create a DOKU payment using a comprehensive payload structure
 * This matches the format from your example payload
 */
export async function createDokuPaymentFromPayload(
  env: DokuEnv,
  clientId: string,
  secretKey: string,
  payload: {
    customer: Customer;
    order: {
      amount: number;
      callback_url?: string;
      currency?: string;
      invoice_number: string;
      line_items: LineItem[];
      session_id?: string;
    };
    payment: {
      payment_due_date?: number;
    };
    shipping_address: Address;
    billing_address: Address;
    amount: number;
    invoiceNumber: string;
  },
) {
  return createDokuCheckoutPayment({
    env,
    clientId,
    secretKey,
    amount: payload.amount,
    invoiceNumber: payload.invoiceNumber,
    customer: payload.customer,
    order: {
      amount: payload.order.amount,
      invoice_number: payload.order.invoice_number,
      currency: payload.order.currency,
      line_items: payload.order.line_items,
      session_id: payload.order.session_id,
    },
    payment: {
      payment_due_date: payload.payment.payment_due_date,
    },
    shipping_address: payload.shipping_address,
    billing_address: payload.billing_address,
    callbackUrl: payload.order.callback_url,
  });
}

/**
 * Check the status of a DOKU payment
 * @param input Configuration and invoice number to check
 * @returns Payment status information from DOKU
 */
export async function checkDokuPaymentStatus(input: {
  env: DokuEnv;
  clientId: string;
  secretKey: string;
  invoiceNumber: string;
}) {
  const requestTarget = `/orders/v1/status/${input.invoiceNumber}`;
  const url = `${getDokuBaseUrl(input.env)}${requestTarget}`;

  const requestId = randomUUID();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // For GET requests, we don't include bodyJson/Digest in signature
  const signature = buildDokuSignature({
    clientId: input.clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    // Don't pass bodyJson for GET requests
    secretKey: input.secretKey,
  });

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": input.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": requestTimestamp,
      Signature: signature,
    },
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`DOKU error ${res.status}`);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }

  return data;
}
