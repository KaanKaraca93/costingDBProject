const axios = require('axios');
const tokenService = require('./tokenService');
const PLM_CONFIG = require('../config/plm.config');

/**
 * PLM IDM "datamodel/entities" API'si, GenericLookUpAll'dan farklı bir kaynak:
 * bir entity'nin (örn. "Theme_Attributes") tüm alan tanımlarını döner; bazı alanların
 * (attr) sabit bir "valueset" (name/desc çiftleri) vardır. Alt Sezon bu şekilde
 * modellenmiş bir Tema özelliği — GenericLookUpAll'da karşılığı yok.
 *
 * Not: valueset'teki `name` alanı DB'ye yazılacak gerçek anahtar (kod), `desc` ise
 * kullanıcıya gösterilecek isimdir (Alt_Sezon için ikisi çoğunlukla aynıdır, bu PLM
 * tarafının bir tercihi/standardıdır).
 *
 * İleride başka bir Tema özelliği (örn. Cluster, Urun_Sinifi, LifeStyle) gerekirse
 * bu fonksiyon farklı `attributeName` ile tekrar kullanılabilir.
 */
async function fetchEntityAttributeValueset(entityName, attributeName) {
  const authHeader = await tokenService.getAuthorizationHeader();
  const url = `${PLM_CONFIG.ionApiUrl}/${PLM_CONFIG.tenantId}/IDM/api/datamodel/entities/${entityName}`;

  const { data } = await axios.get(url, {
    headers: { Authorization: authHeader, Accept: 'application/json' }
  });

  const attrs = (data.entity && data.entity.attrs && data.entity.attrs.attr) || [];
  const attr = attrs.find((a) => a.name === attributeName || a.qual === attributeName);
  if (!attr) {
    throw new Error(`"${entityName}" entity'sinde "${attributeName}" adlı alan bulunamadı.`);
  }

  const values = (attr.valueset && attr.valueset.value) || [];
  return values.map((v) => ({ id: v.name, name: v.desc || v.name }));
}

async function fetchAltSezonValueset() {
  return fetchEntityAttributeValueset('Theme_Attributes', 'Alt_Sezon');
}

async function fetchClusterValueset() {
  return fetchEntityAttributeValueset('Theme_Attributes', 'Cluster');
}

/**
 * Tema ozelliklerinin IDM'deki alan adlari ve valueset'leri.
 *
 * Bu alanlar IDM'de ham HALDE VALUESET ANAHTARI tutar; kullaniciya gosterilecek
 * metin valueset'in `desc` alanindadir:
 *   Alt_Sezon     : anahtar "SS1"  -> desc "SS1"        (ikisi ayni)
 *   Tema_Kisa_Kod : anahtar "463"  -> desc "B-SCT1"     (farkli!)
 *   Hibrit        : anahtar "002"  -> desc "PLAN"       (farkli!)
 * Bu yuzden once entity tanimindan valueset haritalari cekilir, sonra her
 * temanin ham degerleri bu haritalardan gecirilir.
 *
 * Alan adlari PLM tarafinda benzer isimlerle anilabildigi icin (Tema_Kisa_Kodu,
 * Hibrit_Model gibi) her ozellik icin aday isim listesi denenir.
 */
const THEME_ATTRS = {
  altSezon: ['Alt_Sezon'],
  kisaAd: ['Tema_Kisa_Kod', 'Tema_Kisa_Kodu'],
  hibrit: ['Hibrit', 'Hibrit_Model']
};

function findAttr(attrs, adaylar) {
  for (const ad of adaylar) {
    const f = attrs.find((a) => a && (a.name === ad || a.qual === ad));
    if (f) return f;
  }
  return null;
}

/**
 * Theme_Attributes entity tanimindan, ilgilendigimiz alanlarin
 * valueset haritalarini (anahtar -> gosterilecek ad) cikarir.
 * Tek cagri; tum temalar icin bir kez yapilir.
 */
async function fetchThemeAttrMaps() {
  const authHeader = await tokenService.getAuthorizationHeader();
  const url = `${PLM_CONFIG.ionApiUrl}/${PLM_CONFIG.tenantId}/IDM/api/datamodel/entities/Theme_Attributes`;
  const { data } = await axios.get(url, { headers: { Authorization: authHeader, Accept: 'application/json' } });
  const attrs = (data.entity && data.entity.attrs && data.entity.attrs.attr) || [];

  const maps = {};
  for (const key of Object.keys(THEME_ATTRS)) {
    const attr = findAttr(attrs, THEME_ATTRS[key]);
    const values = (attr && attr.valueset && attr.valueset.value) || [];
    maps[key] = new Map(values.map((v) => [String(v.name), v.desc || v.name]));
  }
  return maps;
}

/** Ham degeri valueset uzerinden gosterilecek ada cevirir. */
function cozumle(maps, key, ham) {
  if (ham == null || ham === '') return null;
  const m = maps[key];
  const d = m ? m.get(String(ham)) : undefined;
  return (d != null && d !== '') ? String(d) : String(ham);
}

/**
 * Tek bir temanin Alt_Sezon / Tema_Kisa_Kod / Hibrit degerlerini IDM'den okur.
 * Tema PID'si (Theme.Description) IDM item'ina isaret eder.
 * Hata durumunda hepsi null doner (senkronizasyon tek tema yuzunden durmasin).
 */
async function fetchThemeAttrsForPid(pid, maps) {
  const bos = { altSezon: null, kisaAd: null, hibrit: null };
  if (!pid) return bos;
  try {
    const authHeader = await tokenService.getAuthorizationHeader();
    const url = `${PLM_CONFIG.ionApiUrl}/${PLM_CONFIG.tenantId}/IDM/api/items/${encodeURIComponent(pid)}`;
    const { data } = await axios.get(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    });
    const attrs = (data && data.item && data.item.attrs && data.item.attrs.attr) || [];
    const ham = {};
    for (const key of Object.keys(THEME_ATTRS)) {
      const f = findAttr(attrs, THEME_ATTRS[key]);
      ham[key] = f && f.value != null ? String(f.value) : null;
    }
    return {
      altSezon: cozumle(maps, 'altSezon', ham.altSezon),
      kisaAd: cozumle(maps, 'kisaAd', ham.kisaAd),
      hibrit: cozumle(maps, 'hibrit', ham.hibrit)
    };
  } catch (err) {
    return bos;
  }
}

/**
 * Bir dizi { themeId, pid } icin tema ozelliklerini sinirli eszamanlilikla cozer.
 * IDM cagrisi tema basina ~180 ms; 550 tema 10 paralel ile ~10 sn surer, bu
 * yuzden senkronizasyonda yalnizca HENUZ COZULMEMIS temalar icin cagrilir.
 * @returns {Promise<Array<{themeId, altSezon, kisaAd, hibrit}>>}
 */
async function fetchThemeAttrsForThemes(items, concurrency = 10) {
  if (!items || items.length === 0) return [];
  const maps = await fetchThemeAttrMaps();
  const sonuc = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const it = items[cursor++];
      const v = await fetchThemeAttrsForPid(it.pid, maps);
      sonuc.push({ themeId: it.themeId, ...v });
    }
  };
  const n = Math.min(concurrency, items.length) || 0;
  await Promise.all(Array.from({ length: n }, worker));
  return sonuc;
}

module.exports = {
  fetchEntityAttributeValueset,
  fetchAltSezonValueset,
  fetchClusterValueset,
  fetchThemeAttrMaps,
  fetchThemeAttrsForPid,
  fetchThemeAttrsForThemes,
  THEME_ATTRS
};
