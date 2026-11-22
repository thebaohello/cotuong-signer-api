const { ethers } = require("ethers");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function calcRefundWei(betWeiStr, lostPieces) {
  const betWei = BigInt(betWeiStr);
  const lost = Math.max(0, Math.min(16, Number(lostPieces) || 0));
  const pct = Math.max(10, 90 - lost * 5);
  return (betWei * BigInt(pct)) / 100n;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: "Chỉ hỗ trợ phương thức POST" })
    };
  }

  try {
    const privateKey = process.env.SIGNER_PRIVATE_KEY;
    if (!privateKey) {
      return {
        statusCode: 500,
        headers: HEADERS,
        body: JSON.stringify({ ok: false, error: "Thiếu biến môi trường SIGNER_PRIVATE_KEY trên Netlify" })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { action, matchId, player, betWei, lostPieces } = body;

    if (!action || matchId === undefined || !player || !betWei) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ ok: false, error: "Thiếu tham số matchId, player hoặc betWei" })
      };
    }

    const wallet = new ethers.Wallet(privateKey);
    const idBig = BigInt(matchId);
    const betBig = BigInt(betWei);

    if (action === "signWin") {
      // Lưu ý: kiểm tra lại cách hash trong CoTuongCoreEscrow.sol để khớp 100%
      const digest = ethers.solidityPackedKeccak256(
        ["string", "uint256", "address", "uint256"],
        ["WIN", idBig, player, betBig]
      );
      const signature = await wallet.signMessage(ethers.getBytes(digest));
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ ok: true, signer: wallet.address, signature })
      };
    }

    if (action === "signCancel") {
      const refundWei = calcRefundWei(betWei, lostPieces);
      const digest = ethers.solidityPackedKeccak256(
        ["string", "uint256", "address", "uint256"],
        ["CANCEL", idBig, player, refundWei]
      );
      const signature = await wallet.signMessage(ethers.getBytes(digest));
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          ok: true,
          signer: wallet.address,
          refundWei: refundWei.toString(),
          signature
        })
      };
    }

    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: "action không hợp lệ" })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: err.message || "Lỗi ký chữ ký" })
    };
  }
};
