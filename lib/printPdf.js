// lib/printPdf.js
// Client-side only. Browsers don't expose a way to silently print without
// the person at the keyboard confirming a dialog — letting any website
// print unprompted to whatever printer is set up would be a serious
// security hole — so this is the closest a web app gets to "print
// immediately": load the PDF invisibly and trigger the native print dialog
// itself the moment it's ready, so all staff do is hit Print/confirm.
//
// iPad/iOS Safari refuses to print from within an iframe (throws on
// contentWindow.print()), so it falls back to `onFallback` — pass a
// callback that shows the PDF in an in-page preview (see
// PdfPreviewModal.jsx) rather than navigating there, since on iOS a plain
// window.open() for a PDF takes over the tab with no way back to the app
// (worse still in a home-screen-installed PWA, which has no browser chrome
// at all). If no onFallback is given, window.open is the last resort.
export function printPdfUrl(url, { onFallback } = {}) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;

  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      if (onFallback) {
        onFallback();
      } else {
        window.open(url, '_blank');
      }
    }
    // Removing the iframe right away can cancel an in-progress print in
    // some browsers, so give the dialog a minute before cleaning up.
    setTimeout(() => iframe.remove(), 60000);
  };

  document.body.appendChild(iframe);
}
