import { NWCClient } from "@getalby/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { amount, memo } = req.body;
  if (!amount || isNaN(amount))
    return res.status(400).json({ error: "Amount must be a number" });

  if (!process.env.NWC_URL)
    return res.status(500).json({ error: "NWC_URL is not configured" });

  let client;
  try {
    client = new NWCClient({
      nostrWalletConnectUrl: process.env.NWC_URL,
    });

    const invoice = await client.makeInvoice({
      // NWC amounts are in millisats
      amount: parseInt(amount) * 1000,
      description: memo || "Conpac Game Payment",
    });

    return res.status(200).json({
      paymentHash: invoice.payment_hash,
      paymentRequest: invoice.invoice,
      satoshis: Math.floor(invoice.amount / 1000),
    });
  } catch (err) {
    console.error("Server exception:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    client?.close();
  }
}
