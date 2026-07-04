import { GOOGLE_ADS_ID } from '@app/lib/analytics/googleConversions';

/**
 * The marketing tags are split in two: the queueing stubs (`gtag`, `fbq`,
 * `dataLayer`) plus their config calls install synchronously — they're a
 * few array pushes, and events fired before the vendor scripts arrive queue
 * in order with full attribution — while the third-party script downloads
 * (gtag.js, gtm.js, fbevents.js) are deferred to idle so their network,
 * parse, and execution never compete with first paint.
 */
const scheduleIdleScriptInjection = (inject: () => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => inject(), { timeout: 5_000 });
  } else {
    setTimeout(inject, 1_500);
  }
};

export const initializeGoogleAnalytics = () => {
  const G_ID = 'G-52HPEL3FTV';

  // Stub + config first: defines the global gtag and queues the config
  // calls at the head of the dataLayer, before any app events.
  // Registering the AW account on page load is what lets gtag pick up
  // ?gclid=… from the URL into the _gcl_aw cookie, so subsequent
  // gtag('event', 'conversion', ...) fires can be attributed to the ad click.
  const gaInit = document.createElement('script');
  gaInit.innerHTML = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${G_ID}', { send_page_view: false });
    gtag('config', '${GOOGLE_ADS_ID}');
  `;
  document.head.appendChild(gaInit);

  scheduleIdleScriptInjection(() => {
    // Google Analytics
    const gaScript = document.createElement('script');
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${G_ID}`;
    gaScript.async = true;
    document.head.appendChild(gaScript);

    // Google Tag Manager
    const gtmScript = document.createElement('script');
    gtmScript.innerHTML = `
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','GTM-M58X7PJ8');
    `;
    document.head.appendChild(gtmScript);
  });
};

export const initializeMetaPixel = () => {
  const PIXEL_ID = '639142540393286';

  // Queueing stub + init synchronously; fbq calls made before the vendor
  // script loads accumulate in n.queue and flush on load.
  const fbqInit = document.createElement('script');
  fbqInit.innerHTML = `
     !function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];}(window);
      fbq.disablePushState = true;
      fbq('init', '${PIXEL_ID}');
    `;

  document.head.appendChild(fbqInit);

  scheduleIdleScriptInjection(() => {
    const pixelScript = document.createElement('script');
    pixelScript.async = true;
    pixelScript.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(pixelScript);

    const pixelImage = document.createElement('img');

    pixelImage.width = 1;
    pixelImage.height = 1;
    pixelImage.src = `https://www.facebook.com/tr?id=${PIXEL_ID}&ev=ViewContent&cd[content_name]=App%20NoScript&ev=PageView&noscript=1`;
    pixelImage.style.display = 'none';

    const pixelImageInit = document.createElement('noscript');
    pixelImageInit.append(pixelImage);

    document.head.appendChild(pixelImageInit);
  });
};
