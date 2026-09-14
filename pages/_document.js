import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* Carrega Tailwind CSS de forma simples e rápida */}
        <script src="https://cdn.tailwindcss.com"></script>

        {/* Configurações do PWA - E-Commerce */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="theme-color" content="#2563EB" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Loja Virtual" />
      </Head>
      <body className="bg-gray-950 text-white font-sans antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
