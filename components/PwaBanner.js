import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

// Texto do convite de instalação conforme a página em que a pessoa está.
// O app instalado abre exatamente na página onde foi instalado (catálogo, agenda ou gestão).
const getContext = (pathname) => {
  if (pathname === '/[slug]') {
    return { key: 'catalogo', title: 'Instalar Aplicativo', text: 'Instale para agendar seus horários mais rápido!' };
  }
  if (pathname === '/[slug]/agenda') {
    return { key: 'agenda', title: 'Instalar Agenda', text: 'Instale a agenda no celular para acompanhar seus atendimentos.' };
  }
  if (pathname === '/') {
    return { key: 'gestao', title: 'Instalar Painel de Gestão', text: 'Acesse o painel do seu estabelecimento com um toque.' };
  }
  return null; // no painel admin não mostra
};

const DISMISS_DAYS = 7;

export default function PwaBanner() {
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const ctx = getContext(router.pathname);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(iosDevice);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  useEffect(() => {
    if (!ctx) return setShowBanner(false);
    const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
    if (isStandalone) return setShowBanner(false);

    let dismissedAt = 0;
    try { dismissedAt = Number(localStorage.getItem(`pwa_banner_dismissed_${ctx.key}`) || 0); } catch (e) {}
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return setShowBanner(false);

    setShowBanner(isIos || !!deferredPrompt);
  }, [router.pathname, isIos, deferredPrompt]);

  const handleDismiss = () => {
    setShowBanner(false);
    try { if (ctx) localStorage.setItem(`pwa_banner_dismissed_${ctx.key}`, String(Date.now())); } catch (e) {}
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!showBanner || !ctx) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-gray-900 border border-orange-500/40 text-white p-4 rounded-2xl shadow-2xl flex flex-col space-y-3 font-sans">
      <div className="flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <img src="/icon-192.png" alt="App Icon" className="w-10 h-10 rounded-xl border border-gray-700" />
          <div>
            <h4 className="font-bold text-xs text-orange-400">{ctx.title}</h4>
            <p className="text-[11px] text-gray-300">{ctx.text}</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-white text-xs p-1">
          ✕
        </button>
      </div>

      {isIos ? (
        <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-800 text-[11px] text-gray-300 leading-relaxed">
          📱 <b>No iPhone:</b> Toque no botão <b>Compartilhar <span className="text-orange-400">📤</span></b> do Safari e selecione <b>"Adicionar à Tela de Início"</b>.
        </div>
      ) : (
        <button
          onClick={handleInstallClick}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2.5 rounded-xl transition shadow-lg">
          📲 Instalar Agora
        </button>
      )}
    </div>
  );
}
