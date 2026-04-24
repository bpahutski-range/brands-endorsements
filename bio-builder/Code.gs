// ============================================================
// Bio Builder — Google Apps Script Backend V2
// Brands & Endorsements
// ============================================================

// --- CONFIGURATION ---
const DRIVE_FOLDER_ID = '1Z4MdMUdXC_P1XU7yTqQ7h4_yREKGbK5E';

// Google Sheet ID:
const SHEET_ID = "1T0Ngu2mg8BocStVKSfkYUVnzzGUPbVmrGYpQYrZyNIU";

// The five tabs we'll be pulling from
const TABS = ["Film/TV", "Musician", "Digital", "Athlete", "Culinary"];

// The column names in the Sheet (zero-indexed)
const COL = {
  NAME: 0,
  BIOS: 1,
  EXCLUSIVITY: 2,
  EXCLUSIVITY_SUMMARY: 3,
  RATE_CARDS: 4,
  NOTES: 5
};

// respond helper function
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doGet — Called when the frontend loads the page.
// ============================================================
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback;

  let result;

  if (action === "getRoster") {
    result = getRosterData();
  } else if (action === "generateDocument") {
    const payload = JSON.parse(e.parameter.payload);
    result = generateDocument(payload.title, payload.selections);
  } else {
    result = { status: "Bio Builder is running." };
  }

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(result)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doPost — Handles POST requests (document generation)
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const docTitle = payload.title;
    const selections = payload.selections;
    return generateDocument(docTitle, selections);
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ============================================================
// getRoster — Reads all 5 tabs, returns structured roster
// ============================================================
function getRosterData() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const roster = {};

    TABS.forEach(tabName => {
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) return;

      const rows = sheet.getDataRange().getValues();
      const people = [];

      for (let i = 1; i < rows.length; i++) {
        const name = rows[i][COL.NAME];
        if (!name || name.toString().trim() === "") continue;
        people.push({
          name:               name.toString().trim(),
          exclusivity:        rows[i][COL.EXCLUSIVITY]?.toString().trim() || "",
          exclusivitySummary: rows[i][COL.EXCLUSIVITY_SUMMARY]?.toString().trim() || ""
        });
      }

      roster[tabName] = people;
    });

    return { success: true, roster };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Scales an InlineImage to targetWidth (px) while preserving aspect ratio.
 */
function scaleTo(img, targetWidth) {
  const w = img.getWidth();
  if (!w) return;
  img.setWidth(targetWidth);
  img.setHeight(Math.round(img.getHeight() * (targetWidth / w)));
}

const LOGO_FILE_ID = '1CSga4D_llXhU1qSTKIVyqkcPr7kJcpm5';
const BRAND_COLOR  = '#003e02';

// ============================================================
// generateDocument
//
// selections: [{ category: "Film/TV", names: ["Jane", "Bob"] }, ...]
//   — ordered exactly as the user arranged the bins and chips.
// ============================================================
function generateDocument(docTitle, selections) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);

    // ── Build data map + rich-text bio map ───────────────────────────────────
    const dataMap     = {};
    const richTextMap = {};

    selections.forEach(({ category: tabName, names }) => {
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) return;

      const rows = sheet.getDataRange().getValues();
      dataMap[tabName]     = {};
      richTextMap[tabName] = {};

      for (let i = 1; i < rows.length; i++) {
        const name = rows[i][COL.NAME]?.toString().trim();
        if (!names.includes(name)) continue;

        dataMap[tabName][name] = {
          bio:                rows[i][COL.BIOS]?.toString().trim()                || '',
          exclusivity:        rows[i][COL.EXCLUSIVITY]?.toString().trim()         || '',
          exclusivitySummary: rows[i][COL.EXCLUSIVITY_SUMMARY]?.toString().trim() || '',
          rateCard:           rows[i][COL.RATE_CARDS]?.toString().trim()          || '',
          notes:              rows[i][COL.NOTES]?.toString().trim()               || ''
        };

        try {
          richTextMap[tabName][name] = sheet.getRange(i + 1, COL.BIOS + 1).getRichTextValue();
        } catch (_) {
          richTextMap[tabName][name] = null;
        }
      }
    });

    // ── Create doc + base styles ─────────────────────────────────────────────
    const doc  = DocumentApp.create(docTitle);
    const body = doc.getBody();
    body.clear();
    body.setMarginTop(72);
    body.setMarginBottom(72);
    body.setMarginLeft(72);
    body.setMarginRight(72);

    const logoBlob   = DriveApp.getFileById(LOGO_FILE_ID).getBlob();
    const brandColor = (typeof BRAND_COLOR !== 'undefined') ? BRAND_COLOR : '#1A1A2E';

    // ═════════════════════════════════════════════════════════════════════════
    // TALENT LIST  —  flat, continuous, category breaks only
    // ═════════════════════════════════════════════════════════════════════════
    let firstCategory = true;

    selections.forEach(({ category: tabName, names }) => {
      if (!names || names.length === 0) return;

      // Category break: blank line (skipped before the very first category)
      // then the category name in bold at the same size as the bios.
      if (!firstCategory) {
        const blankLine = body.appendParagraph('');
        blankLine.setSpacingBefore(0).setSpacingAfter(0);
      }
      firstCategory = false;

      const catLabel = body.appendParagraph(tabName);
      catLabel.setSpacingBefore(0).setSpacingAfter(4);
      catLabel.editAsText()
        .setFontFamily('Arial').setFontSize(11).setBold(true).setForegroundColor('#1A1A1A');

      // Names — one after another, no break between them
      names.forEach(name => {
        const namePara = body.appendParagraph(name);
        namePara.setSpacingBefore(0).setSpacingAfter(0);
        namePara.editAsText()
          .setFontFamily('Arial').setFontSize(11).setBold(false).setForegroundColor('#333333');
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // FOOTER  —  "Confidential" left  |  small logo right
    // ═════════════════════════════════════════════════════════════════════════
    const footer = doc.getFooter() || doc.addFooter();
    footer.clear();

    const ftTable = footer.appendTable([['', '']]);
    ftTable.setBorderWidth(0);

    const confPara = ftTable.getCell(0, 0).getChild(0).asParagraph();
    confPara.appendText('Confidential');
    confPara.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
    confPara.editAsText()
      .setFontFamily('Arial').setFontSize(8).setItalic(true).setForegroundColor('#BBBBBB');

    const logoFooterPara = ftTable.getCell(0, 1).getChild(0).asParagraph();
    logoFooterPara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    scaleTo(logoFooterPara.appendInlineImage(logoBlob), 72);

    // ── Save to Drive ─────────────────────────────────────────────────────────
    const docFile = DriveApp.getFileById(doc.getId());
    if (DRIVE_FOLDER_ID) {
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      folder.addFile(docFile);
      DriveApp.getRootFolder().removeFile(docFile);
    }

    doc.saveAndClose();

    return {
      success:  true,
      docUrl:   'https://docs.google.com/document/d/' + doc.getId() + '/edit',
      docTitle: docTitle
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}
