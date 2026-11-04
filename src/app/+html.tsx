import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web-only HTML wrapper used for static rendering.
 * Adds the PWA manifest and iOS "Add to Home Screen" tags (#102).
 *
 * SDK 58: Expo injects the app's scripts and styles through `headNodes` / `bodyNodes` —
 * they must be rendered here or the page never becomes interactive.
 */
export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="description" content="Learn Mandarin Chinese with the HSK 3.0 curriculum." />
        <meta name="theme-color" content="#B8202E" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="HSK Chinese" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: bodyBackground }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

// Avoids a white flash before React loads in dark mode.
const bodyBackground = `
body { background-color: #fff; }
@media (prefers-color-scheme: dark) { body { background-color: #0E0E11; } }
`;
