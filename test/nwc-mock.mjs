// In-process NWC wallet service + minimal Nostr relay for the test suite.
// Rides the same HTTP server as the static files so the page reaches it at
// ws://localhost:<port> — which the production CSP's connect-src 'self'
// already permits. Lets the suite exercise the game's real NIP-47 client
// (encryption, signing, relay protocol) with zero external services.
import { WebSocketServer } from "ws";
import { generateSecretKey, getPublicKey, finalizeEvent, nip04 } from "nostr-tools";

const bytesToHex = (bytes) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export function startMockWallet(httpServer, port) {
  const walletSecret = generateSecretKey();
  const walletPubkey = getPublicKey(walletSecret);
  const clientSecret = generateSecretKey();
  const paidInvoices = [];

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (sock) => {
    const subs = new Map();

    sock.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg[0] === "REQ") {
        subs.set(msg[1], msg[2] || {});
        return;
      }
      if (msg[0] === "CLOSE") {
        subs.delete(msg[1]);
        return;
      }
      if (msg[0] !== "EVENT") return;

      const ev = msg[1];
      sock.send(JSON.stringify(["OK", ev.id, true, ""]));
      if (ev.kind !== 23194) return;

      let body;
      try {
        body = JSON.parse(await nip04.decrypt(walletSecret, ev.pubkey, ev.content));
      } catch {
        return; // not encrypted to this wallet
      }

      let response;
      if (body.method === "pay_invoice") {
        paidInvoices.push(body.params.invoice);
        response = {
          result_type: "pay_invoice",
          result: { preimage: "00".repeat(32) },
        };
      } else if (body.method === "get_info") {
        response = {
          result_type: "get_info",
          result: { alias: "mock-wallet", methods: ["pay_invoice", "get_info"] },
        };
      } else {
        response = {
          result_type: body.method,
          error: { code: "NOT_IMPLEMENTED", message: "mock wallet" },
        };
      }

      const content = await nip04.encrypt(
        walletSecret,
        ev.pubkey,
        JSON.stringify(response),
      );
      const respEv = finalizeEvent(
        {
          kind: 23195,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["p", ev.pubkey],
            ["e", ev.id],
          ],
          content,
        },
        walletSecret,
      );

      for (const [subId, filter] of subs) {
        const kindOk = !filter.kinds || filter.kinds.includes(respEv.kind);
        const eOk = !filter["#e"] || filter["#e"].includes(ev.id);
        if (kindOk && eOk) {
          sock.send(JSON.stringify(["EVENT", subId, respEv]));
        }
      }
    });
  });

  return {
    connectionString: `nostr+walletconnect://${walletPubkey}?relay=${encodeURIComponent(
      `ws://localhost:${port}`,
    )}&secret=${bytesToHex(clientSecret)}`,
    paidInvoices,
  };
}
