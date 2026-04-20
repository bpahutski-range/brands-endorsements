# Bio Builder — Brands & Endorsements

A lightweight internal tool for quickly generating formatted talent bio documents. Select names from a pre-populated roster, give your document a title, and get a clean Google Doc saved directly to your team's shared Drive — in seconds, no formatting required.

## How It Works

1. Visit the tool via the GitHub Pages URL
2. Select the individuals you want included from the roster
3. Enter a document title (e.g., *"Nike Partnership — Athlete Bios Q2"*)
4. Click **Generate Document**
5. A formatted Google Doc is automatically created and saved to the shared Drive folder — a direct link is returned instantly

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | HTML/CSS/JS, hosted on GitHub Pages |
| Backend Logic | Google Apps Script (deployed as a Web App) |
| Data Source | Google Sheets (roster & bios) |
| Output | Google Docs, saved to Google Drive |

## Managing the Roster

Bios and talent info are maintained in a shared Google Sheet. No code changes are needed — just update the Sheet and the tool will reflect changes immediately. The Sheet follows this structure:

| Column | Description |
|---|---|
| `Name` | Full name of the individual |
| `Title` | Role or title (e.g., *Professional Athlete, NBA*) |
| `Bio` | Full biography text |
| *(more columns TBD)* | Expandable as needed |

## Repo Structure
brands-endorsements/

  └── bio-builder/

    ├── index.html       # Frontend UI

    ├── style.css        # Styling

    ├── README.md        # You are here


## Setup & Deployment

Full setup instructions, including how to configure the Google Apps Script Web App and connect it to the Sheet, are documented in `SETUP.md` *(coming soon)*.
