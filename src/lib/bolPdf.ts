// ─────────────────────────────────────────────────────────────────────────────
// Bill of Lading PDF generation — ported VERBATIM from platform_updt.html buildPDF.
// Letter-size, pixel-matched. Supports an editable (AcroForm) and a static mode.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF, AcroFormTextField, AcroFormCheckBox } from "jspdf";
import type { BolForm, BolOrder } from "./types";

/** Build the Bill of Lading PDF document from a BolForm. */
export function buildBolPDF(bol: BolForm, editable = true): jsPDF {
  // value / numeric accessors mirroring the original v() / n() DOM helpers
  const v = (id: keyof BolForm): string => {
    const raw = bol[id];
    return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  };
  const n = (id: keyof BolForm): number => parseInt(v(id)) || 0;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612,
    H = 792;
  const ML = 28,
    MR = 28,
    MT = 24;
  const PW = W - ML - MR;

  const DARK: [number, number, number] = [30, 30, 40];
  const LBLUE: [number, number, number] = [255, 255, 255];
  const MBLUE: [number, number, number] = [255, 255, 255];
  const BLK: [number, number, number] = [0, 0, 0];
  const WHT: [number, number, number] = [255, 255, 255];
  const GRAY: [number, number, number] = [160, 160, 160];

  const p1Orders: BolOrder[] = bol.p1Orders || [];
  const p2Orders: BolOrder[] = bol.p2Orders || [];
  const totalPages = p2Orders.length > 0 ? 2 : 1;

  function sf(style: string, size: number) {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  }

  interface CellOpts {
    fill?: [number, number, number] | null;
    align?: "left" | "center" | "right";
    font?: string;
    fs?: number;
    border?: boolean;
    pad?: number;
  }
  function cell(x: number, y: number, w: number, h: number, text: string, opts: CellOpts = {}) {
    const { fill, align, font, fs, border, pad } = {
      fill: null,
      align: "left" as const,
      font: "normal",
      fs: 7.5,
      border: true,
      pad: 4,
      ...opts,
    };
    if (fill) {
      doc.setFillColor(...(fill as [number, number, number]));
      doc.rect(x, y, w, h, "F");
    }
    if (border) {
      doc.setDrawColor(...GRAY);
      doc.setLineWidth(0.3);
      doc.rect(x, y, w, h, "S");
    }
    sf(font, fs);
    doc.setTextColor(...BLK);
    let tx = x + pad;
    if (align === "center") tx = x + w / 2;
    else if (align === "right") tx = x + w - pad;
    const lines = doc.splitTextToSize(String(text || ""), w - pad * 2);
    const lh = fs * 1.2;
    let ty = y + (h - lines.length * lh) / 2 + fs;
    lines.forEach((line: string) => {
      doc.text(line, tx, ty, { align });
      ty += lh;
    });
  }

  function sectionBar(y: number, text: string) {
    doc.setFillColor(...DARK);
    doc.rect(ML, y, PW, 14, "F");
    doc.setDrawColor(...BLK);
    doc.setLineWidth(0.5);
    doc.rect(ML, y, PW, 14, "S");
    sf("bold", 7.5);
    doc.setTextColor(...WHT);
    doc.text(text, ML + PW / 2, y + 10, { align: "center" });
    return y + 14;
  }

  function drawCB(x: number, y: number, checked: boolean, size?: number) {
    size = size || 7;
    doc.setDrawColor(...BLK);
    doc.setLineWidth(0.5);
    doc.rect(x, y, size, size, "S");
    if (checked) {
      doc.setLineWidth(1);
      doc.line(x + 1.5, y + size / 2, x + size / 2.5, y + size - 1.5);
      doc.line(x + size / 2.5, y + size - 1.5, x + size - 1, y + 1);
      doc.setLineWidth(0.5);
    }
  }

  function tf(name: string, x: number, y: number, w: number, h: number, val: string, fSize?: number) {
    if (!editable) {
      if (!val) return;
      const fs2 = fSize || 7.5;
      sf("normal", fs2);
      doc.setTextColor(...BLK);
      doc.text(String(val), x + 2, y + (h - fs2 * 1.2) / 2 + fs2);
      return;
    }
    const field = new AcroFormTextField();
    field.fieldName = name;
    field.x = x;
    field.y = y;
    field.width = w;
    field.height = h;
    field.value = String(val || "");
    field.fontSize = fSize || 7.5;
    field.multiline = false;
    doc.addField(field);
  }

  function acb(name: string, x: number, y: number, checked: boolean, size?: number) {
    size = size || 7;
    if (!editable) {
      drawCB(x, y, checked, size);
      return;
    }
    const field = new AcroFormCheckBox();
    field.fieldName = name;
    field.x = x;
    field.y = y;
    field.width = size;
    field.height = size;
    // jsPDF's checkbox "on" state — the original tool names it "Yes".
    const cb = field as unknown as { value: string; appearanceState: string };
    cb.value = checked ? "Yes" : "Off";
    cb.appearanceState = checked ? "Yes" : "Off";
    doc.addField(field);
  }

  // PAGE 1
  let y = MT;

  sf("bold", 11);
  doc.setTextColor(...BLK);
  doc.text("Bill of Lading", W / 2, y + 12, { align: "center" });
  y += 20;

  sf("normal", 8);
  doc.text("Page 1 of  " + totalPages, W - MR, y + 8, { align: "right" });
  y += 14;

  const LW = PW * 0.48;
  const RW = PW * 0.52;
  const RX = ML + LW;
  const rh = 15;

  doc.setFillColor(...DARK);
  doc.rect(ML, y, LW, 13, "F");
  doc.setDrawColor(...BLK);
  doc.setLineWidth(0.5);
  doc.rect(ML, y, LW, 13, "S");
  sf("bold", 7);
  doc.setTextColor(...WHT);
  doc.text("SHIP FROM", ML + LW / 2, y + 9, { align: "center" });

  const sfRows: [string, string, string][] = [
    ["Name:", "sf_name", v("sf_name")],
    ["Address:", "sf_address", v("sf_address")],
    ["City/State/Zip:", "sf_csz", v("sf_csz")],
  ];
  const sfTotalH = 13 + (sfRows.length + 1) * rh;
  cell(RX, y, RW, sfTotalH, "", { border: true });
  const midY = y + sfTotalH / 2;
  sf("bold", 7);
  doc.setTextColor(...BLK);
  doc.text("Bill of Lading Number:", RX + 6, midY);
  sf("normal", 7);
  const bolLabelW = doc.getTextWidth("Bill of Lading Number:") + 22;
  doc.setDrawColor(...GRAY);
  doc.setLineWidth(0.3);
  doc.line(RX + bolLabelW - 6, midY - 10, RX + bolLabelW - 6, midY + 2);
  tf("bol_number", RX + bolLabelW, midY - 9, RW - bolLabelW - 6, 11, v("bol_number"), 8);
  y += 13;
  sfRows.forEach(([lbl, fid, val]) => {
    cell(ML, y, 72, rh, lbl, { fill: LBLUE, font: "bold", fs: 7 });
    cell(ML + 72, y, LW - 72, rh, "", { fill: LBLUE });
    tf(fid, ML + 73, y + 2, LW - 75, rh - 4, val);
    y += rh;
  });
  cell(ML, y, 72, rh, "SID#:", { fill: LBLUE, font: "bold", fs: 7 });
  cell(ML + 72, y, LW / 2 - 72, rh, "", { fill: LBLUE });
  tf("sf_sid", ML + 73, y + 2, LW / 2 - 75, rh - 4, v("sf_sid"));
  cell(ML + LW / 2, y, 30, rh, "FOB:", { fill: LBLUE, font: "bold", fs: 7 });
  cell(ML + LW / 2 + 30, y, LW / 2 - 30, rh, "", { fill: LBLUE });
  tf("sf_fob", ML + LW / 2 + 31, y + 2, LW / 2 - 33, rh - 4, v("sf_fob"));
  y += rh + 2;

  doc.setFillColor(...DARK);
  doc.rect(ML, y, LW, 13, "F");
  doc.setDrawColor(...BLK);
  doc.setLineWidth(0.5);
  doc.rect(ML, y, LW, 13, "S");
  sf("bold", 7);
  doc.setTextColor(...WHT);
  doc.text("SHIP TO", ML + LW / 2, y + 9, { align: "center" });
  cell(RX, y, RW, 13, "CARRIER NAME:", { font: "bold", fs: 7.5 });
  sf("bold", 7.5);
  const cnLW = doc.getTextWidth("CARRIER NAME:") + 8;
  tf("carrier_name", RX + cnLW, y + 1, RW - cnLW - 2, 11, v("carrier_name"), 7.5);
  y += 13;

  const stRows: [string, string, string, string, string, string][] = [
    ["Name:", "st_name_loc", v("st_name") + "  Location # " + v("st_location"), "Trailer number:", "trailer_number", v("trailer_number")],
    ["Address:", "st_address", v("st_address"), "Seal number:", "seal_number", v("seal_number")],
    ["City/State/Zip:", "st_csz", v("st_csz"), "SCAC:", "scac", v("scac")],
  ];
  stRows.forEach(([lbl, lfid, lval, rl, rfid, rval]) => {
    cell(ML, y, 72, rh, lbl, { fill: LBLUE, font: "bold", fs: 7 });
    cell(ML + 72, y, LW - 72, rh, "", { fill: LBLUE });
    tf(lfid, ML + 73, y + 2, LW - 75, rh - 4, lval);
    cell(RX, y, 82, rh, rl, { font: "bold", fs: 7 });
    cell(RX + 82, y, RW - 82, rh, "");
    tf(rfid, RX + 83, y + 2, RW - 85, rh - 4, rval);
    y += rh;
  });
  cell(ML, y, 72, rh, "CID#:", { fill: LBLUE, font: "bold", fs: 7 });
  cell(ML + 72, y, LW - 122, rh, "", { fill: LBLUE });
  tf("st_cid", ML + 73, y + 2, LW - 124, rh - 4, v("st_cid"));
  cell(ML + LW - 50, y, 50, rh, "FOB:", { fill: LBLUE, font: "bold", fs: 7 });
  cell(RX, y, 82, rh, "Pro number:", { font: "bold", fs: 7 });
  cell(RX + 82, y, RW - 82, rh, "");
  tf("pro_number", RX + 83, y + 2, RW - 85, rh - 4, v("pro_number"));
  y += rh + 2;

  doc.setFillColor(...DARK);
  doc.rect(ML, y, LW, 13, "F");
  doc.setDrawColor(...BLK);
  doc.setLineWidth(0.5);
  doc.rect(ML, y, LW, 13, "S");
  sf("bold", 6.5);
  doc.setTextColor(...WHT);
  doc.text("THIRD PARTY FREIGHT CHARGES BILL TO:", ML + LW / 2, y + 9, { align: "center" });
  cell(RX, y, RW, 13, "");
  y += 13;

  const tpRows: [string, string, string, string, string, string][] = [
    ["Name:", "tp_name", v("tp_name"), "Load ID #  or", "load_id", v("load_id")],
    ["Address:", "tp_address", v("tp_address"), "Authorization #", "auth_num", v("auth_num")],
  ];
  tpRows.forEach(([lbl, lfid, lval, rl, rfid, rval]) => {
    cell(ML, y, 72, rh, lbl, { fill: LBLUE, font: "bold", fs: 7 });
    cell(ML + 72, y, LW - 72, rh, "", { fill: LBLUE });
    tf(lfid, ML + 73, y + 2, LW - 75, rh - 4, lval);
    cell(RX, y, 105, rh, rl, { font: "bold", fs: 7 });
    cell(RX + 105, y, RW - 105, rh, "");
    tf(rfid, RX + 106, y + 2, RW - 108, rh - 4, rval);
    y += rh;
  });
  const ftRowH = 26;
  cell(ML, y, 72, ftRowH, "City/State/Zip:", { fill: LBLUE, font: "bold", fs: 7 });
  cell(ML + 72, y, LW - 72, ftRowH, "", { fill: LBLUE });
  tf("tp_csz", ML + 73, y + 2, LW - 75, ftRowH - 4, v("tp_csz"));
  cell(RX, y, RW, ftRowH, "", {});
  sf("bold", 7);
  doc.setTextColor(...BLK);
  doc.text("Freight Charge Terms:", RX + 4, y + 9);
  const ft = v("freight_terms");
  let fcx = RX + 8;
  ["Prepaid", "Collect", "3rd Party"].forEach((lbl) => {
    acb("ft_" + lbl, fcx, y + 14, ft === lbl, 7);
    sf("normal", 7);
    doc.setTextColor(...BLK);
    doc.text(lbl, fcx + 9, y + 21);
    fcx += 9 + doc.getTextWidth(lbl) + 10;
  });
  y += ftRowH;

  const apptW = LW / 3;
  const apptIds = ["appt_time", "driver_arrival", "driver_depart"] as const;
  const apptLabels = ["Appointment\nTime", "Actual Driver\nArrival Time", "Driver Departure\nTime"];
  const apptVals = [v("appt_time"), v("driver_arrival"), v("driver_depart")];
  apptLabels.forEach((lbl, i) => {
    cell(ML + i * apptW, y, apptW, 26, lbl, { font: "bold", fs: 6.5, align: "center" });
    tf(apptIds[i], ML + i * apptW + 2, y + 14, apptW - 4, 10, apptVals[i], 7);
  });
  cell(RX, y, RW, 26, "", {});
  acb("master_bol", RX + 8, y + 8, false, 8);
  sf("normal", 7);
  doc.setTextColor(...BLK);
  doc.text("Master Bill of Lading: with attached", RX + 20, y + 10);
  doc.text("underlying Bills of Lading", RX + 20, y + 19);
  y += 26;
  apptIds.forEach((id, i) => {
    cell(ML + i * apptW, y, apptW, 13, "", {});
    const ax = ML + i * apptW + 6;
    acb(id + "_am", ax, y + 3, false, 7);
    sf("normal", 6);
    doc.setTextColor(...BLK);
    doc.text("AM", ax + 9, y + 8);
    acb(id + "_pm", ax + 30, y + 3, false, 7);
    doc.text("PM", ax + 39, y + 8);
  });
  y += 13 + 2;

  y = sectionBar(y, "CUSTOMER ORDER INFORMATION");

  const infoRem = PW - 115 - 52 - 58 - 55;
  const colW = [115, 52, 58, 55, Math.round(infoRem * 0.56), Math.round(infoRem * 0.44)];
  const colH2 = ["CUSTOMER ORDER NUMBER", "# PKGS", "WEIGHT", "PALLET/SLIP?", "SHIPPER INFO", "WMS #"];
  let cx = ML;
  colH2.forEach((h, i) => {
    cell(cx, y, colW[i], 13, h, { fill: MBLUE, font: "bold", fs: 6.5, align: "center" });
    cx += colW[i];
  });
  y += 13;

  let gPkgs = 0,
    gWt = 0;
  [...p1Orders, ...p2Orders].forEach((o) => {
    gPkgs += o.pkgs;
    gWt += o.weight;
  });

  const P1_MAX = 10;
  for (let idx = 0; idx < P1_MAX; idx++) {
    const o = p1Orders[idx] || null;
    const bg = idx % 2 === 0 ? LBLUE : null;
    cx = ML;
    colW.forEach((w) => {
      cell(cx, y, w, 13, "", { fill: bg });
      cx += w;
    });
    tf("p1_ord_" + idx, ML + 1, y + 1, colW[0] - 2, 11, o ? o.order : "", 7.5);
    tf("p1_pkg_" + idx, ML + colW[0] + 1, y + 1, colW[1] - 2, 11, o && o.pkgs ? String(o.pkgs) : "", 7.5);
    tf("p1_wt_" + idx, ML + colW[0] + colW[1] + 1, y + 1, colW[2] - 2, 11, o && o.weight ? String(o.weight) : "", 7.5);
    acb("p1_ps_" + idx, ML + colW[0] + colW[1] + colW[2] + colW[3] / 2 - 4, y + 3, o ? !!o.pallet : false, 7);
    tf("p1_inf_" + idx, ML + colW[0] + colW[1] + colW[2] + colW[3] + 1, y + 1, colW[4] - 2, 11, o ? o.info : "", 7.5);
    tf("p1_wms_" + idx, ML + colW[0] + colW[1] + colW[2] + colW[3] + colW[4] + 1, y + 1, colW[5] - 2, 11, o ? o.wms : "", 7.5);
    y += 13;
  }
  cx = ML;
  cell(cx, y, colW[0], 14, "GRAND TOTAL", { font: "bold", fill: LBLUE, fs: 8 });
  cx += colW[0];
  cell(cx, y, colW[1], 14, gPkgs.toLocaleString(), { font: "bold", align: "center", fill: LBLUE });
  cx += colW[1];
  cell(cx, y, colW[2], 14, gWt.toLocaleString(), { font: "bold", align: "center", fill: LBLUE });
  cx += colW[2];
  cell(cx, y, colW[3] + colW[4] + colW[5], 14, "", { fill: LBLUE });
  y += 17;

  y = sectionBar(y, "CARRIER INFORMATION");

  cx = ML;
  const huW = 90,
    pkgW = 100,
    wtColW = 45,
    hmColW = 22;
  const ltlW2 = 70;
  const commodW = PW - huW - pkgW - wtColW - hmColW - ltlW2;

  cell(cx, y, huW, 12, "HANDLING UNIT", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + huW, y, pkgW, 12, "PACKAGE", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + huW + pkgW, y, wtColW, 12, "", { fill: MBLUE });
  cell(cx + huW + pkgW + wtColW, y, hmColW, 12, "", { fill: MBLUE });
  cell(
    cx + huW + pkgW + wtColW + hmColW,
    y,
    commodW,
    24,
    "COMMODITY DESCRIPTION\nCommodities requiring special or additional care or attention in handling\nor stowing must be so marked and packaged as to ensure safe\ntransportation with ordinary care.",
    { fill: MBLUE, font: "bold", fs: 5, align: "center" }
  );
  cell(cx + huW + pkgW + wtColW + hmColW + commodW, y, ltlW2, 12, "LTL ONLY", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  y += 12;

  cell(cx, y, 36, 12, "QTY", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + 36, y, 54, 12, "TYPE", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + huW, y, 36, 12, "QTY", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + huW + 36, y, pkgW - 36, 12, "TYPE", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + huW + pkgW, y, wtColW, 12, "WEIGHT", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + huW + pkgW + wtColW, y, hmColW, 12, "H.M.\n(X)", { fill: MBLUE, font: "bold", fs: 5.5, align: "center" });
  cell(cx + huW + pkgW + wtColW + hmColW + commodW, y, ltlW2 / 2, 12, "NMFC #", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  cell(cx + huW + pkgW + wtColW + hmColW + commodW + ltlW2 / 2, y, ltlW2 / 2, 12, "CLASS", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
  y += 12;

  function drawCarrierRow(
    rowY: number,
    huQtyVal: string,
    huTypeVal: string,
    pkgQtyVal: string,
    pkgTypeVal: string,
    wtVal: string,
    commTxt: string,
    suffix: string
  ) {
    const cx2 = ML;
    cell(cx2, rowY, 36, 13, "");
    cell(cx2 + 36, rowY, 54, 13, "");
    cell(cx2 + huW, rowY, 36, 13, "");
    cell(cx2 + huW + 36, rowY, pkgW - 36, 13, "");
    cell(cx2 + huW + pkgW, rowY, wtColW, 13, "");
    cell(cx2 + huW + pkgW + wtColW, rowY, hmColW, 13, "", {});
    acb("hm_" + suffix, cx2 + huW + pkgW + wtColW + 7, rowY + 3, false, 7);
    cell(cx2 + huW + pkgW + wtColW + hmColW, rowY, commodW, 13, "");
    cell(cx2 + huW + pkgW + wtColW + hmColW + commodW, rowY, ltlW2 / 2, 13, "");
    cell(cx2 + huW + pkgW + wtColW + hmColW + commodW + ltlW2 / 2, rowY, ltlW2 / 2, 13, "");
    if (suffix === "r0") {
      tf("hu_qty", cx2 + 1, rowY + 1, 34, 11, huQtyVal, 7.5);
      tf("hu_type", cx2 + 37, rowY + 1, 52, 11, huTypeVal, 7.5);
      tf("hu_pkg_qty", cx2 + huW + 1, rowY + 1, 34, 11, pkgQtyVal, 7.5);
      tf("hu_pkg_type", cx2 + huW + 37, rowY + 1, pkgW - 38, 11, pkgTypeVal, 7.5);
      tf("hu_weight", cx2 + huW + pkgW + 1, rowY + 1, wtColW - 2, 11, wtVal, 7.5);
      tf("commodity", cx2 + huW + pkgW + wtColW + hmColW + 1, rowY + 1, commodW - 2, 11, commTxt, 7);
      tf("nmfc", cx2 + huW + pkgW + wtColW + hmColW + commodW + 1, rowY + 1, ltlW2 / 2 - 2, 11, v("nmfc"), 7);
      tf("ltl_class", cx2 + huW + pkgW + wtColW + hmColW + commodW + ltlW2 / 2 + 1, rowY + 1, ltlW2 / 2 - 2, 11, v("ltl_class"), 7);
    } else {
      tf("comm_" + suffix, cx2 + huW + pkgW + wtColW + hmColW + 1, rowY + 1, commodW - 2, 11, commTxt, 7);
    }
  }

  drawCarrierRow(y, String(n("hu_qty") || ""), v("hu_type"), v("hu_pkg_qty"), v("hu_pkg_type"), v("hu_weight"), v("commodity"), "r0");
  y += 13;
  ["Total Pallets - (" + v("pallet_summary") + ")", "", ""].forEach((txt, i) => {
    drawCarrierRow(y, "", "", "", "", "", txt, "r" + (i + 1));
    y += 13;
  });

  y = sectionBar(y, "GRAND TOTAL");
  y += 1;

  const halfW = PW / 2;
  cell(
    ML,
    y,
    halfW,
    13,
    "Where the rate is dependent on value, shippers are required to state specifically in writing the agreed or declared value of the property as follows:",
    { fs: 5.5 }
  );
  cell(ML + halfW, y, halfW, 13, "", {});
  sf("bold", 7.5);
  doc.setTextColor(...BLK);
  doc.text("COD Amount:  $ ", ML + halfW + 6, y + 9);
  tf("cod_amount", ML + halfW + 72, y + 1, halfW - 80, 11, v("cod_amount"), 7.5);
  y += 13;
  cell(
    ML,
    y,
    halfW,
    13,
    '"The agreed or declared value of the property is specifically stated by the shipper to be not exceeding __________ per __________"',
    { fs: 5.5 }
  );
  cell(ML + halfW, y, halfW, 13, "", {});
  sf("bold", 7);
  doc.setTextColor(...BLK);
  doc.text("Fee Terms:", ML + halfW + 6, y + 9);
  let ftx = ML + halfW + 52;
  ["Collect", "Prepaid"].forEach((lbl) => {
    acb("fee_" + lbl, ftx, y + 3, false, 7);
    sf("normal", 7);
    doc.setTextColor(...BLK);
    doc.text(lbl, ftx + 9, y + 9);
    ftx += 9 + doc.getTextWidth(lbl) + 10;
  });
  y += 13;
  cell(ML, y, halfW, 11, "");
  cell(ML + halfW, y, halfW, 11, "", {});
  sf("normal", 7);
  doc.setTextColor(...BLK);
  doc.text("Customer check acceptable:", ML + halfW + 6, y + 8);
  acb("cust_check", ML + halfW + 120, y + 2, false, 7);
  y += 13;

  sf("bold", 6);
  doc.setTextColor(...BLK);
  doc.text(
    "NOTE  Liability Limitation for loss or damage in this shipment may be applicable.  See 49 U.S.C. ° 14706(c)(1)(A) and (B).",
    ML,
    y + 7
  );
  y += 12;

  const sw = [PW * 0.28, PW * 0.16, PW * 0.24, PW * 0.32];
  let sx = ML;
  cell(
    sx,
    y,
    sw[0],
    32,
    "RECEIVED, subject to individually determined rates or contracts that have been agreed upon in writing between the carrier and shipper, if applicable, otherwise to the rates, classifications and rules that have been established by the carrier and are available to the shipper, on request, and to all applicable state and federal regulations.",
    { fs: 4.8 }
  );
  sx += sw[0];
  cell(sx, y, sw[1] + sw[2], 32, "The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.", {
    fs: 5.5,
  });
  sx += sw[1] + sw[2];
  cell(sx, y, sw[3], 32, "Shipper Signature", { font: "bold", fs: 7 });
  y += 32;

  sx = ML;
  cell(sx, y, sw[0], 12, "SHIPPER SIGNATURE / DATE", { font: "bold", fs: 6.5 });
  cell(sx + sw[0], y, sw[1], 12, "Trailer Loaded:", { font: "bold", fs: 6.5 });
  cell(sx + sw[0] + sw[1], y, sw[2], 12, "Freight Counted:", { font: "bold", fs: 6.5 });
  cell(sx + sw[0] + sw[1] + sw[2], y, sw[3], 12, "CARRIER SIGNATURE / PICKUP DATE", { font: "bold", fs: 6.5 });
  y += 12;

  cell(
    sx,
    y,
    sw[0],
    40,
    "This is to certify that the above named materials are properly classified, packaged, marked and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT.",
    { fs: 4.8 }
  );
  cell(sx + sw[0], y, sw[1], 40, "", {});
  let tly = y + 4;
  acb("trailer_by_shipper", sx + sw[0] + 4, tly, false, 6);
  sf("normal", 6);
  doc.setTextColor(...BLK);
  doc.text("By Shipper", sx + sw[0] + 14, tly + 5);
  tly += 12;
  acb("trailer_by_driver", sx + sw[0] + 4, tly, false, 6);
  doc.text("By Driver", sx + sw[0] + 14, tly + 5);
  cell(sx + sw[0] + sw[1], y, sw[2], 40, "", {});
  tly = y + 4;
  acb("freight_by_shipper", sx + sw[0] + sw[1] + 4, tly, false, 6);
  doc.text("By Shipper", sx + sw[0] + sw[1] + 14, tly + 5);
  tly += 10;
  acb("freight_by_driver_p", sx + sw[0] + sw[1] + 4, tly, false, 6);
  doc.text("By Driver/pallets said to contain", sx + sw[0] + sw[1] + 14, tly + 5);
  tly += 10;
  acb("freight_by_driver_pc", sx + sw[0] + sw[1] + 4, tly, true, 6);
  doc.text("By Driver/Pieces", sx + sw[0] + sw[1] + 14, tly + 5);
  cell(
    sx + sw[0] + sw[1] + sw[2],
    y,
    sw[3],
    40,
    "Carrier acknowledges receipt of packages and required placards. Carrier certifies emergency response information was made available and/or carrier has the DOT emergency response guidebook or equivalent documentation in the vehicle.",
    { fs: 4.8 }
  );

  // PAGE 2
  if (p2Orders.length > 0) {
    doc.addPage("letter");
    y = MT;

    sf("bold", 11);
    doc.setTextColor(...BLK);
    doc.text("Extra Page for Bill of Lading – to be used if additional space is needed", W / 2, y + 12, { align: "center" });
    y += 22;

    sf("bold", 8);
    cell(ML, y, PW * 0.7, 15, "Bill of Lading Number:", { font: "bold", fs: 8 });
    tf(
      "bol_p2",
      ML + doc.getTextWidth("Bill of Lading Number:") + 12,
      y + 2,
      PW * 0.7 - doc.getTextWidth("Bill of Lading Number:") - 16,
      11,
      v("bol_number"),
      8
    );
    cell(ML + PW * 0.7, y, PW * 0.3, 15, "Page  2  of  " + totalPages, { align: "right", font: "bold", fs: 8 });
    y += 18;

    y = sectionBar(y, "CUSTOMER ORDER INFORMATION");

    cx = ML;
    colH2.forEach((h, i) => {
      cell(cx, y, colW[i], 13, h, { fill: MBLUE, font: "bold", fs: 6.5, align: "center" });
      cx += colW[i];
    });
    y += 13;

    const P2_MAX = 8;
    for (let idx = 0; idx < P2_MAX; idx++) {
      const o = p2Orders[idx] || null;
      const bg = idx % 2 === 0 ? LBLUE : null;
      cx = ML;
      colW.forEach((w) => {
        cell(cx, y, w, 13, "", { fill: bg });
        cx += w;
      });
      tf("p2_ord_" + idx, ML + 1, y + 1, colW[0] - 2, 11, o ? o.order : "", 7.5);
      tf("p2_pkg_" + idx, ML + colW[0] + 1, y + 1, colW[1] - 2, 11, o && o.pkgs ? String(o.pkgs) : "", 7.5);
      tf("p2_wt_" + idx, ML + colW[0] + colW[1] + 1, y + 1, colW[2] - 2, 11, o && o.weight ? String(o.weight) : "", 7.5);
      acb("p2_ps_" + idx, ML + colW[0] + colW[1] + colW[2] + colW[3] / 2 - 4, y + 3, o ? !!o.pallet : false, 7);
      tf("p2_inf_" + idx, ML + colW[0] + colW[1] + colW[2] + colW[3] + 1, y + 1, colW[4] - 2, 11, o ? o.info : "", 7.5);
      tf("p2_wms_" + idx, ML + colW[0] + colW[1] + colW[2] + colW[3] + colW[4] + 1, y + 1, colW[5] - 2, 11, o ? o.wms : "", 7.5);
      y += 13;
    }

    let pPkgs = 0,
      pWt = 0;
    p2Orders.forEach((o) => {
      pPkgs += o.pkgs;
      pWt += o.weight;
    });
    cx = ML;
    cell(cx, y, colW[0], 14, "PAGE SUBTOTAL", { font: "bold", fill: LBLUE, fs: 8 });
    cx += colW[0];
    cell(cx, y, colW[1], 14, pPkgs.toLocaleString(), { font: "bold", align: "center", fill: LBLUE });
    cx += colW[1];
    cell(cx, y, colW[2], 14, pWt.toLocaleString(), { font: "bold", align: "center", fill: LBLUE });
    cx += colW[2];
    cell(cx, y, colW[3] + colW[4] + colW[5], 14, "", { fill: LBLUE });
    y += 18;

    y = sectionBar(y, "CARRIER INFORMATION");

    cell(ML, y, huW, 12, "HANDLING UNIT", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW, y, pkgW, 12, "PACKAGE", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW + pkgW, y, wtColW, 12, "", { fill: MBLUE });
    cell(ML + huW + pkgW + wtColW, y, hmColW, 12, "", { fill: MBLUE });
    cell(ML + huW + pkgW + wtColW + hmColW, y, commodW, 12, "COMMODITY DESCRIPTION", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW + pkgW + wtColW + hmColW + commodW, y, ltlW2, 12, "LTL ONLY", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    y += 12;

    cell(ML, y, 36, 12, "QTY", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + 36, y, 54, 12, "TYPE", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW, y, 36, 12, "QTY", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW + 36, y, pkgW - 36, 12, "TYPE", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW + pkgW, y, wtColW, 12, "WEIGHT", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW + pkgW + wtColW, y, hmColW, 12, "H.M.\n(X)", { fill: MBLUE, font: "bold", fs: 5.5, align: "center" });
    cell(ML + huW + pkgW + wtColW + hmColW, y, commodW, 12, "", { fill: MBLUE });
    cell(ML + huW + pkgW + wtColW + hmColW + commodW, y, ltlW2 / 2, 12, "NMFC #", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    cell(ML + huW + pkgW + wtColW + hmColW + commodW + ltlW2 / 2, y, ltlW2 / 2, 12, "CLASS", { fill: MBLUE, font: "bold", fs: 6, align: "center" });
    y += 12;

    const c2 = ML;
    cell(c2, y, 36, 13, "");
    cell(c2 + 36, y, 54, 13, "");
    cell(c2 + huW, y, 36, 13, "");
    cell(c2 + huW + 36, y, pkgW - 36, 13, "");
    cell(c2 + huW + pkgW, y, wtColW, 13, "");
    cell(c2 + huW + pkgW + wtColW, y, hmColW, 13, "", {});
    acb("hm_p2", c2 + huW + pkgW + wtColW + 7, y + 3, false, 7);
    cell(c2 + huW + pkgW + wtColW + hmColW, y, commodW, 13, "");
    cell(c2 + huW + pkgW + wtColW + hmColW + commodW, y, ltlW2 / 2, 13, "");
    cell(c2 + huW + pkgW + wtColW + hmColW + commodW + ltlW2 / 2, y, ltlW2 / 2, 13, "");
    tf("hu_qty_p2", c2 + 1, y + 1, 34, 11, String(n("hu_qty_p2") || ""), 7.5);
    tf("hu_type_p2", c2 + 37, y + 1, 52, 11, v("hu_type_p2"), 7.5);
    tf("commodity_p2", c2 + huW + pkgW + wtColW + hmColW + 1, y + 1, commodW - 2, 11, v("commodity"), 7);
    y += 13;

    sectionBar(y, "PAGE SUBTOTAL");
  }

  return doc;
}
