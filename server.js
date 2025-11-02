const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const qs = require("querystring");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// PayFast host
const pfHost = "sandbox.payfast.co.za"; // Use "www.payfast.co.za" for production
const myPassphrase = "jt7NOE43FZPn";

// Utility: generate MD5 signature
const generateSignature = (data, passPhrase = null) => {
  let pfOutput = "";

  Object.keys(data)
    .sort() // important: ensure order is consistent
    .forEach((key) => {
      if (data[key] !== "") {
        pfOutput += `${key}=${encodeURIComponent(data[key].trim()).replace(/%20/g, "+")}&`;
      }
    });

  let getString = pfOutput.slice(0, -1);

  if (passPhrase) {
    getString += `&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g, "+")}`;
  }

  return crypto.createHash("md5").update(getString).digest("hex");
};

// ✅ Create Payment (used by Flutter)
app.post("/create-payment", (req, res) => {
  const { amount, item_name } = req.body;

  if (!amount || !item_name) {
    return res.status(400).json({ error: "Missing amount or item_name" });
  }

  const paymentData = {
    merchant_id: "10000100",
    merchant_key: "46f0cd694581a",
    return_url: "http://localhost:3000/return",
    cancel_url: "http://localhost:3000/cancel",
    notify_url: "http://localhost:3000/notify",
    name_first: "John",
    name_last: "Doe",
    email_address: "test@test.com",
    m_payment_id: new Date().getTime().toString(),
    amount: Number(amount).toFixed(2),
    item_name,
  };

  paymentData.signature = generateSignature(paymentData, myPassphrase);
  const queryParams = new URLSearchParams(paymentData).toString();
  const paymentUrl = `https://${pfHost}/eng/process?${queryParams}`;

  res.json({ paymentUrl });
});

// ✅ Notify route (PayFast server -> your backend)
app.post("/notify", async (req, res) => {
  try {
    const pfData = req.body;
    console.log("🔔 PayFast Notification Received:", pfData);

    // Step 1. Verify signature
    const signature = pfData.signature;
    delete pfData.signature; // remove before re-signing
    const calculatedSignature = generateSignature(pfData, myPassphrase);

    if (signature !== calculatedSignature) {
      console.error("❌ Invalid signature");
      return res.status(400).send("Invalid signature");
    }

    // Step 2. Verify with PayFast
    const verifyUrl = `https://${pfHost}/eng/query/validate`;
    const response = await axios.post(verifyUrl, qs.stringify(pfData), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const validResponse = response.data.trim();

    if (validResponse !== "VALID") {
      console.error("❌ PayFast did not validate the data:", validResponse);
      return res.status(400).send("Invalid data");
    }

    // Step 3. (Optional) Check amount and merchant ID
    if (pfData.merchant_id !== "10000100") {
      console.error("❌ Invalid merchant ID");
      return res.status(400).send("Invalid merchant ID");
    }

    // Here you could also check pfData.amount matches what you expected.

    // ✅ Payment is verified
    console.log("✅ Payment verified successfully for:", pfData.m_payment_id);

    // TODO: Update your database or order status here
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error handling PayFast notify:", err.message);
    res.sendStatus(500);
  }
});

// ✅ Return & Cancel routes
app.get("/return", (req, res) => res.send("✅ Payment completed!"));
app.get("/cancel", (req, res) => res.send("❌ Payment canceled."));

app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));
