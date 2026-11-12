import { Html, Head, Main, NextScript } from 'next/document';

// IMPORTANTE: o <link rel="manifest"> NÃO fica mais aqui.
// Cada página define o seu, para que cada app instalado abra no lugar certo:
//   /            e /{slug}/admin -> /manifest.json            (Gestão: dono do estabelecimento)
//   /{slug}                     -> /api/manifest?app=catalogo (cliente final, sem login)
//   /{slug}/agenda              -> /api/manifest?app=agenda   (profissionais)
export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* Meta tags essenciais para iOS / Safari */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
