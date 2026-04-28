// ============================================================
// Bio Builder — Google Apps Script Backend V2
// Brands & Endorsements
// ============================================================

// --- CONFIGURATION ---
const DRIVE_FOLDER_ID = '1Z4MdMUdXC_P1XU7yTqQ7h4_yREKGbK5E';

// Google Sheet ID:
const SHEET_ID = "1T0Ngu2mg8BocStVKSfkYUVnzzGUPbVmrGYpQYrZyNIU";

// The five tabs we'll be pulling from
const TABS = ["Film/TV", "Musician", "Digital", "Sports", "Culinary"];

// The column names in the Sheet (zero-indexed)
// NOTE: GENDER column sits between NAME and BIOS
const COL = {
  NAME:                0,
  GENDER:              1,
  BIOS:                2,
  EXCLUSIVITY:         3,
  EXCLUSIVITY_SUMMARY: 4,
  RATE_CARDS:          5,
  NOTES:               6
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
  const action   = e.parameter.action;
  const callback = e.parameter.callback;

  let result;

  if (action === "getRoster") {
    result = getRosterData();
  } else if (action === "generateDocument") {
    const payload = JSON.parse(e.parameter.payload);
    result = generateDocument(
      payload.title,
      payload.featuredNames  || [],
      payload.allSelections  || []
    );
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
    const result  = generateDocument(
      payload.title,
      payload.featuredNames || [],
      payload.allSelections || []
    );
    return respond(result);
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ============================================================
// getRoster — Reads all 5 tabs, returns structured roster
// ============================================================
function getRosterData() {
  try {
    const ss     = SpreadsheetApp.openById(SHEET_ID);
    const roster = {};

    TABS.forEach(tabName => {
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) return;

      const rows   = sheet.getDataRange().getValues();
      const people = [];

      for (let i = 1; i < rows.length; i++) {
        const name = rows[i][COL.NAME];
        if (!name || name.toString().trim() === "") continue;
        people.push({
          name:               name.toString().trim(),
          gender:             rows[i][COL.GENDER]?.toString().trim()              || "",
          exclusivity:        rows[i][COL.EXCLUSIVITY]?.toString().trim()         || "",
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
// featuredNames: [{ name, category }, ...] in user-defined priority order
// allSelections: [{ name, category }, ...] all selected talent
//
// Document order rules:
//   1. "Featured Talent" section lists featured names (names only, no bios).
//   2. Categories are ordered: featured name categories first (in order of
//      first appearance among featuredNames), then remaining TABS order.
//   3. Within each category, genders are ordered: first featured name's gender
//      first, then M → F → NB for the remainder (NB always after F).
//   4. Within each gender group: featured names appear first (by their
//      featured priority), then non-featured in selection order.
//   5. A blank line separates gender groups within a category.
//   6. A blank line separates categories.
// ============================================================
function generateDocument(docTitle, featuredNames, allSelections) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);

    // ── Build data map keyed by `${category}::${name}` ──────────────────────
    const dataMap     = {};
    const richTextMap = {};

    const categoriesNeeded = [...new Set(allSelections.map(s => s.category))];

    categoriesNeeded.forEach(tabName => {
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) return;

      const rows       = sheet.getDataRange().getValues();
      const namesInTab = new Set(
        allSelections.filter(s => s.category === tabName).map(s => s.name)
      );

      for (let i = 1; i < rows.length; i++) {
        const name = rows[i][COL.NAME]?.toString().trim();
        if (!namesInTab.has(name)) continue;

        const key    = `${tabName}::${name}`;
        dataMap[key] = {
          name,
          category:           tabName,
          gender:             rows[i][COL.GENDER]?.toString().trim()              || '',
          bio:                rows[i][COL.BIOS]?.toString().trim()                || '',
          exclusivity:        rows[i][COL.EXCLUSIVITY]?.toString().trim()         || '',
          exclusivitySummary: rows[i][COL.EXCLUSIVITY_SUMMARY]?.toString().trim() || '',
          rateCard:           rows[i][COL.RATE_CARDS]?.toString().trim()          || '',
          notes:              rows[i][COL.NOTES]?.toString().trim()               || ''
        };

        try {
          richTextMap[key] = sheet.getRange(i + 1, COL.BIOS + 1).getRichTextValue();
        } catch (_) {
          richTextMap[key] = null;
        }
      }
    });

    // ── Compute gender order ──────────────────────────────────────────────────
    // Base order is M → F → NB. The first featured name's gender is promoted
    // to the front; the rest retain their relative M → F → NB ordering.
    // Unknown / blank genders are always last.
    const BASE_GENDER_ORDER = ['M', 'F', 'NB'];
    let genderOrder = ['M', 'F', 'NB', ''];

    if (featuredNames.length > 0) {
      const firstKey    = `${featuredNames[0].category}::${featuredNames[0].name}`;
      const firstGender = dataMap[firstKey]?.gender || 'M';
      const others      = BASE_GENDER_ORDER.filter(g => g !== firstGender);
      genderOrder = [firstGender, ...others, ''];
    }

    // ── Compute category order ────────────────────────────────────────────────
    // Featured name categories first (in order of first appearance), then
    // remaining categories in default TABS order.
    const featuredCategories = [];
    for (const f of featuredNames) {
      if (!featuredCategories.includes(f.category)) {
        featuredCategories.push(f.category);
      }
    }
    const orderedCategories = [
      ...featuredCategories,
      ...TABS.filter(t => categoriesNeeded.includes(t) && !featuredCategories.includes(t))
    ].filter(c => categoriesNeeded.includes(c));

    // ── Featured name priority lookup ─────────────────────────────────────────
    const featuredKeyOrder = {};
    featuredNames.forEach((f, i) => {
      featuredKeyOrder[`${f.category}::${f.name}`] = i;
    });

    // ── Selection order lookup (for stable sort of non-featured) ──────────────
    const selectionIndexMap = {};
    allSelections.forEach((s, i) => {
      selectionIndexMap[`${s.category}::${s.name}`] = i;
    });

    // ── Create doc ────────────────────────────────────────────────────────────
    const doc  = DocumentApp.create(docTitle);
    const body = doc.getBody();
    body.clear();
    body.setMarginTop(72);
    body.setMarginBottom(72);
    body.setMarginLeft(72);
    body.setMarginRight(72);

    const logoBlob = DriveApp.getFileById(LOGO_FILE_ID).getBlob();

    // ═════════════════════════════════════════════════════════════════════════
    // FEATURED TALENT section — bold + underlined header, names only (no bios)
    // ═════════════════════════════════════════════════════════════════════════
    if (featuredNames.length > 0) {
      const featHeader = body.appendParagraph('Featured Talent');
      featHeader.setSpacingBefore(0).setSpacingAfter(0);
      featHeader.editAsText()
        .setFontFamily('Arial').setFontSize(11).setBold(true).setUnderline(true)
        .setForegroundColor('#1A1A1A');

      featuredNames.forEach(f => {
        const namePara = body.appendParagraph(f.name);
        namePara.setSpacingBefore(0).setSpacingAfter(0);
        namePara.editAsText()
          .setFontFamily('Arial').setFontSize(11).setBold(false).setUnderline(false)
          .setForegroundColor('#333333');
      });

      // Blank line separating Featured Talent from first category
      body.appendParagraph('').setSpacingBefore(0).setSpacingAfter(0);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // CATEGORY sections
    // ═════════════════════════════════════════════════════════════════════════
    let isFirstCategory = true;

    orderedCategories.forEach(tabName => {
      const categorySelections = allSelections.filter(s => s.category === tabName);

      // Group by gender
      const byGender = {};
      categorySelections.forEach(s => {
        const key    = `${tabName}::${s.name}`;
        const gender = dataMap[key]?.gender || '';
        if (!byGender[gender]) byGender[gender] = [];
        byGender[gender].push(s);
      });

      // Sort each gender group: featured names first (by priority), then
      // non-featured in original selection order
      Object.keys(byGender).forEach(gender => {
        byGender[gender].sort((a, b) => {
          const aKey  = `${tabName}::${a.name}`;
          const bKey  = `${tabName}::${b.name}`;
          const aFeat = featuredKeyOrder[aKey] !== undefined ? featuredKeyOrder[aKey] : Infinity;
          const bFeat = featuredKeyOrder[bKey] !== undefined ? featuredKeyOrder[bKey] : Infinity;
          if (aFeat !== bFeat) return aFeat - bFeat;
          return (selectionIndexMap[aKey] || 0) - (selectionIndexMap[bKey] || 0);
        });
      });

      // Skip this category if nobody has a bio
      const hasAnyone = genderOrder.some(g =>
        (byGender[g] || []).some(s => dataMap[`${tabName}::${s.name}`]?.bio)
      );
      if (!hasAnyone) return;

      // Blank line before each category except the first
      if (!isFirstCategory) {
        body.appendParagraph('').setSpacingBefore(0).setSpacingAfter(0);
      }
      isFirstCategory = false;

      // Category label
      const catLabel = body.appendParagraph(tabName);
      catLabel.setSpacingBefore(0).setSpacingAfter(0);
      catLabel.editAsText()
        .setFontFamily('Arial').setFontSize(11).setBold(true).setForegroundColor('#1A1A1A');

      // People grouped by gender
      let isFirstGenderGroup = true;

      genderOrder.forEach(gender => {
        const people = (byGender[gender] || []).filter(s => dataMap[`${tabName}::${s.name}`]?.bio);
        if (people.length === 0) return;

        // Blank line before second+ gender group within this category
        if (!isFirstGenderGroup) {
          body.appendParagraph('').setSpacingBefore(0).setSpacingAfter(0);
        }
        isFirstGenderGroup = false;

        people.forEach(s => {
          const key    = `${tabName}::${s.name}`;
          const person = dataMap[key];
          if (!person?.bio) return;

          const bioPara = body.appendParagraph(person.bio);
          bioPara.setSpacingBefore(0).setSpacingAfter(0);
          bioPara.editAsText()
            .setFontFamily('Arial').setFontSize(11).setBold(false)
            .setForegroundColor('#333333');

          // Re-apply hyperlinks from rich-text source
          const richText = richTextMap[key];
          if (richText) {
            const textEl = bioPara.editAsText();
            let pos = 0;
            for (const run of richText.getRuns()) {
              const runText = run.getText();
              const url     = run.getLinkUrl();
              if (url && runText.length > 0) {
                try { textEl.setLinkUrl(pos, pos + runText.length - 1, url); } catch (_) {}
              }
              pos += runText.length;
            }
          }
        });
      });
    });

    // ═════════════════════════════════════════════════════════════════════════
    // FOOTER — "Confidential" left | small logo right
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
