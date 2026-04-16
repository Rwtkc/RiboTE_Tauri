import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface SvgExportOptions {
  width?: number;
  height?: number;
  dpi?: number;
  exportPadding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}

export async function createSvgPngBlob(svg: SVGSVGElement, options: SvgExportOptions = {}) {
  const { canvas } = await renderSvgToCanvas(svg, options);
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png");
  });
  return pngBlob;
}

export async function createSvgPdfBlob(svg: SVGSVGElement, options: SvgExportOptions = {}) {
  const { clone, width, height } = cloneSvgForExport(svg, options);
  normalizePdfTextFonts(clone);
  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    compress: true
  });
  pdf.setFont("helvetica", "normal");
  await svg2pdf(clone, pdf, { x: 0, y: 0, width, height });
  return pdf.output("blob");
}

async function renderSvgToCanvas(svg: SVGSVGElement, options: SvgExportOptions = {}) {
  const { clone, width, height } = cloneSvgForExport(svg, options);
  const serialized = new XMLSerializer().serializeToString(clone);
  const blobUrl = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadImage(blobUrl);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable.");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function cloneSvgForExport(svg: SVGSVGElement, options: SvgExportOptions = {}) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedSvgTextStyles(svg, clone);
  const intrinsic = getSvgIntrinsicSize(svg);
  const padding = normalizeExportPadding(options.exportPadding);
  const sourceWidth = intrinsic.width + padding.left + padding.right;
  const sourceHeight = intrinsic.height + padding.top + padding.bottom;
  const targetWidth = Math.max(1, options.width || sourceWidth);
  const targetHeight = Math.max(1, options.height || sourceHeight);
  const scale = Math.min(targetWidth / Math.max(1, sourceWidth), targetHeight / Math.max(1, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * (Number.isFinite(scale) && scale > 0 ? scale : 1)));
  const height = Math.max(1, Math.round(sourceHeight * (Number.isFinite(scale) && scale > 0 ? scale : 1)));

  clone.setAttribute("viewBox", `${-padding.left} ${-padding.top} ${sourceWidth} ${sourceHeight}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("x", String(-padding.left));
  background.setAttribute("y", String(-padding.top));
  background.setAttribute("width", String(sourceWidth));
  background.setAttribute("height", String(sourceHeight));
  background.setAttribute("fill", "#f7fbfc");
  clone.insertBefore(background, clone.firstChild);

  return { clone, width, height };
}

function normalizePdfTextFonts(svg: SVGSVGElement) {
  svg.querySelectorAll("text").forEach((node) => {
    const family = resolveSvgExportFontFamily(node.getAttribute("font-family"));
    const weight = normalizeSvgExportFontWeight(node.getAttribute("font-weight"));
    node.setAttribute("font-family", family);
    node.setAttribute("font-weight", weight);
    node.setAttribute("font-style", "normal");
    const styleMap = parseStyleAttribute(node.getAttribute("style"));
    styleMap["font-family"] = family;
    styleMap["font-weight"] = weight;
    styleMap["font-style"] = "normal";
    node.setAttribute("style", serializeStyleAttribute(styleMap));
  });
}
function getSvgIntrinsicSize(svg: SVGSVGElement) {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const widthAttr = Number(svg.getAttribute("width"));
  const heightAttr = Number(svg.getAttribute("height"));
  if (widthAttr > 0 && heightAttr > 0) {
    return { width: widthAttr, height: heightAttr };
  }

  return {
    width: Math.max(1, svg.clientWidth || 1200),
    height: Math.max(1, svg.clientHeight || 700)
  };
}

function normalizeExportPadding(padding: SvgExportOptions["exportPadding"]) {
  return {
    top: Math.max(0, Number(padding?.top) || 0),
    right: Math.max(0, Number(padding?.right) || 0),
    bottom: Math.max(0, Number(padding?.bottom) || 0),
    left: Math.max(0, Number(padding?.left) || 0)
  };
}

function inlineComputedSvgTextStyles(sourceSvg: SVGSVGElement, targetSvg: SVGSVGElement) {
  const sourceTextNodes = Array.from(sourceSvg.querySelectorAll("text"));
  const targetTextNodes = Array.from(targetSvg.querySelectorAll("text"));

  for (let index = 0; index < Math.min(sourceTextNodes.length, targetTextNodes.length); index += 1) {
    const computed = window.getComputedStyle(sourceTextNodes[index]);
    const target = targetTextNodes[index];
    const source = sourceTextNodes[index];
    const fontFamily = resolveSvgExportFontFamily(computed.fontFamily || source.getAttribute("font-family"));
    const fontSize = computed.fontSize || getSvgTextValue(source, "font-size") || "16px";
    const fontWeight = normalizeSvgExportFontWeight(computed.fontWeight || getSvgTextValue(source, "font-weight") || "400");
    const fill = computed.fill || getSvgTextValue(source, "fill") || "#17292f";

    target.setAttribute("font-family", fontFamily);
    target.setAttribute("font-size", fontSize);
    target.setAttribute("font-weight", fontWeight);
    target.setAttribute("fill", fill);
    target.setAttribute("text-anchor", computed.textAnchor || source.getAttribute("text-anchor") || "start");
    target.setAttribute("dominant-baseline", computed.dominantBaseline || source.getAttribute("dominant-baseline") || "alphabetic");
    target.setAttribute("font-style", "normal");

    const styleMap = parseStyleAttribute(target.getAttribute("style"));
    styleMap["font-family"] = fontFamily;
    styleMap["font-size"] = fontSize;
    styleMap["font-weight"] = fontWeight;
    styleMap.fill = fill;
    target.setAttribute("style", serializeStyleAttribute(styleMap));
  }
}

function getSvgTextValue(node: Element, name: string) {
  let current: Element | null = node;
  while (current) {
    const explicit = current.getAttribute(name);
    if (explicit != null) {
      return explicit;
    }
    const styleMap = parseStyleAttribute(current.getAttribute("style"));
    if (styleMap[name] != null) {
      return styleMap[name];
    }
    current = current.parentElement;
  }
  return null;
}

function parseStyleAttribute(styleText: string | null) {
  return String(styleText || "").split(";").map((part) => part.trim()).filter(Boolean).reduce<Record<string, string>>((accumulator, entry) => {
    const splitIndex = entry.indexOf(":");
    if (splitIndex === -1) {
      return accumulator;
    }
    accumulator[entry.slice(0, splitIndex).trim()] = entry.slice(splitIndex + 1).trim();
    return accumulator;
  }, {});
}

function serializeStyleAttribute(styleMap: Record<string, string>) {
  return Object.entries(styleMap)
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");
}

function resolveSvgExportFontFamily(value: string | null) {
  const family = String(value || "").toLowerCase();
  if (
    !family ||
    family === "inherit" ||
    family.includes("sans-serif") ||
    family.includes("system-ui") ||
    family.includes("var(") ||
    family.includes("--app-") ||
    family.includes("segoe ui") ||
    family.includes("arial") ||
    family.includes("helvetica")
  ) {
    return "sans-serif";
  }
  return value || "sans-serif";
}

function normalizeSvgExportFontWeight(value: string | null) {
  const normalized = String(value || "400").trim().toLowerCase();
  if (normalized === "bold" || normalized === "bolder") {
    return "700";
  }
  const numeric = Number.parseInt(normalized, 10);
  if (!Number.isFinite(numeric)) {
    return "400";
  }
  return numeric >= 600 ? "700" : "400";
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load SVG for export."));
    image.src = url;
  });
}
