/**
 * Minimal client-side PDF builder (no dependencies).
 * Generates a multi-page letter PDF with Helvetica text.
 */
(function (global) {
  "use strict";

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 54;
  const LINE_H = 16;
  const TITLE_SIZE = 18;
  const HEAD_SIZE = 13;
  const BODY_SIZE = 11;
  const META_SIZE = 9;

  function pdfEscape(str) {
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  /** Helvetica Type1 — keep printable ASCII for a clean single-byte PDF. */
  function toPdfText(str) {
    return String(str || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function wrapLines(text, maxChars) {
    const words = toPdfText(text).split(" ").filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > maxChars && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  function buildPdf(lines) {
    // lines: { text, size, gapAfter?, bold? }
    const contentParts = [];
    let y = PAGE_H - MARGIN;
    let pageStreams = [];

    function flushPage() {
      const stream = contentParts.join("\n");
      pageStreams.push(stream);
      contentParts.length = 0;
      y = PAGE_H - MARGIN;
    }

    function ensureSpace(needed) {
      if (y - needed < MARGIN) flushPage();
    }

    for (const line of lines) {
      const size = line.size || BODY_SIZE;
      const gap = line.gapAfter ?? 4;
      ensureSpace(size + gap + 4);
      const x = MARGIN + (line.indent || 0);
      const safe = pdfEscape(line.text);
      contentParts.push("BT");
      contentParts.push(`/F1 ${size} Tf`);
      contentParts.push(`${x} ${y - size} Td`);
      contentParts.push(`(${safe}) Tj`);
      contentParts.push("ET");
      y -= size + gap;
    }
    flushPage();

    const objects = [];
    const offsets = [0];

    function addObj(body) {
      objects.push(body);
      return objects.length;
    }

    const fontId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const pageIds = [];
    const contentIds = [];

    for (const stream of pageStreams) {
      const len = new TextEncoder().encode(stream).length;
      contentIds.push(
        addObj(`<< /Length ${len} >>\nstream\n${stream}\nendstream`)
      );
    }

    const pagesKids = [];
    for (let i = 0; i < contentIds.length; i++) {
      const pageId = addObj(
        `<< /Type /Page /Parent PAGES_ID 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
          `/Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
      );
      pageIds.push(pageId);
      pagesKids.push(`${pageId} 0 R`);
    }

    const pagesId = addObj(
      `<< /Type /Pages /Kids [${pagesKids.join(" ")}] /Count ${pageIds.length} >>`
    );
    const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    // Patch Parent refs
    for (let i = 0; i < objects.length; i++) {
      objects[i] = objects[i].replace(/PAGES_ID/g, String(pagesId));
    }

    let pdf = "%PDF-1.4\n";
    for (let i = 0; i < objects.length; i++) {
      offsets[i + 1] = pdf.length;
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
    pdf += `startxref\n${xrefPos}\n%%EOF`;
    return pdf;
  }

  function money(n) {
    const v = Number(n) || 0;
    return `$${v.toFixed(2)}`;
  }

  function nameOf(roommates, id) {
    return roommates.find((r) => r.id === id)?.name || "Unknown";
  }

  /**
   * Build a Roommate Arbiter verdict PDF and trigger download.
   * @param {object} result - { verdict, settlements, balances, judge }
   * @param {object} ctx - { roommates, expenses, meals, gripes }
   */
  function downloadVerdictPdf(result, ctx) {
    const roommates = ctx.roommates || [];
    const expenses = ctx.expenses || [];
    const meals = ctx.meals || [];
    const gripes = ctx.gripes || [];
    const when = new Date().toLocaleString();
    const maxChars = 78;

    const lines = [];
    const push = (text, opts = {}) => lines.push({ text: toPdfText(text), ...opts });
    const pushWrapped = (text, opts = {}) => {
      for (const part of wrapLines(text, opts.maxChars || maxChars)) {
        push(part, { size: opts.size || BODY_SIZE, gapAfter: opts.gapAfter ?? 3, indent: opts.indent });
      }
      if (opts.sectionGap) push("", { size: 4, gapAfter: opts.sectionGap });
    };

    push("Roommate Arbiter", { size: TITLE_SIZE, gapAfter: 6 });
    push("Official Verdict & Settlement Record", { size: HEAD_SIZE, gapAfter: 8 });
    push(`Ruled by ${result.judge || "The Arbiter"}  ·  ${when}`, {
      size: META_SIZE,
      gapAfter: 16,
    });

    push("The Ruling", { size: HEAD_SIZE, gapAfter: 8 });
    pushWrapped(result.verdict || "No verdict text.", { sectionGap: 10 });

    push("Who Pays Who", { size: HEAD_SIZE, gapAfter: 8 });
    const settlements = result.settlements || [];
    if (settlements.length === 0) {
      pushWrapped("Everyone is square. No transfers required.", { sectionGap: 10 });
    } else {
      for (const s of settlements) {
        pushWrapped(
          `${nameOf(roommates, s.from)} pays ${nameOf(roommates, s.to)}  —  ${money(s.amount)}`,
          { gapAfter: 4 }
        );
      }
      push("", { size: 4, gapAfter: 10 });
    }

    push("Scoreboard", { size: HEAD_SIZE, gapAfter: 8 });
    for (const r of roommates) {
      const bal = (result.balances && result.balances[r.id]) || 0;
      const label = bal > 0.01 ? "gets paid" : bal < -0.01 ? "owes" : "even";
      pushWrapped(`${r.name}: ${label} ${money(Math.abs(bal))}`, { gapAfter: 4 });
    }
    push("", { size: 4, gapAfter: 10 });

    push("Receipts on Record", { size: HEAD_SIZE, gapAfter: 8 });
    if (expenses.length === 0) {
      pushWrapped("No expenses logged.", { sectionGap: 8 });
    } else {
      for (const e of expenses) {
        pushWrapped(
          `${money(e.amount)} — ${e.description || e.desc || "expense"} (paid by ${nameOf(roommates, e.payerId)})`,
          { gapAfter: 4 }
        );
      }
      push("", { size: 4, gapAfter: 10 });
    }

    if (meals.length) {
      push("Snacc Confessions", { size: HEAD_SIZE, gapAfter: 8 });
      for (const m of meals) {
        pushWrapped(
          `${nameOf(roommates, m.eaterId)} ate ${m.item} (share ${m.share})`,
          { gapAfter: 4 }
        );
      }
      push("", { size: 4, gapAfter: 10 });
    }

    if (gripes.length) {
      push("Grievances Filed", { size: HEAD_SIZE, gapAfter: 8 });
      for (const g of gripes) {
        pushWrapped(`${nameOf(roommates, g.authorId)}: ${g.text}`, { gapAfter: 4 });
      }
      push("", { size: 4, gapAfter: 10 });
    }

    push("Not legal advice. Binding only in the kitchen.", {
      size: META_SIZE,
      gapAfter: 4,
    });

    const pdf = buildPdf(lines);
    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `roommate-arbiter-verdict-${stamp}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  global.RAPdf = { downloadVerdictPdf, buildPdf, toPdfText };
})(typeof window !== "undefined" ? window : globalThis);
