// Western Green LLC — Google Apps Script Backend v5
// Sheets: Shipments, Invoices, Deliveries, Tasks, Customers, Settings,
//         Production, RawMaterialLots, Employees, LeaveRequests, PTOBalances
//
// Deploy as Web App:
//   Execute as: Me
//   Who has access: Anyone
//
// After any change: Deploy → Manage deployments → Edit → New version → Deploy

const MANAGERS = ['viv.collins28@gmail.com', 'lxs891230@gmail.com'];

const SHEET_HEADERS = {
  Shipments:  ['id','bolNum','carrier','customer','status','pol','pod','etd','eta','etaFinal',
                'disc','qty','sellPrice','mfgCost','freight','trucking','customs','isf','courier',
                'chassis','bankCharge','carrierFee','containers','dest','notes',
                'doc_debitNote','doc_arrivalNotice','doc_carrierFeePaid','doc_packingList',
                'doc_commercialInv','doc_entrySummary','doc_finalAddress','doc_inlandBOL',
                'doc_customerNotified','doc_forwarderInv','doc_forwarderPaid','doc_customerPaid',
                'ref_debitNote','ref_arrivalNotice','ref_entrySummary','ref_inlandBOL','ref_forwarderInv',
                'ref_packingList','ref_commercialInv',
                'date_debitNote','date_arrivalNotice','date_carrierFeePaid','date_entrySummary','date_inlandBOL',
                'date_forwarderInv','date_forwarderPaid','date_customerPaid',
                'doc_customsPaid','date_customsPaid'],
  Invoices:   ['id','num','date','billTo','item','qty','unit','unitPrice','status','paid','paidDate','containers','notes'],
  Deliveries: ['id','dist','business','addr','city','zip','contact','phone','status','delivDate','inlandFreight','source','wraps','parts','bolNum','containerNum','delivItems','notes'],
  Production: ['id','date','batch','inputs','outputs','notes'],
  Tasks:      ['id','text','week','priority','notes','done'],
  Customers:  ['id','company','contact','type','phone','email','addr','city','zip','terms','status','notes'],
  Settings:   ['id','key','value'],
  RawMaterialLots: ['id','lotNum','material','unit','qty','source','supplier','dateReceived','notes'],
  Employees:       ['id','emp_num','name','preferred_name','role','pay_type','hourly_rate','annual_salary','phone','email','start_date','status','notes','pto_exempt'],
  LeaveRequests:   ['id','employee_id','leave_type','start_date','end_date','days','approved_by','status','notes','token','emp_name','emp_num','emp_email'],
  PTOBalances:     ['id','employee_id','year','pto_rollover_in','pto_cashout_amount'],
  Inventory_Adj:   ['id','date','material','qty','reason','by'],
};

// ── Routing ──────────────────────────────────────────────

function doOptions(e) {
  return buildCorsResponse('');
}

function doGet(e) {
  // Manager approve / deny clicks from email
  if (e.parameter.action === 'approve' || e.parameter.action === 'deny') {
    return handleLeaveAction(e);
  }
  // Normal data fetch
  try {
    const sheetName = e.parameter.sheet;
    if (sheetName === 'ALL') {
      const all = {};
      Object.keys(SHEET_HEADERS).forEach(function(name) {
        all[name] = getSheetData(name);
      });
      return buildCorsResponse(JSON.stringify({ ok: true, data: all }));
    }
    const data = getSheetData(sheetName);
    return buildCorsResponse(JSON.stringify({ ok: true, data }));
  } catch(err) {
    return buildCorsResponse(JSON.stringify({ ok: false, error: err.message }));
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { action, sheet, record } = payload;
    if (action === 'submitLeave') return buildCorsResponse(JSON.stringify(submitLeave(record)));
    if (action === 'save')        return buildCorsResponse(JSON.stringify({ ok: true, data: saveRecord(sheet, record) }));
    if (action === 'delete')      return buildCorsResponse(JSON.stringify({ ok: true, data: deleteRecord(sheet, record.id) }));
    return buildCorsResponse(JSON.stringify({ ok: false, error: 'Unknown action' }));
  } catch(err) {
    return buildCorsResponse(JSON.stringify({ ok: false, error: err.message }));
  }
}

// ── Leave request submission (from employee form) ────────

