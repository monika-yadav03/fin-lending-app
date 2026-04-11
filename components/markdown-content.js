"use client";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(text) {
  const cleaned = String(text || "").replace(/\*\*/g, "");
  const lines = cleaned.split(/\r?\n/);
  let html = "";
  let inUl = false;
  let inOl = false;
  const labelMatch =
    /^(Summary|Key Points|Risks\/Assumptions|Risks|Assumptions|Next Steps|Table)\s*:\s*(.*)$/i;

  const closeLists = () => {
    if (inUl) {
      html += "</ul>";
      inUl = false;
    }
    if (inOl) {
      html += "</ol>";
      inOl = false;
    }
  };

  const isTableSeparator = (line) =>
    /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
  const isTableRow = (line) => /\|/.test(line);
  const parseRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const safeLine = escapeHtml(line);

    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      closeLists();
      const headerCells = parseRow(line);
      i += 2;
      const bodyRows = [];

      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        isTableRow(lines[i])
      ) {
        bodyRows.push(parseRow(lines[i]));
        i += 1;
      }

      i -= 1;
      html += '<div class="md-table-wrap"><table class="md-table"><thead><tr>';

      for (const cell of headerCells) {
        html += `<th>${cell}</th>`;
      }

      html += "</tr></thead><tbody>";

      for (const row of bodyRows) {
        html += "<tr>";

        for (let c = 0; c < row.length; c += 1) {
          const cell = row[c];
          const label = headerCells[c] || "";
          html += `<td data-label="${label}">${cell}</td>`;
        }

        html += "</tr>";
      }

      html += "</tbody></table></div>";
      continue;
    }

    if (/^#{3}\s+/.test(line)) {
      closeLists();
      html += `<h3>${escapeHtml(line.replace(/^#{3}\s+/, ""))}</h3>`;
      continue;
    }

    if (/^#{2}\s+/.test(line)) {
      closeLists();
      html += `<h2>${escapeHtml(line.replace(/^#{2}\s+/, ""))}</h2>`;
      continue;
    }

    if (/^#\s+/.test(line)) {
      closeLists();
      html += `<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`;
      continue;
    }

    if (/^(\*|-)\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        html += "<ul>";
        inUl = true;
      }

      html += `<li>${escapeHtml(line.replace(/^(\*|-)\s+/, ""))}</li>`;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        html += "<ol>";
        inOl = true;
      }

      html += `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`;
      continue;
    }

    if (line.trim() === "") {
      closeLists();
      html += "<br />";
      continue;
    }

    closeLists();
    const labelParts = line.match(labelMatch);

    if (labelParts) {
      const label = escapeHtml(labelParts[1]);
      const rest = escapeHtml(labelParts[2] || "");
      html += `<p><span class="md-label">${label}:</span> ${rest}</p>`;
    } else {
      html += `<p>${safeLine}</p>`;
    }
  }

  closeLists();
  return html;
}

export default function MarkdownContent({ text = "", className = "ai-content" }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}
