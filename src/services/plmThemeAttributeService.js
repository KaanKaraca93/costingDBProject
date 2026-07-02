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

module.exports = { fetchEntityAttributeValueset, fetchAltSezonValueset };
