import { useEffect } from 'react';
import Script from 'next/script';
import '../styles/globals.css';
import PwaBanner from '../components/PwaBanner';

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // 1. Registro do Service Worker para suporte ao PWA
    if ('serviceWorker' in navigator) {
      const registerSw = () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.error('Erro ao registrar ServiceWorker:', err);
        });
      };
      // Se a página já terminou de carregar, registra na hora (antes podia nunca registrar)
      if (document.readyState === 'complete') registerSw();
      else window.addEventListener('load', registerSw, { once: true });
    }

    // 2. Inicialização do OneSignal
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.init({
        appId: "4459285b-e81c-458e-a6dc-ebc5e1d9baef",
        notifyButton: { enable: false },
        allowLocalhostAsSecureOrigin: true,
        // Um único service worker para o app e para as notificações (o sw.js já carrega o OneSignal)
        serviceWorkerPath: 'sw.js',
        serviceWorkerParam: { scope: '/' }
      });
    });
  }, []);

  return (
    <>
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />
      <Component {...pageProps} />
      <PwaBanner />
    </>
  );
}