function submitLeave(record) {
  // Attach a unique token for approve/deny links
  record.token  = Utilities.getUuid();
  record.status = 'Pending';

  saveRecord('LeaveRequests', record);

  const scriptUrl  = ScriptApp.getService().getUrl();
  const approveUrl = scriptUrl + '?action=approve&token=' + record.token;
  const denyUrl    = scriptUrl + '?action=deny&token='    + record.token;

  const empName  = record.emp_name  || record.emp_num || 'Employee';
  const subject  = 'Leave Request: ' + empName + ' — ' + record.leave_type + ' (' + record.days + ' days)';

  const htmlBody =
    '<div style="font-family:sans-serif;max-width:520px;color:#1a202c">' +
    '<div style="background:#1e3a5f;padding:18px 24px;border-radius:10px 10px 0 0">' +
    '<span style="font-family:sans-serif;font-size:1.1rem;font-weight:800;color:#fff">WG <span style="color:#93c5fd;font-weight:400">LLC</span></span>' +
    '</div>' +
    '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:24px">' +
    '<h2 style="margin:0 0 16px;font-size:1.1rem;color:#1e3a5f">New Leave Request</h2>' +
    '<table style="border-collapse:collapse;width:100%;font-size:0.9rem">' +
    '<tr><td style="padding:8px 12px;color:#718096;width:120px">Employee</td>' +
    '<td style="padding:8px 12px;font-weight:600">' + empName + ' (' + (record.emp_num||'') + ')</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#718096">Leave Type</td>' +
    '<td style="padding:8px 12px">' + record.leave_type + '</td></tr>' +
    '<tr><td style="padding:8px 12px;color:#718096">Dates</td>' +
    '<td style="padding:8px 12px">' + record.start_date + (record.end_date && record.end_date !== record.start_date ? ' → ' + record.end_date : '') + '</td></tr>' +
    '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#718096">Days</td>' +
    '<td style="padding:8px 12px">' + record.days + '</td></tr>' +
    (record.notes ? '<tr><td style="padding:8px 12px;color:#718096">Reason</td><td style="padding:8px 12px">' + record.notes + '</td></tr>' : '') +
    '</table>' +
    '<div style="margin-top:24px">' +
    '<a href="' + approveUrl + '" style="display:inline-block;background:#276749;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.95rem;margin-right:12px">✅ Approve</a>' +
    '<a href="' + denyUrl    + '" style="display:inline-block;background:#c53030;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.95rem">❌ Deny</a>' +
    '</div>' +
    '<p style="margin-top:20px;font-size:0.75rem;color:#a0aec0">Western Green LLC — Operations System</p>' +
    '</div></div>';

  MANAGERS.forEach(function(mgr) {
    MailApp.sendEmail({ to: mgr, subject: subject, htmlBody: htmlBody });
  });

  return { ok: true };
}

// ── Manager approve / deny (clicked from email link) ─────

