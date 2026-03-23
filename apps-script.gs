// ============================================================
// GOOGLE APPS SCRIPT – RSVP System Kamila & Piotr
// ============================================================
// INSTRUKCJA:
// 1. Idź na https://script.google.com → Nowy projekt
// 2. Wklej ten kod
// 3. Zmień SPREADSHEET_ID na ID swojego arkusza Google Sheets
// 4. Kliknij Wdróż → Nowe wdrożenie → Aplikacja webowa
//    - Wykonaj jako: Ja
//    - Kto ma dostęp: Wszyscy
// 5. Skopiuj URL i wklej do index.html oraz admin.html
// ============================================================

const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
const SHEET_GROUPS   = 'Grupy';
const SHEET_GUESTS   = 'Goście';
const SHEET_RESPONSES = 'Odpowiedzi';

// ---- CORS helper ----
function setCORS(output) {
  return output
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function doOptions(e) {
  return setCORS(ContentService.createTextOutput(''));
}

// ---- GET handler ----
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    if (action === 'getGroup') {
      result = getGroup(e.parameter.code);
    } else if (action === 'getAllGroups') {
      result = getAllGroups();
    } else {
      result = { error: 'Unknown action' };
    }
  } catch(err) {
    result = { error: err.message };
  }
  return setCORS(
    ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON)
  );
}

// ---- POST handler ----
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch(err) {
    return setCORS(ContentService.createTextOutput(JSON.stringify({ error: 'Invalid JSON' })));
  }

  let result;
  try {
    if (payload.action === 'submitRsvp') {
      result = submitRsvp(payload);
    } else if (payload.action === 'addGroup') {
      result = addGroup(payload.group);
    } else {
      result = { error: 'Unknown action' };
    }
  } catch(err) {
    result = { error: err.message };
  }

  return setCORS(
    ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON)
  );
}

// ---- Get single group by code ----
function getGroup(code) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const groupSheet = ss.getSheetByName(SHEET_GROUPS);
  const guestSheet  = ss.getSheetByName(SHEET_GUESTS);

  if (!groupSheet || !guestSheet) throw new Error('Brak arkuszy. Uruchom setupSheets() najpierw.');

  const groupRows = groupSheet.getDataRange().getValues();
  const groupHeader = groupRows[0];
  const groupRow = groupRows.slice(1).find(r => r[groupHeader.indexOf('Kod')] === code);
  if (!groupRow) throw new Error('Nie znaleziono grupy o kodzie: ' + code);

  const groupId = groupRow[groupHeader.indexOf('ID')];
  const groupName = groupRow[groupHeader.indexOf('Nazwa grupy')];
  const musicDedication = groupRow[groupHeader.indexOf('Dedykacja muzyczna')] || '';
  const message = groupRow[groupHeader.indexOf('Wiadomość')] || '';

  const guestRows = guestSheet.getDataRange().getValues();
  const guestHeader = guestRows[0];
  const guests = guestRows.slice(1)
    .filter(r => r[guestHeader.indexOf('Grupa ID')] === groupId)
    .map(r => ({
      id:       r[guestHeader.indexOf('ID')],
      name:     r[guestHeader.indexOf('Imię i nazwisko')],
      type:     r[guestHeader.indexOf('Typ')],
      rsvp:     r[guestHeader.indexOf('RSVP')] || null,
      diet:     r[guestHeader.indexOf('Dieta')].split(',').map(d => d.trim()).filter(Boolean),
      notes:    r[guestHeader.indexOf('Uwagi')] || '',
      childAge: r[guestHeader.indexOf('Wiek dziecka')] || '',
      plus1Name: r[guestHeader.indexOf('Imię osoby towarzyszącej')] || ''
    }));

  return { groupId, groupName, code, musicDedication, message, guests };
}

// ---- Get all groups (for admin) ----
function getAllGroups() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const groupSheet = ss.getSheetByName(SHEET_GROUPS);
  const guestSheet  = ss.getSheetByName(SHEET_GUESTS);
  if (!groupSheet || !guestSheet) return [];

  const groupRows = groupSheet.getDataRange().getValues();
  const gh = groupRows[0];
  const guestRows = guestSheet.getDataRange().getValues();
  const gh2 = guestRows[0];

  return groupRows.slice(1).map(r => {
    const groupId = r[gh.indexOf('ID')];
    const guests = guestRows.slice(1)
      .filter(gr => gr[gh2.indexOf('Grupa ID')] === groupId)
      .map(gr => ({
        id:       gr[gh2.indexOf('ID')],
        name:     gr[gh2.indexOf('Imię i nazwisko')],
        type:     gr[gh2.indexOf('Typ')],
        rsvp:     gr[gh2.indexOf('RSVP')] || null,
        diet:     gr[gh2.indexOf('Dieta')] || '',
        notes:    gr[gh2.indexOf('Uwagi')] || '',
        childAge: gr[gh2.indexOf('Wiek dziecka')] || ''
      }));
    return {
      id:               groupId,
      groupName:        r[gh.indexOf('Nazwa grupy')],
      code:             r[gh.indexOf('Kod')],
      submittedAt:      r[gh.indexOf('Data odpowiedzi')] || null,
      musicDedication:  r[gh.indexOf('Dedykacja muzyczna')] || '',
      message:          r[gh.indexOf('Wiadomość')] || '',
      guests
    };
  });
}

