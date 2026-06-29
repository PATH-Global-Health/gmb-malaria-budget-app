/* Styled Excel export with no library (offline / file:// friendly).
   Produces SpreadsheetML 2003 (.xls) which Excel opens with full formatting:
   bold coloured headers, number formats, column widths, multiple sheets.
   A "sheet" = { name, title?, meta?:[[label,value]], columns:[{label,width,fmt}], rows:[[...]], totalRow? }
   fmt: "text" (default) | "int" | "money" | "num1". */
window.GMB = window.GMB || {};
GMB.xlsx = GMB.xlsx || {};

(function (X) {
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function isNum(fmt) { return fmt === "int" || fmt === "money" || fmt === "num1"; }

  function styles() {
    return '<Styles>' +
      '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1F2933"/></Style>' +
      '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="15" ss:Color="#081566"/></Style>' +
      '<Style ss:ID="meta"><Font ss:Italic="1" ss:Color="#5B6B7B"/></Style>' +
      '<Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0C1C8C" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0C1C8C"/></Borders></Style>' +
      '<Style ss:ID="cell"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E3E8EF"/></Borders></Style>' +
      '<Style ss:ID="int"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E3E8EF"/></Borders></Style>' +
      '<Style ss:ID="money"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E3E8EF"/></Borders></Style>' +
      '<Style ss:ID="num1"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0.0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E3E8EF"/></Borders></Style>' +
      '<Style ss:ID="total"><Font ss:Bold="1"/><Interior ss:Color="#EEF1F5" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1.5" ss:Color="#0C1C8C"/></Borders></Style>' +
      '<Style ss:ID="totalText"><Font ss:Bold="1"/><Interior ss:Color="#EEF1F5" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1.5" ss:Color="#0C1C8C"/></Borders></Style>' +
      '<Style ss:ID="parT"><Font ss:Bold="1" ss:Color="#1F2933"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E3E8EF"/></Borders></Style>' +
      '<Style ss:ID="parN"><Font ss:Bold="1" ss:Color="#1F2933"/><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E3E8EF"/></Borders></Style>' +
      '<Style ss:ID="chT"><Font ss:Color="#5B6B7B"/></Style>' +
      '<Style ss:ID="chN"><Font ss:Color="#5B6B7B"/><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0"/></Style>' +
      '<Style ss:ID="subT"><Font ss:Bold="1" ss:Color="#081566"/><Interior ss:Color="#DCE6FA" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0C1C8C"/></Borders></Style>' +
      '<Style ss:ID="subN"><Font ss:Bold="1" ss:Color="#081566"/><Interior ss:Color="#DCE6FA" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="#,##0"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0C1C8C"/></Borders></Style>' +
      '</Styles>';
  }

  function styleId(kind, fmt) {
    var num = isNum(fmt);
    if (kind === "parent") return num ? "parN" : "parT";
    if (kind === "sub") return num ? "subN" : "subT";
    if (kind === "child") return num ? "chN" : "chT";
    if (kind === "total") return num ? "total" : "totalText";
    return num ? fmt : "cell";
  }
  function cell(v, fmt, kind) {
    var num = isNum(fmt) && v !== "" && v != null && !isNaN(v);
    var sid = styleId(kind || "data", fmt);
    if (num) return '<Cell ss:StyleID="' + sid + '"><Data ss:Type="Number">' + v + '</Data></Cell>';
    return '<Cell ss:StyleID="' + sid + '"><Data ss:Type="String">' + esc(v) + '</Data></Cell>';
  }

  X.build = function (sheets) {
    var xml = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">' + styles();
    (sheets || []).forEach(function (sh) {
      var cols = sh.columns || [], nc = cols.length;
      var headerRow = 1 + (sh.title ? 1 : 0) + ((sh.meta || []).length) + (sh.title || (sh.meta && sh.meta.length) ? 1 : 0);
      xml += '<Worksheet ss:Name="' + esc((sh.name || "Sheet").replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31)) + '"><Table>';
      cols.forEach(function (c) { xml += '<Column ss:Width="' + (c.width || 90) + '"/>'; });
      if (sh.title) xml += '<Row ss:Height="22"><Cell ss:StyleID="title"' + (nc > 1 ? ' ss:MergeAcross="' + (nc - 1) + '"' : '') + '><Data ss:Type="String">' + esc(sh.title) + '</Data></Cell></Row>';
      (sh.meta || []).forEach(function (m) {
        xml += '<Row><Cell ss:StyleID="meta"><Data ss:Type="String">' + esc(m[0]) + '</Data></Cell>';
        xml += '<Cell ss:StyleID="meta"' + (nc > 2 ? ' ss:MergeAcross="' + (nc - 2) + '"' : '') + '><Data ss:Type="String">' + esc(m[1]) + '</Data></Cell></Row>';
      });
      if (sh.title || (sh.meta && sh.meta.length)) xml += '<Row/>';
      xml += '<Row>' + cols.map(function (c) { return '<Cell ss:StyleID="hdr"><Data ss:Type="String">' + esc(c.label) + '</Data></Cell>'; }).join('') + '</Row>';
      (sh.rows || []).forEach(function (r) {
        var kind = (r && r.kind) || "data", cells = (r && r.cells) ? r.cells : r;
        xml += '<Row>' + cells.map(function (v, i) { return cell(v, cols[i] && cols[i].fmt, kind); }).join('') + '</Row>';
      });
      if (sh.totalRow) xml += '<Row>' + sh.totalRow.map(function (v, i) { return cell(v, cols[i] && cols[i].fmt, "total"); }).join('') + '</Row>';
      xml += '</Table>';
      xml += '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>' + headerRow + '</SplitHorizontal><TopRowBottomPane>' + (headerRow + 1) + '</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>';
      if (nc > 0) xml += '<AutoFilter x:Range="R' + headerRow + 'C1:R' + Math.max(headerRow, headerRow + (sh.rows || []).length + (sh.totalRow ? 1 : 0)) + 'C' + nc + '" xmlns="urn:schemas-microsoft-com:office:excel"/>';
      xml += '</Worksheet>';
    });
    return xml + '</Workbook>';
  };

  /** Download a styled multi-sheet Excel file. */
  X.download = function (filename, sheets) {
    var name = String(filename || "export").replace(/\.(csv|xlsx?|json)$/i, "") + ".xls";
    GMB.util.downloadText(name, X.build(sheets), "application/vnd.ms-excel");
  };
})(GMB.xlsx);
