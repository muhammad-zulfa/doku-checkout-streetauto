import crypto from "crypto";

export function sha256Base64(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("base64");
}

export function hmacSha256Base64(secret: string, input: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64");
}

/**
 * DOKU Non-SNAP signature (request header):
 * Client-Id:{val}\nRequest-Id:{val}\nRequest-Timestamp:{val}\nRequest-Target:{path}\nDigest:{base64sha256(body)}
 * then HMAC-SHA256 (Secret Key), prepend "HMACSHA256="
 * :contentReference[oaicite:5]{index=5}
 */
export function buildDokuSignature(params: {
  clientId: string;
  requestId: string;
  requestTimestamp: string; // ISO8601 UTC "Z"
  requestTarget: string; // path only, e.g. "/checkout/v1/payment" :contentReference[oaicite:6]{index=6}
  bodyJson?: string; // required for POST to generate Digest :contentReference[oaicite:7]{index=7}
  secretKey: string;
}) {
  const {
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    bodyJson,
    secretKey,
  } = params;

  const lines: string[] = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${requestTimestamp}`,
    `Request-Target:${requestTarget}`,
  ];

  if (bodyJson !== undefined) {
    const digest = sha256Base64(bodyJson);
    lines.push(`Digest:${digest}`);
  }

  const componentSignature = lines.join("\n"); // no trailing \n :contentReference[oaicite:8]{index=8}
  const signed = hmacSha256Base64(secretKey, componentSignature);
  return `HMACSHA256=${signed}`; // :contentReference[oaicite:9]{index=9}
}
