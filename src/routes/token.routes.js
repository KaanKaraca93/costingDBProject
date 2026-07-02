const express = require('express');
const router = express.Router();
const tokenService = require('../services/tokenService');

/**
 * Bu endpoint'ler şimdilik tanı/test amaçlı; ileride ref_alt_kategori gibi
 * referans listelerini PLM'den senkronize etmek için kullanılacak.
 */
router.get('/token', async (req, res) => {
  try {
    const token = await tokenService.getAccessToken();
    const tokenInfo = tokenService.getTokenInfo();
    res.json({
      success: true,
      accessToken: token,
      tokenType: tokenInfo.tokenType,
      expiresAt: tokenInfo.expiryTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/token/info', (req, res) => {
  res.json({ success: true, tokenInfo: tokenService.getTokenInfo() });
});

router.post('/token/refresh', async (req, res) => {
  try {
    if (tokenService.getTokenInfo().hasToken) {
      await tokenService.revokeToken();
    }
    const token = await tokenService.getAccessToken();
    res.json({ success: true, accessToken: token, tokenInfo: tokenService.getTokenInfo() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/token/revoke', async (req, res) => {
  try {
    await tokenService.revokeToken();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
