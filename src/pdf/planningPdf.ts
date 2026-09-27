import PDFDocument from "pdfkit";
import type { Schedule } from "../types.js";

const PALETTE = ["#E07A5F", "#3D5A80", "#81B29A", "#B5651D"];

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 portrait, points
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const ROW_BOTTOM_LIMIT = 780;

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Génère un PDF "pas-à-pas" du planning de préparation, inspiré des fiches
 * batch cooking classiques : liste chronologique unique (peu importe la
 * recette), cases à cocher, code couleur par recette, équipement en évidence
 * — pensé pour être suivi en cuisine sans écran.
 */
export function generatePlanningPdf(schedule: Schedule, recipeTitles: string[]): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
  const colorByRecipe = new Map<string, string>();
  recipeTitles.forEach((title, i) => colorByRecipe.set(title, PALETTE[i % PALETTE.length]));

  drawHeader(doc, schedule, recipeTitles, colorByRecipe);

  let y = doc.y + 10;
  for (const step of schedule.steps) {
    y = drawStepRow(doc, step, colorByRecipe.get(step.recipeTitle) ?? "#888", y);
  }

  doc.end();
  return doc;
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  schedule: Schedule,
  recipeTitles: string[],
  colorByRecipe: Map<string, string>,
): void {
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#2a2420").text("Planning de préparation");
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#756b60")
    .text(`Généré le ${new Date().toLocaleDateString("fr-FR")} — BatchCookingManager`);

  doc.moveDown(0.8);

  // Badge durée totale
  const badgeText = `Durée totale : ${formatMinutes(schedule.makespanMinutes)}`;
  doc.font("Helvetica-Bold").fontSize(12);
  const badgeWidth = doc.widthOfString(badgeText) + 20;
  const badgeY = doc.y;
  doc.roundedRect(PAGE_MARGIN, badgeY, badgeWidth, 24, 4).fill("#b5651d");
  doc.fillColor("#ffffff").text(badgeText, PAGE_MARGIN + 10, badgeY + 6);

  doc.y = badgeY + 24 + 14;
  doc.x = PAGE_MARGIN;

  // Légende recettes
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#2a2420").text("Recettes du planning :", PAGE_MARGIN);
  doc.moveDown(0.3);
  for (const title of recipeTitles) {
    const color = colorByRecipe.get(title) ?? "#888";
    const lineY = doc.y;
    doc.rect(PAGE_MARGIN, lineY + 2, 10, 10).fill(color);
    doc.font("Helvetica").fontSize(10).fillColor("#2a2420").text(title, PAGE_MARGIN + 16, lineY);
    doc.y = lineY + 14;
  }

  doc.moveDown(0.5);
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .strokeColor("#e2d9cc")
    .lineWidth(1)
    .stroke();
}

function drawStepRow(
  doc: PDFKit.PDFDocument,
  step: Schedule["steps"][number],
  color: string,
  y: number,
): number {
  const timeLabel = `${formatMinutes(step.startMinutes)} – ${formatMinutes(step.endMinutes)}`;
  const checkboxSize = 11;
  const barX = PAGE_MARGIN + 20;
  const textX = barX + 8;
  const textWidth = CONTENT_WIDTH - (textX - PAGE_MARGIN) - 90;

  doc.font("Helvetica").fontSize(9);
  const descHeight = doc.heightOfString(step.description, { width: textWidth });
  const rowHeight = Math.max(34, descHeight + 22);

  if (y + rowHeight > ROW_BOTTOM_LIMIT) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  // case à cocher
  doc.rect(PAGE_MARGIN, y + 3, checkboxSize, checkboxSize).lineWidth(1).strokeColor("#756b60").stroke();

  // barre couleur recette
  doc.rect(barX, y, 4, rowHeight - 8).fill(color);

  // heure
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#2a2420").text(timeLabel, textX, y, { width: 95 });

  // titre recette (une seule ligne, tronqué si trop long — `height` est requis pour que `ellipsis` s'applique)
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(color)
    .text(step.recipeTitle, textX + 95, y, { width: textWidth - 95, height: 11, ellipsis: true });

  // description
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#2a2420")
    .text(step.description, textX, y + 13, { width: textWidth });

  // équipement
  if (step.equipmentIds.length > 0) {
    const eqText = step.equipmentIds.join(" · ");
    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor("#756b60")
      .text(eqText, PAGE_MARGIN + CONTENT_WIDTH - 85, y, { width: 85, align: "right" });
  }

  const nextY = y + rowHeight;
  doc
    .moveTo(PAGE_MARGIN, nextY - 6)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, nextY - 6)
    .strokeColor("#e2d9cc")
    .lineWidth(0.5)
    .stroke();

  return nextY;
}
