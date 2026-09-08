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
 * Tek bir temanin Alt_Sezon degerini IDM'den cozer.
 * Tema PID'si (Theme.Description, orn. "Theme_Attributes-397-0-LATEST")
 * IDM item'ina isaret eder; Alt_Sezon o item'in bir attribute'udur.
 * Hata durumunda null doner (senkronizasyon tek tema yuzunden durmasin).
 */
async function fetchAltSezonForPid(pid) {
  if (!pid) return null;
  try {
    const authHeader = await tokenService.getAuthorizationHeader();
    const url = `${PLM_CONFIG.ionApiUrl}/${PLM_CONFIG.tenantId}/IDM/api/items/${encodeURIComponent(pid)}`;
    const { data } = await axios.get(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    });
    const attrs = (data && data.item && data.item.attrs && data.item.attrs.attr) || [];
    const found = attrs.find((a) => a && (a.name === 'Alt_Sezon' || a.qual === 'Alt_Sezon'));
    return found && found.value != null ? String(found.value) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Bir dizi { themeId, pid } icin Alt_Sezon'u sinirli eszamanlilikla cozer.
 * IDM cagrisi tema basina ~180 ms; 550 tema 10 paralel ile ~10 sn surer, bu
 * yuzden senkronizasyonda yalnizca Alt_Sezon'u HENUZ BILINMEYEN temalar icin
 * cagrilir (ilk senkron yavas, sonrakiler hizli).
 * @returns {Promise<Array<{themeId: number, altSezon: string|null}>>}
 */
async function fetchAltSezonForThemes(items, concurrency = 10) {
  const sonuc = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const it = items[cursor++];
      sonuc.push({ themeId: it.themeId, altSezon: await fetchAltSezonForPid(it.pid) });
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
  fetchAltSezonForPid,
  fetchAltSezonForThemes
};
