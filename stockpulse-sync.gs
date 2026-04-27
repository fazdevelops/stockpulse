// ============================================================
// StockPulse Trade Journal Sync — Google Apps Script
// 
// Setup instructions:
// 1. Go to script.google.com → New project
// 2. Delete all existing code
// 3. Paste this entire script
// 4. Click Save (Ctrl+S)
// 5. Click Deploy → New deployment
// 6. Type: Web app
// 7. Execute as: Me
// 8. Who has access: Anyone
// 9. Click Deploy → Copy the web app URL
// 10. Paste that URL into StockPulse Settings → Sync URL
// ============================================================

const SHEET_NAME = 'TradeJournal';

// ── SECRET TOKEN ──────────────────────────────────────────
// Change this to any password you want.
// You must also paste the same value into StockPulse Settings → Sync Token.
const SECRET_TOKEN = 'Ahmed_Trades';
// ─────────────────────────────────────────────────────────

function checkAuth(token){
  return token === SECRET_TOKEN;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Create header row
    sheet.getRange(1, 1, 1, 16).setValues([[
      'ID', 'Ticker', 'Signal', 'Score', 'Entry Date', 'Entry Price',
      'Target', 'Stop Loss', 'Shares', 'Position Size', 'Risk Amount',
      'Current Price', 'Exit Date', 'Status', 'Return %', 'P&L ($)'
    ]]);
    // Format header
    sheet.getRange(1, 1, 1, 16)
      .setBackground('#0a0c0f')
      .setFontColor('#00d68f')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Set column widths
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 80);
    sheet.setColumnWidth(5, 100);
  }
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;
  const token  = e.parameter.token;

  // Allow ping without auth so user can test URL
  if (action === 'ping') {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', message: 'StockPulse sync connected!' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // All other actions require valid token
  if (!checkAuth(token)) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized — check your Sync Token in StockPulse Settings' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'read') {
    return readTrades();
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // Require valid token for all write operations
    if (!checkAuth(data.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'Unauthorized — check your Sync Token in StockPulse Settings' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'write') {
      return writeTrade(data.trade);
    } else if (action === 'update') {
      return updateTrade(data.trade);
    } else if (action === 'delete') {
      return deleteTrade(data.id);
    } else if (action === 'sync') {
      return syncAll(data.trades);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function readTrades() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ trades: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const trades = data.slice(1).map(row => ({
    id:           row[0],
    ticker:       row[1],
    signal:       row[2],
    score:        row[3],
    entryDate:    row[4],
    entryPrice:   row[5],
    target:       row[6],
    stopLoss:     row[7],
    shares:       row[8],
    posSize:      row[9],
    riskAmt:      row[10],
    currentPrice: row[11] || null,
    exitDate:     row[12] || null,
    status:       row[13] || 'open',
    returnPct:    row[14] || null,
    pnl:          row[15] || null,
  })).filter(t => t.id); // filter empty rows
  
  return ContentService
    .createTextOutput(JSON.stringify({ trades }))
    .setMimeType(ContentService.MimeType.JSON);
}

function writeTrade(trade) {
  const sheet = getOrCreateSheet();
  sheet.appendRow([
    trade.id,
    trade.ticker,
    trade.signal,
    trade.score,
    trade.entryDate,
    trade.entryPrice,
    trade.target,
    trade.stopLoss,
    trade.shares,
    trade.posSize,
    trade.riskAmt,
    trade.currentPrice || '',
    trade.exitDate || '',
    trade.status || 'open',
    trade.returnPct || '',
    trade.pnl || '',
  ]);
  
  // Color code by signal
  const lastRow = sheet.getLastRow();
  const signalColor = trade.signal === 'Buy' ? '#1a3a2a' : 
                      trade.signal === 'Sell' ? '#3a1a1a' : '#2a2a1a';
  sheet.getRange(lastRow, 1, 1, 16).setBackground(signalColor);
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, id: trade.id }))
    .setMimeType(ContentService.MimeType.JSON);
}

function updateTrade(trade) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(trade.id)) {
      const row = i + 1;
      sheet.getRange(row, 12).setValue(trade.currentPrice || '');
      sheet.getRange(row, 13).setValue(trade.exitDate || '');
      sheet.getRange(row, 14).setValue(trade.status || 'open');
      sheet.getRange(row, 15).setValue(trade.returnPct || '');
      sheet.getRange(row, 16).setValue(trade.pnl || '');
      
      // Update row color based on outcome
      const bgColor = trade.status === 'win' ? '#1a3a2a' :
                      trade.status === 'stopped' ? '#3a2a1a' :
                      trade.returnPct < 0 ? '#3a1a1a' : '#1a2a3a';
      sheet.getRange(row, 1, 1, 16).setBackground(bgColor);
      
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Trade not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function deleteTrade(id) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Trade not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function syncAll(trades) {
  // Full sync — replace all data with provided trades array
  const sheet = getOrCreateSheet();
  // Keep header, delete all data rows
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  // Write all trades fresh
  trades.forEach(trade => writeTrade(trade));
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, count: trades.length }))
    .setMimeType(ContentService.MimeType.JSON);
}
