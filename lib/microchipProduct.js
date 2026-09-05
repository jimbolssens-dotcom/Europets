// lib/microchipProduct.js
// A product whose catalog name mentions "microchip" (e.g. "Microchip
// Implantation") is treated specially wherever it's added to a consult's
// treatment plan or an invoice: staff get prompted for the chip number and
// implantation date right then, instead of having to remember to go update
// the patient file separately afterward.

export function isMicrochipProduct(name) {
  return /microchip/i.test(name || '');
}
