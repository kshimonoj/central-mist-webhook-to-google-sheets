// ============================================================
// HPE Aruba Networking Central (New) / Central (Classic) / HPE Mist
// Webhook -> Google Sheets Logger
//
// Deploy this as a *container-bound* Apps Script project
// (Google Sheet -> Extensions -> Apps Script).
// Routing is done with the ?source= query parameter:
//   ?source=central          -> New Central     -> CentralLog
//   ?source=central-classic  -> Classic Central -> ClassicCentralLog
//   ?source=mist             -> Mist            -> MistLog
// ============================================================
const SHEET_NAME = "CentralLog";                 // New Central
const CLASSIC_SHEET_NAME = "ClassicCentralLog";  // Classic Central
const MIST_SHEET_NAME = "MistLog";               // Mist

// ============================================================
// doPost: route by ?source= (explicit only - there is no default
// fallback, so that an unknown sender can never be misclassified)
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const source = e.parameter.source || "";

    if (source === "mist") {
      appendMistEventToSheet(payload);
    } else if (source === "central-classic") {
      appendClassicCentralAlertToSheet(payload);
    } else if (source === "central") {
      appendAlertToSheet(payload);
    } else {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let debugSheet = ss.getSheetByName("Debug");
      if (!debugSheet) debugSheet = ss.insertSheet("Debug");
      const receivedAt = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
      debugSheet.appendRow([receivedAt, "unknown source: " + source, JSON.stringify(payload)]);
    }

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

// ============================================================
// doGet: health check when opened in a browser
// ============================================================
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "alive",
      message: "Central (New/Classic) / Mist Webhook receiver is running.",
      sheets: [SHEET_NAME, CLASSIC_SHEET_NAME, MIST_SHEET_NAME]
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// New Central: appendAlertToSheet
// ============================================================
function appendAlertToSheet(alert) {
  if (!alert || (!alert.id && !alert.alertId)) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let debugSheet = ss.getSheetByName("Debug");
    if (!debugSheet) debugSheet = ss.insertSheet("Debug");
    const receivedAt = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    debugSheet.appendRow([receivedAt, JSON.stringify(alert)]);
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) writeHeader(sheet);

  const receivedAt = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

  let alertTime = "";
  if (alert.time) {
    try {
      alertTime = Utilities.formatDate(new Date(alert.time), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    } catch (e) {
      alertTime = alert.time;
    }
  }

  const deviceSerials = (alert.impactedEntities && alert.impactedEntities.deviceSerial)
    ? alert.impactedEntities.deviceSerial.join(", ") : "";
  const clientMacs = (alert.impactedEntities && alert.impactedEntities.clientMac)
    ? alert.impactedEntities.clientMac.join(", ") : "";

  let hostnames = "";
  if (alert.additionalDetails && Array.isArray(alert.additionalDetails)) {
    hostnames = alert.additionalDetails
      .map(function(d) { return d.hostname || ""; })
      .filter(function(h) { return h !== ""; })
      .join(", ");
  }

  const additionalDetails = alert.additionalDetails ? JSON.stringify(alert.additionalDetails) : "";

  const row = [
    receivedAt, alertTime, alert.id || "", alert.alertId || "",
    alert.name || "", alert.category || "", alert.deviceType || "",
    alert.severity || "", alert.state || "", alert.operation || "",
    // siteId can be a 17-digit number. Prefix it with an apostrophe so that
    // Sheets stores it as text - otherwise it is parsed as a number and gets
    // rounded at the IEEE 754 precision limit.
    alert.siteId ? "'" + alert.siteId : "", alert.configScope || "", alert.tenantId || "",
    alert.tenantName || "", alert.summary || "", alert.notes || "",
    deviceSerials, clientMacs, hostnames, additionalDetails
  ];

  sheet.appendRow(row);
  colorRowBySeverity(sheet, sheet.getLastRow(), alert.severity, alert.state);
}

