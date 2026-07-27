// ============================================================
// HPE GreenLake Platform (GLP)
// Webhook -> Google Sheets Logger
//
// Deploy this as a *standalone* Apps Script project (script.new) and
// point it at the same spreadsheet with openById().
// GLP rejects destination URLs that contain query parameters, and an
// Apps Script web app stops honouring "Anyone" access once you append a
// path segment after /exec - so GLP needs its own project with a bare
// /exec URL.
// ============================================================
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID";
const GLP_SHEET_NAME = "GlpLog";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    appendGlpEventToSheet(payload);
    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("doPost Error: " + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "alive", message: "GLP Webhook receiver is running." }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Payload is CloudEvents format:
//   specversion, type, source, id, time, datacontenttype, data{...}
// Batched delivery may arrive as an array, so handle both.
function appendGlpEventToSheet(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(GLP_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(GLP_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    const headers = ["Received At (JST)", "Event Time (JST)", "Type", "Source", "Event ID", "Data (JSON)"];
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight("bold");
    range.setBackground("#01a982"); // HPE GreenLake green, distinct from the other three sheets
    range.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
    const widths = [160,160,280,240,280,600];
    widths.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  }

  const receivedAt = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  const events = Array.isArray(payload) ? payload : [payload];

  events.forEach(function(ev) {
    let eventTime = "";
    if (ev.time) {
      try {
        eventTime = Utilities.formatDate(new Date(ev.time), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
      } catch (e) {
        eventTime = String(ev.time);
      }
    }
    sheet.appendRow([
      receivedAt, eventTime, ev.type || "", ev.source || "", ev.id || "",
      ev.data ? JSON.stringify(ev.data) : JSON.stringify(ev)
    ]);
  });
}

function testGlpWithDummyData() {
  appendGlpEventToSheet({
    specversion: "1.0",
    type: "com.hpe.greenlake.audit-log.v1.logs.created",
    source: "//us1.api.greenlake.hpe.com/audit-log",
    id: "e8fc75c1-9ad5-432d-a858-499d9f279647",
    time: new Date().toISOString(),
    data: { message: "Test audit log event" }
  });
  Logger.log("GLP test data written. Please check the GlpLog sheet.");
}