function handleLeaveAction(e) {
  const action = e.parameter.action; // 'approve' or 'deny'
  const token  = e.parameter.token;

  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const ws      = ss.getSheetByName('LeaveRequests');
    const headers = SHEET_HEADERS['LeaveRequests'];
    const tokenIdx  = headers.indexOf('token');
    const statusIdx = headers.indexOf('status');
    const lastRow   = ws.getLastRow();

    if (!ws || lastRow <= 1) return pageResult('error', 'Request not found.');

    const rows   = ws.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const rowIdx = rows.findIndex(function(r) { return String(r[tokenIdx]) === String(token); });
    if (rowIdx === -1) return pageResult('error', 'Request not found or link already used.');

    const row           = rows[rowIdx];
    const currentStatus = String(row[statusIdx]);
    if (currentStatus !== 'Pending') {
      return pageResult('done', 'This request has already been <strong>' + currentStatus + '</strong>.');
    }

    // Update status and approved_by in sheet
    const newStatus      = action === 'approve' ? 'Approved' : 'Denied';
    const approvedByIdx  = headers.indexOf('approved_by');
    const managerEmail   = Session.getActiveUser().getEmail();
    ws.getRange(rowIdx + 2, statusIdx + 1).setValue(newStatus);
    if (approvedByIdx !== -1) ws.getRange(rowIdx + 2, approvedByIdx + 1).setValue(managerEmail);

    // Build record object
    const record = {};
    headers.forEach(function(h, i) { record[h] = row[i]; });

    // Notify employee
    const empEmail = record.emp_email;
    const empName  = record.emp_name || record.emp_num || 'Employee';
    if (empEmail) {
      const color   = newStatus === 'Approved' ? '#276749' : '#c53030';
      const icon    = newStatus === 'Approved' ? '✅' : '❌';
      const subject = 'Leave Request ' + newStatus + ' — ' + record.leave_type;
      const body =
        '<div style="font-family:sans-serif;max-width:480px;color:#1a202c">' +
        '<div style="background:#1e3a5f;padding:18px 24px;border-radius:10px 10px 0 0">' +
        '<span style="font-size:1.1rem;font-weight:800;color:#fff">WG <span style="color:#93c5fd;font-weight:400">LLC</span></span>' +
        '</div>' +
        '<div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:28px;text-align:center">' +
        '<div style="font-size:2.5rem;margin-bottom:12px">' + icon + '</div>' +
        '<h2 style="color:' + color + ';margin:0 0 8px">' + newStatus + '</h2>' +
        '<p style="color:#718096;margin:0 0 16px">Hi ' + empName + ', your leave request has been ' + newStatus.toLowerCase() + '.</p>' +
        '<table style="border-collapse:collapse;width:100%;font-size:0.85rem;text-align:left">' +
        '<tr><td style="padding:6px 10px;color:#718096">Leave Type</td><td style="padding:6px 10px">' + record.leave_type + '</td></tr>' +
        '<tr style="background:#f8fafc"><td style="padding:6px 10px;color:#718096">Dates</td><td style="padding:6px 10px">' + record.start_date + (record.end_date && record.end_date !== record.start_date ? ' → ' + record.end_date : '') + '</td></tr>' +
        '<tr><td style="padding:6px 10px;color:#718096">Days</td><td style="padding:6px 10px">' + record.days + '</td></tr>' +
        '</table>' +
        '<p style="margin-top:20px;font-size:0.75rem;color:#a0aec0">Western Green LLC</p>' +
        '</div></div>';
      MailApp.sendEmail({ to: empEmail, subject: subject, htmlBody: body });
    }

    const empInfo = empName + ' — ' + record.leave_type + ' (' + record.days + ' days, ' + record.start_date + ')';
    return pageResult(action, empInfo + (empEmail ? '<br><small style="color:#a0aec0">Notification sent to ' + empEmail + '</small>' : ''));

  } catch(err) {
    return pageResult('error', err.message);
  }
}

function pageResult(type, detail) {
  const configs = {
    approve: { icon: '✅', title: 'Approved',     color: '#276749' },
    deny:    { icon: '❌', title: 'Denied',       color: '#c53030' },
    done:    { icon: 'ℹ️', title: 'Already processed', color: '#718096' },
    error:   { icon: '⚠️', title: 'Error',        color: '#b7791f' },
  };
  const c = configs[type] || configs.error;
  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:sans-serif;background:#f0f4f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}' +
    '.box{background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.1)}' +
    '.icon{font-size:3rem;margin-bottom:14px}.title{color:' + c.color + ';font-size:1.3rem;font-weight:700;margin-bottom:10px}' +
    '.detail{color:#718096;font-size:0.88rem;line-height:1.6}</style></head>' +
    '<body><div class="box">' +
    '<div class="logo" style="font-weight:800;color:#1e3a5f;margin-bottom:20px">WG <span style="color:#93c5fd;font-weight:400">LLC</span></div>' +
    '<div class="icon">' + c.icon + '</div>' +
    '<div class="title">' + c.title + '</div>' +
    '<div class="detail">' + detail + '</div>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html);
}

// ── Core data functions ───────────────────────────────────

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
  const lastRow  = ws.getLastRow();
  if (lastRow <= 1) return [];
  const sheetCols = ws.getLastColumn();
  const readCols  = Math.min(headers.length, sheetCols);
  const rows = ws.getRange(1, 1, lastRow, readCols).getValues();
  return rows.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = (i < readCols && row[i] !== undefined) ? row[i] : ''; });
    return obj;
  }).filter(function(r) { return r.id && r.id !== ''; });
}

function saveRecord(name, record) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(name);
  if (!ws) throw new Error('Sheet not found: ' + name);
  const headers = SHEET_HEADERS[name];
  if (!headers) throw new Error('Unknown sheet: ' + name);

  if (ws.getLastRow() === 0) {
    ws.appendRow(headers);
  }

  const lastRow = ws.getLastRow();
  const ids = lastRow > 1
    ? ws.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]); })
    : [];
  const idx     = ids.indexOf(String(record.id));
  const rowData = headers.map(function(h) { return record[h] === undefined ? '' : record[h]; });

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
  const ids = ws.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]); });
  const idx = ids.indexOf(String(id));
  if (idx !== -1) ws.deleteRow(idx + 2);
  return { id };
}