function writeHeader(sheet) {
  const headers = [
    "Received At (JST)", "Alert Time (JST)", "Webhook Event ID", "Alert ID",
    "Alert Name", "Category", "Device Type", "Severity", "State", "Operation",
    "Site ID", "Config Scope", "Tenant ID", "Tenant Name", "Summary", "Notes",
    "Impacted Device Serials", "Impacted Client MACs", "Hostnames", "Additional Details (JSON)"
  ];
  const range = sheet.getRange(1, 1, 1, headers.length);
  range.setValues([headers]);
  range.setFontWeight("bold");
  range.setBackground("#1a73e8");
  range.setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  const widths = [160,160,280,280,180,100,130,90,90,80,150,110,280,130,400,150,200,200,180,300];
  widths.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
}

function colorRowBySeverity(sheet, rowNum, severity, state) {
  const numCols = 20;
  if (state === "Cleared") {
    sheet.getRange(rowNum, 1, 1, numCols).setBackground("#e0e0e0");
    return;
  }
  if (state === "Deferred") {
    sheet.getRange(rowNum, 1, 1, numCols).setBackground("#ede7f6");
    return;
  }
  const colorMap = { "Critical": "#fce8e6", "Major": "#fef3cd", "Minor": "#fff9c4", "Info": "#e8f5e9" };
  sheet.getRange(rowNum, 1, 1, numCols).setBackground(colorMap[severity] || "#ffffff");
}

function testWithDummyData() {
  const testCases = [
    { id: "aaa-111", alertId: "alert-001", tenantId: "tenant-abc", tenantName: null,
      name: "AP Rebooted", category: "System", deviceType: "Access Point", severity: "Critical",
      time: new Date().toISOString(), operation: "Add", state: "Active", siteId: "site-001",
      configScope: "Global", summary: "Access Point test-ap-01 rebooted due to: AP Reboot issued via CLI",
      notes: null, impactedEntities: { deviceSerial: ["VNQ7KZD4JB"], clientMac: [] },
      additionalDetails: [{ deviceSerial: "VNQ7KZD4JB", hostname: "test-ap-01", rebootReason: "AP Reboot issued via CLI" }] }
  ];
  testCases.forEach(function(alert) { appendAlertToSheet(alert); });
  Logger.log("New Central test data written. Please check the " + SHEET_NAME + " sheet.");
}

// ============================================================
// Classic Central: appendClassicCentralAlertToSheet
// Payload shape: id, nid, alert_type, setting_id, device_id, description,
//   state, severity, operation, timestamp (unix seconds), details{...},
//   webhook, text
// Reference: https://developer.arubanetworks.com/central/docs/ap-alerts
// ============================================================
function appendClassicCentralAlertToSheet(alert) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CLASSIC_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CLASSIC_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    const headers = [
      "Received At (JST)", "Alert Time (JST)", "ID", "NID", "Alert Type",
      "Setting ID", "Device ID", "State", "Severity", "Operation",
      "Description", "Text", "Webhook ID", "Details (JSON)"
    ];
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight("bold");
    range.setBackground("#ea8600"); // different colour from New Central (blue) for quick visual distinction
    range.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
    const widths = [160,160,220,80,220,220,150,90,90,100,400,400,220,300];
    widths.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  }

  const receivedAt = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

  let alertTime = "";
  if (alert.timestamp) {
    try {
      alertTime = Utilities.formatDate(new Date(alert.timestamp * 1000), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    } catch (e) {
      alertTime = String(alert.timestamp);
    }
  }

  const row = [
    receivedAt, alertTime, alert.id || "", alert.nid || "", alert.alert_type || "",
    alert.setting_id || "", alert.device_id || "", alert.state || "",
    alert.severity || "", alert.operation || "", alert.description || "",
    alert.text || "", alert.webhook || "",
    alert.details ? JSON.stringify(alert.details) : ""
  ];

  sheet.appendRow(row);
  colorClassicRowBySeverity(sheet, sheet.getLastRow(), alert.severity, alert.state);
}

