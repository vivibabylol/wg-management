// Western Green LLC — Google Apps Script Backend v4
// Sheets: Shipments, Invoices, Deliveries, Tasks, Customers, Settings,
//         Production, RawMaterialLots, Employees, LeaveRequests, PTOBalances
//
// Deploy as Web App:
//   Execute as: Me
//   Who has access: Anyone
//
// After any change: Deploy → Manage deployments → Edit → New version → Deploy

const SHEET_HEADERS = {
  Shipments:  ['id','bolNum','carrier','customer','status','pol','pod','etd','eta','etaFinal',
                'disc','qty','sellPrice','mfgCost','freight','trucking','customs','isf','courier',
                'chassis','bankCharge','containers','dest','notes',
                'doc_debitNote','doc_arrivalNotice','doc_carrierFeePaid','doc_packingList',
                'doc_commercialInv','doc_entrySummary','doc_finalAddress','doc_inlandBOL',
                'doc_customerNotified','doc_forwarderInv','doc_forwarderPaid','doc_customerPaid',
                'ref_debitNote','ref_arrivalNotice','ref_entrySummary','ref_inlandBOL','ref_forwarderInv',
                'date_debitNote','date_arrivalNotice','date_entrySummary','date_inlandBOL',
                'date_forwarderInv','date_forwarderPaid','date_customerPaid'],
  Invoices:   ['id','num','date','billTo','item','qty','unit','unitPrice','status','paid','paidDate','containers','notes'],
  Deliveries: ['id','dist','business','addr','city','zip','contact','phone','status','delivDate','source','wraps','parts','bolNum','containerNum','delivItems','notes'],
  Production: ['id','date','batch','inputs','outputs','notes'],
  Tasks:      ['id','text','week','priority','notes','done'],
  Customers:  ['id','company','contact','type','phone','email','addr','city','zip','terms','status','notes'],
  Settings:   ['id','key','value'],
  RawMaterialLots: ['id','lotNum','material','unit','qty','source','supplier','dateReceived','notes'],
  Employees:       ['id','emp_num','name','role','pay_type','hourly_rate','annual_salary','phone','email','start_date','status','notes'],
  LeaveRequests:   ['id','employee_id','leave_type','start_date','end_date','days','approved_by','status','notes'],
  PTOBalances:     ['id','employee_id','year','pto_rollover_in','pto_cashout_amount'],
};

// Handle preflight OPTIONS request (required for CORS)
function doOptions(e) {
  return buildCorsResponse('');
}

function doGet(e) {
  try {
    const sheet = e.parameter.sheet;
    const data = getSheetData(sheet);
    return buildCorsResponse(JSON.stringify({ ok: true, data }));
  } catch(err) {
    return buildCorsResponse(JSON.stringify({ ok: false, error: err.message }));
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { sheet, action, record } = payload;
    if (action === 'save')   return buildCorsResponse(JSON.stringify({ ok: true, data: saveRecord(sheet, record) }));
    if (action === 'delete') return buildCorsResponse(JSON.stringify({ ok: true, data: deleteRecord(sheet, record.id) }));
    return buildCorsResponse(JSON.stringify({ ok: false, error: 'Unknown action' }));
  } catch(err) {
    return buildCorsResponse(JSON.stringify({ ok: false, error: err.message }));
  }
}

function buildCorsResponse(body) {
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(name);
  if (!ws) return [];
  const headers = SHEET_HEADERS[name];
  if (!headers) return [];
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return [];
  const rows = ws.getRange(1, 1, lastRow, headers.length).getValues();
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  }).filter(r => r.id && r.id !== '');
}

function saveRecord(name, record) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(name);
  if (!ws) throw new Error('Sheet not found: ' + name);
  const headers = SHEET_HEADERS[name];
  if (!headers) throw new Error('Unknown sheet: ' + name);

  // Write header row if sheet is empty
  if (ws.getLastRow() === 0) {
    ws.appendRow(headers);
  }

  const lastRow = ws.getLastRow();
  const ids = lastRow > 1
    ? ws.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]))
    : [];
  const idx = ids.indexOf(String(record.id));
  const rowData = headers.map(h => (record[h] === undefined ? '' : record[h]));

  if (idx === -1) {
    ws.appendRow(rowData);
  } else {
    ws.getRange(idx + 2, 1, 1, rowData.length).setValues([rowData]);
  }
  return record;
}

function deleteRecord(name, id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(name);
  if (!ws) return { id };
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return { id };
  const ids = ws.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
  const idx = ids.indexOf(String(id));
  if (idx !== -1) ws.deleteRow(idx + 2);
  return { id };
}
