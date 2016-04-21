/**
 * This file is reused from the Shields.IO source:
 * https://github.com/badges/shields
 * The source for that project is released under the CC0 license.
 */
var path = require('path');
var fs = require('fs');
var PDFDocument = require('pdfkit');

var doc = (new PDFDocument({size:'A4', layout:'landscape'}));
try {
  doc = doc.font(path.join(__dirname, 'Verdana.ttf'));
} catch (ex) {
  doc = doc.font('Helvetica-Bold');
  console.warn('Could not load font file "Verdana.ttf", text widths will therefore be approximate', ex);
}
doc = doc.fontSize(11);

function measure(str) {
    return doc.widthOfString(str);
}
module.exports = measure;
