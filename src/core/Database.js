var _SPREADSHEET_INSTANCE = null;

function sheet() {
    if (!_SPREADSHEET_INSTANCE) {
        _SPREADSHEET_INSTANCE = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    }
    return _SPREADSHEET_INSTANCE;
}

function sheetRows(name) {
    var targetSheet = sheet().getSheetByName(name);
    if (!targetSheet) return [];

    var lastRow = targetSheet.getLastRow();
    var lastCol = targetSheet.getLastColumn();
    if (lastRow === 0 || lastCol === 0) return [];

    return targetSheet.getRange(1, 1, lastRow, lastCol).getValues();
}
