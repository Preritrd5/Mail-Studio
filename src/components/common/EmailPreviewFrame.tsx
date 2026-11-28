import React, { useEffect, useRef, useState } from 'react';
import { extractEmailDocumentParts } from '../../services/clientEmailSanitizer';

export interface EmailPreviewFrameProps {
  html: string;
  viewport?: 'desktop' | 'mobile';
  title?: string;
  minHeight?: number;
  maxHeight?: number;
  seamless?: boolean;
  className?: string;
}

const PUBLIC_LOGO_FALLBACK_URL = 'https://emaildraft.vercel.app/assets/snpsunexus-logo.png';
const LOGO_SRC_REGEX =
  /(?:(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)?\/?assets\/snpsunexus-logo\.png|cid:snpsunexus-logo@snpsunexus)/gi;

let cachedLogoDataUrl: string | null = null;
let logoLoadPromise: Promise<string | null> | null = null;

function loadPreviewLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return Promise.resolve(cachedLogoDataUrl);
  if (logoLoadPromise) return logoLoadPromise;

  logoLoadPromise = (async () => {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
    try {
      const res = await fetch('/assets/snpsunexus-logo.png', { cache: 'force-cache' });
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) cachedLogoDataUrl = dataUrl;
      return dataUrl;
    } catch {
      return null;
    }
  })();

  return logoLoadPromise;
}

function resolvePreviewLogoSources(rawHtml: string, resolvedDataUrl: string | null): string {
  if (!rawHtml) return '';
  const originUrl =
    typeof window !== 'undefined' && window.location?.origin && /^https?:/i.test(window.location.origin)
      ? `${window.location.origin}/assets/snpsunexus-logo.png`
      : PUBLIC_LOGO_FALLBACK_URL;

  const replacement = resolvedDataUrl || originUrl;
  return rawHtml.replace(LOGO_SRC_REGEX, replacement);
}

const BASE_PREVIEW_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    min-height: 100%;
    overflow-x: hidden;
  }
  img { max-width: 100%; height: auto; }
`;

/**
 * Zero-flicker sandboxed email preview frame that updates CSS & body HTML in-place
 * without remounting the iframe document or losing scroll position on keystrokes.
 * Scripts are permanently disabled (`sandbox="allow-same-origin"` without `allow-scripts`).
 */
export const EmailPreviewFrame: React.FC<EmailPreviewFrameProps> = ({
  html,
  viewport = 'desktop',
  title = 'Live Email Preview',
  minHeight = 460,
  maxHeight = 640,
  seamless = false,
  className = '',
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initializedRef = useRef(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(cachedLogoDataUrl);

  useEffect(() => {
    if (logoDataUrl) return;
    let active = true;
    void loadPreviewLogoDataUrl().then((url) => {
      if (active && url) setLogoDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [logoDataUrl]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const { safeCss, bodyHtml, bodyStyle } = extractEmailDocumentParts(html);
    const resolvedBodyHtml = resolvePreviewLogoSources(bodyHtml, logoDataUrl);
    const baseHref =
      typeof window !== 'undefined' && window.location?.origin && /^https?:/i.test(window.location.origin)
        ? `${window.location.origin}/`
        : '/';

    const writeOrUpdate = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      if (!initializedRef.current || !doc.getElementById('preview-email-root')) {
        doc.open();
        doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="${baseHref}" />
  <style id="preview-base-css">${BASE_PREVIEW_CSS}</style>
  <style id="preview-email-css"></style>
</head>
<body style="margin:0;padding:0;background-color:#F4F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E293B;">
  <div id="preview-email-root"></div>
</body>
</html>`);
        doc.close();
        initializedRef.current = true;
      }

      const prevScrollTop = doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
      const cssEl = doc.getElementById('preview-email-css');
      const rootEl = doc.getElementById('preview-email-root');

      if (cssEl && cssEl.textContent !== safeCss) {
        cssEl.textContent = safeCss;
      }
      if (doc.body && bodyStyle) {
        doc.body.setAttribute('style', bodyStyle);
      }
      if (rootEl && rootEl.innerHTML !== resolvedBodyHtml) {
        rootEl.innerHTML = resolvedBodyHtml;

        // Guarantee brand logo never stays broken in sandboxed preview iframes
        rootEl.querySelectorAll('img').forEach((img) => {
          const srcAttr = img.getAttribute('src') || '';
          if (srcAttr.includes('snpsunexus-logo') || img.alt.toLowerCase().includes('snpsunexus')) {
            img.addEventListener(
              'error',
              () => {
                if (img.src !== PUBLIC_LOGO_FALLBACK_URL) {
                  img.src = logoDataUrl || PUBLIC_LOGO_FALLBACK_URL;
                }
              },
              { once: true }
            );
          }
        });
      }

      window.requestAnimationFrame(() => {
        if (!doc.documentElement || !doc.body) return;
        doc.documentElement.scrollTop = prevScrollTop;
        doc.body.scrollTop = prevScrollTop;
      });
    };

    writeOrUpdate();
  }, [html, logoDataUrl]);

  const isMobile = viewport === 'mobile';

  if (seamless) {
    return (
      <div className={`bg-slate-100 border border-[#CBD5E1] rounded-[12px] overflow-hidden shadow-xs ${className}`}>
        <iframe
          ref={iframeRef}
          title={title}
          sandbox="allow-same-origin"
          className="w-full block border-0 bg-[#F4F6FA]"
          style={{ minHeight: `${minHeight}px`, height: `${maxHeight}px` }}
        />
      </div>
    );
  }

  return (
    <div
      className={`w-full flex justify-center bg-[#F1F5F9] rounded-[12px] border border-[#CBD5E1] p-2.5 sm:p-4 overflow-hidden ${className}`}
    >
      <div
        className={`bg-white overflow-hidden transition-[width] duration-200 ease-out ${
          isMobile
            ? 'w-[375px] max-w-full rounded-[22px] border-[4px] border-[#1E293B] shadow-lg'
            : 'w-full max-w-[650px] rounded-[10px] border border-[#CBD5E1] shadow-xs'
        }`}
      >
        <iframe
          ref={iframeRef}
          title={title}
          sandbox="allow-same-origin"
          className="w-full block border-0 bg-white"
          style={{ minHeight: `${minHeight}px`, height: `${maxHeight}px` }}
        />
      </div>
    </div>
  );
};
