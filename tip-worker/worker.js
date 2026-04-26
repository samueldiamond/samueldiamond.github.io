// Tip endpoint for samdiamond.xyz/blog
//
// Returns HTTP 402 with an MPP (Machine Payments Protocol) challenge so any
// MPP-capable client (Alby, future browser wallets, AI agents) can pay a few
// cents to acknowledge a post. Successful payment writes a row to KV.
//
// MPP spec: https://mpp.dev — the `mppx` package handles the 402 Challenge
// and Credential verification. We use the lower-level helpers here rather
// than the framework middleware because Workers don't ship Express/Hono by
// default.

import { createServer } from "mppx";

const ALLOWED_ORIGINS = [
  "https://samdiamond.xyz",
  "https://www.samdiamond.xyz",
  "https://samueldiamond.github.io",
  // Local dev — strip before going live if you care.
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-MPP-Credential",
    "Access-Control-Expose-Headers": "X-MPP-Challenge, X-MPP-Receipt",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname !== "/tip" && url.pathname !== "/") {
      return new Response("not found", { status: 404, headers: corsHeaders(origin) });
    }

    // Build the MPP server with the configured payment methods. Each method
    // is optional — only those with a populated recipient/var are advertised
    // in the 402 challenge.
    const methods = [];
    if (env.TEMPO_RECIPIENT && env.TEMPO_RECIPIENT !== "0x0000000000000000000000000000000000000000") {
      methods.push({
        kind: "tempo",
        currency: env.TEMPO_TOKEN,
        recipient: env.TEMPO_RECIPIENT,
      });
    }
    if (env.LIGHTNING_LNURL) {
      methods.push({ kind: "lightning", lnurl: env.LIGHTNING_LNURL });
    }

    if (methods.length === 0) {
      return new Response(
        JSON.stringify({ error: "no payment methods configured on the server" }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    const mpp = createServer({ methods });
    const amount = env.TIP_AMOUNT_USD || "0.05";

    const credential = request.headers.get("X-MPP-Credential");
    if (!credential) {
      // No credential → issue 402 challenge.
      const challenge = mpp.challenge({ amount });
      return new Response(
        JSON.stringify({ error: "payment required", amount, methods: challenge.methods }),
        {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-MPP-Challenge": challenge.token,
            ...corsHeaders(origin),
          },
        }
      );
    }

    // Verify the credential against an issued challenge.
    let receipt;
    try {
      receipt = await mpp.verify(credential, { amount });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "invalid credential", detail: String(err.message || err) }),
        { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    // Log the tip if KV is bound.
    if (env.TIPS) {
      const ts = new Date().toISOString();
      await env.TIPS.put(
        `${ts}-${crypto.randomUUID()}`,
        JSON.stringify({ amount, method: receipt.method, ts })
      );
    }

    return new Response(JSON.stringify({ ok: true, amount, receipt: receipt.token }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-MPP-Receipt": receipt.token,
        ...corsHeaders(origin),
      },
    });
  },
};
