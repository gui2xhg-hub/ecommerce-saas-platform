// Liga este aparelho às notificações SOMENTE do estabelecimento informado.
// (Antes, as notificações de uma loja chegavam nos aparelhos de todas as lojas.)
export function linkPushToTenant(tenantId) {
  if (typeof window === 'undefined' || !tenantId) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.login(`tenant_${tenantId}`);
    } catch (e) {
      console.warn('OneSignal login falhou:', e);
    }
  });
}
