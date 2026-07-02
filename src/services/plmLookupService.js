const axios = require('axios');
const tokenService = require('./tokenService');
const PLM_CONFIG = require('../config/plm.config');

/**
 * PLM GenericLookUpAll içindeki GlrefId değerleri.
 * PARAMETER_DB_SPEC.md'deki 4 kırılım alanına karşılık gelir.
 */
const GLREF_IDS = {
  marka: 1,
  altKategori: 69,
  lifestyleGrup: 227,
  segment: 232
};

function resolveDisplayName(item) {
  const trTranslation = (item.Translations || []).find(
    (t) => (t.Culture || '').toLowerCase() === 'tr-tr'
  );
  return (trTranslation && trTranslation.Name) ? trTranslation.Name : item.Name;
}

/**
 * Belirli bir GlrefId için PLM'den lookup listesini çeker.
 * DB'ye kaydedilecek gerçek anahtar GlValId'dir; kullanıcıya gösterilecek
 * isim ise TR çevirisi varsa Translations'tan, yoksa kök Name'den alınır.
 */
async function fetchLookup(glrefId) {
  const authHeader = await tokenService.getAuthorizationHeader();
  const url = `${PLM_CONFIG.ionApiUrl}/${PLM_CONFIG.tenantId}/FASHIONPLM/odata2/api/odata2/GenericLookUpAll/GetAllLookups`;

  const { data } = await axios.get(url, {
    headers: { Authorization: authHeader },
    params: {
      '$filter': `GlrefId eq ${glrefId}`,
      language: 'tr-tr'
    }
  });

  return (data.value || []).map((item) => ({
    id: item.GlValId,
    code: item.Code,
    name: resolveDisplayName(item),
    status: item.Status
  }));
}

async function fetchAllLookups() {
  const [marka, altKategori, lifestyleGrup, segment] = await Promise.all([
    fetchLookup(GLREF_IDS.marka),
    fetchLookup(GLREF_IDS.altKategori),
    fetchLookup(GLREF_IDS.lifestyleGrup),
    fetchLookup(GLREF_IDS.segment)
  ]);

  return { marka, altKategori, lifestyleGrup, segment };
}

module.exports = { GLREF_IDS, fetchLookup, fetchAllLookups };