function colorClassicRowBySeverity(sheet, rowNum, severity, state) {
  const numCols = 14;
  if (state === "Closed") {
    sheet.getRange(rowNum, 1, 1, numCols).setBackground("#e0e0e0");
    return;
  }
  const colorMap = { "Critical": "#fce8e6", "Major": "#fef3cd", "Minor": "#fff9c4" };
  sheet.getRange(rowNum, 1, 1, numCols).setBackground(colorMap[severity] || "#ffffff");
}

function testClassicCentralWithDummyData() {
  appendClassicCentralAlertToSheet({
    id: "AXasdghjwq123wiJ43hVq",
    nid: 4,
    alert_type: "AP disconnected",
    setting_id: "e1234567xxxyyyzbcccddddfff8140d8-4",
    device_id: "DZ0001581",
    description: "AP f0:5c:19:c9:f7:6a with MAC address f0:5c:19:c9:f7:6a disconnected, Group:unprovisioned",
    state: "Open",
    severity: "Major",
    operation: "create",
    timestamp: Math.floor(Date.now() / 1000),
    details: { serial: "DZ0001581", conn_status: "disconnected", group_name: "unprovisioned" },
    webhook: "14aasddb-0ee1-23ew-76yg-lkj50xxzzba",
    text: "AP f0:5c:19:c9:f7:6a with MAC address f0:5c:19:c9:f7:6a disconnected, Group:unprovisioned"
  });
  Logger.log("Classic Central test data written. Please check the " + CLASSIC_SHEET_NAME + " sheet.");
}

// ============================================================
// Mist: appendMistEventToSheet
// Each event inside the events[] array becomes one row. Key sets differ
// per topic, so only the commonly available fields are mapped to columns;
// anything missing is left blank. The full event is kept in the Raw JSON
// column.
// ============================================================
function appendMistEventToSheet(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MIST_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(MIST_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    const headers = [
      "Received At (JST)", "Event Time (JST)", "Topic", "Org ID", "Site ID",
      "Device MAC", "Device/AP Name", "Type/Reason", "Severity", "Message", "Raw JSON"
    ];
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight("bold");
    range.setBackground("#1a73e8");
    range.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
    const widths = [160,160,160,280,280,140,180,160,90,400,500];
    widths.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  }

  const receivedAt = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  const topic = payload.topic || "unknown";
  const events = Array.isArray(payload.events) ? payload.events : [payload];

  events.forEach(function(ev) {
    const orgId = ev.org_id || payload.org_id || "";
    const siteId = ev.site_id || payload.site_id || "";
    const deviceMac = ev.device_mac || "";
    const deviceName = ev.ap_name || ev.device_name || ev.hostname || "";
    const typeReason = ev.type || ev.reason || ev.test_type || ev.probe_type || "";
    const severity = ev.severity || "";
    const message = ev.message || ev.description || ev.reason || "";

    let eventTime = "";
    if (ev.timestamp) {
      try {
        eventTime = Utilities.formatDate(new Date(ev.timestamp * 1000), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
      } catch (e) {
        eventTime = String(ev.timestamp);
      }
    }

    sheet.appendRow([
      receivedAt, eventTime, topic, orgId, siteId,
      deviceMac, deviceName, typeReason, severity, message,
      JSON.stringify(ev)
    ]);
  });
}

function testMistWithDummyData() {
  appendMistEventToSheet({
    topic: "alarms",
    events: [{
      org_id: "test-org-id",
      site_id: "test-site-id",
      device_mac: "aabbccddeeff",
      ap_name: "test-ap-01",
      type: "arp_failure",
      severity: "warn",
      reason: "ARP resolution failed for gateway",
      timestamp: Math.floor(Date.now() / 1000)
    }]
  });
  Logger.log("Mist test data written. Please check the MistLog sheet.");
}
