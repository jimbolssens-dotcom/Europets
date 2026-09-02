// lib/printPdf.js
// Client-side only. Browsers don't expose a way to silently print without
// the person at the keyboard confirming a dialog — letting any website
// print unprompted to whatever printer is set up would be a serious
// security hole — so this is the closest a web app gets to "print
// immediately": load the PDF invisibly and trigger the native print dialog
// itself the moment it's ready, so all staff do is hit Print/confirm.
export function printPdfUrl(url) {
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
      // Some browsers refuse to print from within an iframe — fall back to
      // a normal tab so staff can still print it themselves from there.
      window.open(url, '_blank');
    }
    // Removing the iframe right away can cancel an in-progress print in
    // some browsers, so give the dialog a minute before cleaning up.
    setTimeout(() => iframe.remove(), 60000);
  };

  document.body.appendChild(iframe);
}
