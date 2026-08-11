/**
 * Postgres hatalarını kullanıcıya gösterilebilir Türkçe mesaja çevirir.
 * Excel toplu içe aktarmada satır satır "failed" listesine yazıldığı için
 * ham driver mesajı yerine anlaşılır bir metin gerekiyor.
 */
function describeDbError(err) {
  if (!err) return 'Bilinmeyen hata.';
  // 23505: unique_violation — aynı kırılımda başka bir kayıt zaten var.
  if (err.code === '23505') {
    return 'Bu kırılımda zaten bir kayıt var (tekrar eden satır içe aktarılmadı).';
  }
  // 23502: not_null_violation
  if (err.code === '23502') {
    return `Zorunlu alan boş bırakılamaz: ${err.column || 'bilinmiyor'}.`;
  }
  return err.message || String(err);
}

module.exports = { describeDbError };
