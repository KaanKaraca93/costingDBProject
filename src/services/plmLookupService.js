const axios = require('axios');
const tokenService = require('./tokenService');
const PLM_CONFIG = require('../config/plm.config');
const { RANGE_EXT_FLD_IDS } = require('../config/rangeFields');

/**
 * PLM GenericLookUpAll içindeki GlrefId değerleri.
 * PARAMETER_DB_SPEC.md'deki 4 kırılım alanına karşılık gelir.
 */
const GLREF_IDS = {
  marka: 1,
  altKategori: 69,
  lifestyleGrup: 227,
  segment: 232,
  sezon: 58,
  bolum: 90,
  kategori: 65,
  // Option Plan (v6.2) ek kırılımları:
  fashionPyramid: 224, // CUD1
  koleksiyonTipi: 228  // CUD5 (Excel'de "FT")
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
  const [marka, altKategori, lifestyleGrup, segment, sezon, bolum, kategori, fashionPyramid, koleksiyonTipi] = await Promise.all([
    fetchLookup(GLREF_IDS.marka),
    fetchLookup(GLREF_IDS.altKategori),
    fetchLookup(GLREF_IDS.lifestyleGrup),
    fetchLookup(GLREF_IDS.segment),
    fetchLookup(GLREF_IDS.sezon),
    fetchLookup(GLREF_IDS.bolum),
    fetchLookup(GLREF_IDS.kategori),
    fetchLookup(GLREF_IDS.fashionPyramid),
    fetchLookup(GLREF_IDS.koleksiyonTipi)
  ]);

  return { marka, altKategori, lifestyleGrup, segment, sezon, bolum, kategori, fashionPyramid, koleksiyonTipi };
}

/**
 * PLM ExtendedFieldDropDown (odata2): Range Plan (v7.2) "Range Detayı" değerleri.
 * RANGE_EXT_FLD_IDS'teki 7 Extended Field için dropdown seçeneklerini çeker.
 * DB anahtarı ExtFldDropDownId'dir; ext_fld_id hangi alana ait olduğunu belirtir.
 */
async function fetchExtendedFieldDropDown() {
  const authHeader = await tokenService.getAuthorizationHeader();
  const url = `${PLM_CONFIG.ionApiUrl}/${PLM_CONFIG.tenantId}/FASHIONPLM/odata2/api/odata2/ExtendedFieldDropDown`;
  const filter = RANGE_EXT_FLD_IDS.map((id) => `ExtFldId eq ${id}`).join(' or ');

  const { data } = await axios.get(url, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
    params: { '$filter': filter }
  });

  return (data.value || []).map((item) => ({
    id: item.ExtFldDropDownId,
    extFldId: item.ExtFldId,
    name: item.Name,
    code: item.Code,
    status: item.Status
  }));
}

module.exports = { GLREF_IDS, fetchLookup, fetchAllLookups, fetchExtendedFieldDropDown };
