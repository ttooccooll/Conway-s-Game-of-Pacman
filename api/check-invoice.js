import { NWCClient } from "@getalby/sdk";

export default async function handler(req, res) {
  const paymentHash = req.query.paymentHash;
  if (!paymentHash) {
    return res.status(400).json({ error: "Missing paymentHash" });
  }

  if (!process.env.NWC_URL)
    return res.status(500).json({ error: "NWC_URL is not configured" });

  let client;
  try {
    client = new NWCClient({
      nostrWalletConnectUrl: process.env.NWC_URL,
    });

    const invoice = await client.lookupInvoice({ payment_hash: paymentHash });

    const paid = invoice.state === "settled" || Boolean(invoice.settled_at);

    return res.status(200).json({
      paid,
      status: invoice.state || (paid ? "settled" : "pending"),
    });
  } catch (err) {
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "Invoice not found" });
    }
    return res
      .status(500)
      .json({ error: "NWC lookup failed", details: err.message });
  } finally {
    client?.close();
  }
}
