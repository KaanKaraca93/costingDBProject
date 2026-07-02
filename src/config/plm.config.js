/**
 * PLM/ION API Configuration
 * OAuth2.0 credentials for Infor CloudSuite
 * NOT: Bu bilgiler bilinçli olarak hardcoded tutuluyor (IpekyolRangeSayac projesiyle aynı yaklaşım).
 * Entegrasyon test edilip stabilleştikten sonra environment variable'a taşınacak.
 */

const isProduction = process.env.NODE_ENV === 'production';

const TEST_CONFIG = {
  tenantId: 'ATJZAMEWEF5P4SNV_TST',
  clientName: 'BackendServisi',
  clientId: 'ATJZAMEWEF5P4SNV_TST~vlWkwz2P74KAmRFfihVsdK5yjnHvnfPUrcOt4nl6gkI',
  clientSecret: 'HU1TUcBOX1rkp-uuYKUQ3simFEYzPKNM-XIyf4ewIxe-TYUZOK7RAlXUPd_FwSZMAslt8I9RZmv23xItVKY8EQ',
  serviceAccountAccessKey: 'ATJZAMEWEF5P4SNV_TST#5d3TLFCMqK_CR9wmWsLbIn1UnLv2d8S0ohtIX4TZ4PUBXyvtx-RjHjscLzfB9NBAGZfdWMgzFt3DCpWoJMOHEg',
  serviceAccountSecretKey: 'g0oBJ4ubPxJwgJZjAxAfguExlH3V5-cFF0zove_9Fb_7h4C67eXko45T9Ltjw-DYzfYUbU_iQbCZuTW6wYeX5Q'
};

const PROD_CONFIG = {
  tenantId: 'ATJZAMEWEF5P4SNV_PRD',
  clientName: 'BackendServisi',
  clientId: 'ATJZAMEWEF5P4SNV_PRD~zWbsEgkMBlqdSXoSAXBiM8V1POA0-2Mkn1qkORhxma0',
  clientSecret: 'Ll2ehfOJ14uXzyLwR-6BIUmnQNFfhSFRadOzhfzIgK8DBs0x8_AQ3vqbiNrCVOfTyN3_v_Vyf1Yq4WMA7F68hg',
  serviceAccountAccessKey: 'ATJZAMEWEF5P4SNV_PRD#fAzHs-Kdtut0xOXsRx1rnc4kB9icdTJ25HPE65-3-Q0G477cLbXRgPOsL0JjhQCA2VlgbJvK400_9ZaezhMKIQ',
  serviceAccountSecretKey: 'Bd7aqwQd7K8Xw8uMLffxlNrM8oROajrY18EVpPalakqECxXs5HzFzZoT45JBKtUGZvfacr8bCrgCmgscu71rTA'
};

const envConfig = isProduction ? PROD_CONFIG : TEST_CONFIG;

const PLM_CONFIG = {
  tenantId: envConfig.tenantId,
  clientName: envConfig.clientName,

  clientId: envConfig.clientId,
  clientSecret: envConfig.clientSecret,

  serviceAccountAccessKey: envConfig.serviceAccountAccessKey,
  serviceAccountSecretKey: envConfig.serviceAccountSecretKey,

  ionApiUrl: 'https://mingle-ionapi.eu1.inforcloudsuite.com',
  providerUrl: `https://mingle-sso.eu1.inforcloudsuite.com:443/${envConfig.tenantId}/as/`,

  endpoints: {
    authorization: 'authorization.oauth2',
    token: 'token.oauth2',
    revoke: 'revoke_token.oauth2'
  },

  delegationType: '12',
  version: '1.1',
  eventVersion: 'V1480769020',

  seasonId: process.env.PLM_SEASON_ID || 1
};

console.log(`🔧 PLM Config yüklendi: ${isProduction ? 'PRODUCTION' : 'TEST'} (${PLM_CONFIG.tenantId})`);

module.exports = PLM_CONFIG;