// ---- Submit RSVP ----
function submitRsvp(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const groupSheet  = ss.getSheetByName(SHEET_GROUPS);
  const guestSheet  = ss.getSheetByName(SHEET_GUESTS);
  const respSheet   = ss.getSheetByName(SHEET_RESPONSES);

  const now = new Date().toLocaleString('pl-PL');

  // Update group row
  const groupRows = groupSheet.getDataRange().getValues();
  const gh = groupRows[0];
  for (let i = 1; i < groupRows.length; i++) {
    if (groupRows[i][gh.indexOf('Kod')] === payload.code) {
      groupSheet.getRange(i + 1, gh.indexOf('Dedykacja muzyczna') + 1).setValue(payload.musicDedication || '');
      groupSheet.getRange(i + 1, gh.indexOf('Wiadomość') + 1).setValue(payload.message || '');
      groupSheet.getRange(i + 1, gh.indexOf('Data odpowiedzi') + 1).setValue(now);
      break;
    }
  }

  // Update guest rows
  const guestRows = guestSheet.getDataRange().getValues();
  const gh2 = guestRows[0];
  payload.guests.forEach(guest => {
    for (let i = 1; i < guestRows.length; i++) {
      if (guestRows[i][gh2.indexOf('ID')] === guest.id) {
        guestSheet.getRange(i + 1, gh2.indexOf('RSVP') + 1).setValue(guest.rsvp);
        guestSheet.getRange(i + 1, gh2.indexOf('Dieta') + 1).setValue(guest.diet);
        guestSheet.getRange(i + 1, gh2.indexOf('Uwagi') + 1).setValue(guest.notes);
        guestSheet.getRange(i + 1, gh2.indexOf('Wiek dziecka') + 1).setValue(guest.childAge || '');
        if (guest.plus1Name) guestSheet.getRange(i + 1, gh2.indexOf('Imię osoby towarzyszącej') + 1).setValue(guest.plus1Name);
        break;
      }
    }
    // Log to responses sheet
    respSheet.appendRow([
      now, payload.groupName, payload.code,
      guest.name, guest.type === 'child' ? 'Dziecko' : guest.type === 'plus1' ? 'Osoba towarzysząca' : 'Dorosły',
      guest.rsvp === 'yes' ? 'Będę' : 'Nie będę',
      guest.diet, guest.notes, guest.childAge || '',
      guest.plus1Name || '',
      payload.musicDedication || '', payload.message || ''
    ]);
  });

  return { success: true };
}

// ---- Add group (from admin) ----
function addGroup(group) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const groupSheet = ss.getSheetByName(SHEET_GROUPS);
  const guestSheet  = ss.getSheetByName(SHEET_GUESTS);

  groupSheet.appendRow([
    group.id, group.groupName, group.code, '', '', ''
  ]);

  group.guests.forEach(g => {
    guestSheet.appendRow([
      g.id, group.id, g.name, g.type, '', '', '', '', ''
    ]);
  });

  return { success: true, code: group.code };
}

// ---- One-time setup: create sheets with headers ----
// Run this ONCE manually from the Apps Script editor
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Groups sheet
  let groupSheet = ss.getSheetByName(SHEET_GROUPS);
  if (!groupSheet) groupSheet = ss.insertSheet(SHEET_GROUPS);
  groupSheet.clearContents();
  groupSheet.appendRow(['ID','Nazwa grupy','Kod','Dedykacja muzyczna','Wiadomość','Data odpowiedzi']);
  groupSheet.setFrozenRows(1);
  groupSheet.getRange(1,1,1,6).setBackground('#f7e8ed').setFontWeight('bold');

  // Guests sheet
  let guestSheet = ss.getSheetByName(SHEET_GUESTS);
  if (!guestSheet) guestSheet = ss.insertSheet(SHEET_GUESTS);
  guestSheet.clearContents();
  guestSheet.appendRow(['ID','Grupa ID','Imię i nazwisko','Typ','RSVP','Dieta','Uwagi','Wiek dziecka','Imię osoby towarzyszącej']);
  guestSheet.setFrozenRows(1);
  guestSheet.getRange(1,1,1,8).setBackground('#f7e8ed').setFontWeight('bold');

  // Responses sheet
  let respSheet = ss.getSheetByName(SHEET_RESPONSES);
  if (!respSheet) respSheet = ss.insertSheet(SHEET_RESPONSES);
  respSheet.clearContents();
  respSheet.appendRow(['Data','Nazwa grupy','Kod','Imię i nazwisko','Typ','Odpowiedź','Dieta','Uwagi','Wiek dziecka','Imię osoby towarzyszącej','Dedykacja muzyczna','Wiadomość']);
  respSheet.setFrozenRows(1);
  respSheet.getRange(1,1,1,11).setBackground('#f5edd8').setFontWeight('bold');

  SpreadsheetApp.flush();
  Logger.log('Arkusze zostały skonfigurowane!');
}
