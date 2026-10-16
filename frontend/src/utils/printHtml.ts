export function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  const run = () => {
    const w = iframe.contentWindow!;
    w.onafterprint = () => setTimeout(() => iframe.remove(), 500);
    w.focus();
    w.print();
  };

  Promise.all(
    Array.from(doc.images).map(img =>
      img.complete ? null : new Promise(res => { img.onload = img.onerror = () => res(null); })
    )
  ).then(() => setTimeout(run, 100));
}