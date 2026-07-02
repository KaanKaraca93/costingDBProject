const axios = require('axios');
const PLM_CONFIG = require('../config/plm.config');

/**
 * PLM/ION OAuth2.0 token servisi.
 * IpekyolRangeSayac projesindeki tokenService.js ile aynı mantık; ileride PLM'den
 * ref_alt_kategori gibi referans listelerini çekmek için kullanılacak.
 */
class TokenService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenType = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.isTokenValid()) {
      return this.accessToken;
    }
    return this.fetchNewToken();
  }

  isTokenValid() {
    if (!this.tokenExpiry) return false;
    const bufferTime = 5 * 60 * 1000;
    return Date.now() < (this.tokenExpiry - bufferTime);
  }

  async fetchNewToken() {
    try {
      const tokenUrl = `${PLM_CONFIG.providerUrl}${PLM_CONFIG.endpoints.token}`;

      const params = new URLSearchParams();
      params.append('grant_type', 'password');
      params.append('username', PLM_CONFIG.serviceAccountAccessKey);
      params.append('password', PLM_CONFIG.serviceAccountSecretKey);

      const auth = Buffer.from(`${PLM_CONFIG.clientId}:${PLM_CONFIG.clientSecret}`).toString('base64');

      const response = await axios.post(tokenUrl, params, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.data || !response.data.access_token) {
        throw new Error('Token yanıtında access_token bulunamadı.');
      }

      this.accessToken = response.data.access_token;
      this.tokenType = response.data.token_type || 'Bearer';
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + expiresIn * 1000;

      return this.accessToken;
    } catch (error) {
      const detail = error.response ? JSON.stringify(error.response.data) : error.message;
      throw new Error(`PLM token alınamadı: ${detail}`);
    }
  }

  async getAuthorizationHeader() {
    const token = await this.getAccessToken();
    return `${this.tokenType} ${token}`;
  }

  async revokeToken() {
    if (!this.accessToken) return;

    const revokeUrl = `${PLM_CONFIG.providerUrl}${PLM_CONFIG.endpoints.revoke}`;
    const params = new URLSearchParams();
    params.append('token', this.accessToken);

    const auth = Buffer.from(`${PLM_CONFIG.clientId}:${PLM_CONFIG.clientSecret}`).toString('base64');

    await axios.post(revokeUrl, params, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenType = null;
  }

  getTokenInfo() {
    return {
      hasToken: !!this.accessToken,
      isValid: this.isTokenValid(),
      expiryTime: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
      tokenType: this.tokenType
    };
  }
}

module.exports = new TokenService();
