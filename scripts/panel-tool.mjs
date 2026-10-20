import http from "node:http";
import matter from "gray-matter";

const html = String.raw`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bjorn panel editor</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 24px auto;
    padding: 0 16px;
    max-width: 1400px;
    font: 16px system-ui;
    background: #fff;
    color: #292722;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
    gap: 24px;
    align-items: start;
  }
  canvas {
    display: block;
    width: 100%;
    height: auto;
    touch-action: none;
    cursor: crosshair;
    border: 1px solid #ddd;
  }
  textarea {
    width: 100%;
    min-height: 520px;
    font: 14px/1.5 monospace;
    padding: 12px;
    tab-size: 2;
  }
  button, select, input { font: inherit; }
  button, select { margin: 5px 5px 5px 0; padding: 6px; }
  .coordinates {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin: 12px 0;
  }
  .coordinates label { display: grid; gap: 4px; }
  .coordinates input { width: 100%; padding: 6px; }
  #status { min-height: 1.5em; }
  #status.error { color: #b42318; }
  #description { white-space: pre-wrap; color: #555; }
  @media (max-width: 850px) {
    .layout { grid-template-columns: 1fr; }
  }
</style>

<h1>Panel editor</h1>
<p>
  Open the original PNG and paste its existing YAML.
  Select a panel to edit its coordinates or redraw its rectangle.
  Alt text stays with the panel.
</p>

<input id="file" type="file" accept="image/png">
<p id="status" role="status"></p>

<div class="layout">
  <div><canvas id="canvas"></canvas></div>
  <section>
    <select id="selection" aria-label="Selected panel"></select>
    <button id="add">Add panel</button>
    <button id="remove">Delete selected</button>
    <p id="mode">Drag to redraw the selected panel.</p>

    <div class="coordinates">
      <label>x <input id="x" type="number" min="0" step="1"></label>
      <label>y <input id="y" type="number" min="0" step="1"></label>
      <label>width <input id="width" type="number" min="1" step="1"></label>
      <label>height <input id="height" type="number" min="1" step="1"></label>
    </div>

    <p id="description"></p>
    <textarea id="yaml" spellcheck="false"
      aria-label="Editable panel YAML"
      placeholder="Paste sourceWidth, sourceHeight and panels here…"></textarea>
    <button id="copy">Copy YAML</button>
  </section>
</div>

<script>
const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const fields = ["x", "y", "width", "height"];

let image = null;
let imageURL = null;
let doc = { panels: [] };
let selected = -1;
let adding = false;
let start = null;
let live = null;
let valid = true;
let busy = false;
let revision = 0;
let timer;

function status(message, error = false) {
  $("status").textContent = message;
  $("status").className = error ? "error" : "";
}

async function api(path, data) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function validate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("YAML must be a mapping containing panels.");

  if (!Array.isArray(value.panels))
    throw new Error("panels must be a YAML list.");

  for (const key of ["sourceWidth", "sourceHeight"]) {
    if (value[key] !== undefined &&
        (!Number.isInteger(value[key]) || value[key] < 1))
      throw new Error(key + " must be a positive integer.");
  }

  const width = image ? image.naturalWidth : value.sourceWidth;
  const height = image ? image.naturalHeight : value.sourceHeight;

  value.panels.forEach((p, i) => {
    if (!p || typeof p !== "object")
      throw new Error("Panel " + (i + 1) + " must be a mapping.");

    for (const key of fields) {
      const minimum = key === "x" || key === "y" ? 0 : 1;
      if (!Number.isInteger(p[key]) || p[key] < minimum)
        throw new Error("Panel " + (i + 1) + ": invalid " + key + ".");
    }

    if (p.alt !== undefined && typeof p.alt !== "string")
      throw new Error("Panel " + (i + 1) + ": alt must be text.");

    if ((width && p.x + p.width > width) ||
        (height && p.y + p.height > height))
      throw new Error("Panel " + (i + 1) + " extends outside the image.");
  });
}

function announce() {
  if (image &&
      ((doc.sourceWidth && doc.sourceWidth !== image.naturalWidth) ||
       (doc.sourceHeight && doc.sourceHeight !== image.naturalHeight))) {
    status("Warning: YAML dimensions differ from the loaded PNG.", true);
  } else {
    status(doc.panels.length + " panel(s). " +
      (image ? "Preview updated." : "Open the PNG to see their bounds."));
  }
}

function controls() {
  const select = $("selection");
  select.replaceChildren();

  doc.panels.forEach((p, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = "Panel " + (i + 1);
    select.append(option);
  });

  select.value = String(selected);
  const p = doc.panels[selected];

  for (const key of fields) {
    $(key).value = p ? p[key] : "";
    $(key).disabled = !p || adding;
  }

  $("remove").disabled = !p || adding;
  $("description").textContent = p && !adding ? (p.alt || "") : "";
  $("mode").textContent = adding
    ? "Drag to add a new panel."
    : "Drag to redraw the selected panel.";
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image) return;

  ctx.drawImage(image, 0, 0);
  ctx.lineWidth = Math.max(2, canvas.width / 500);
  ctx.font = Math.max(20, canvas.width / 50) + "px sans-serif";

  doc.panels.forEach((r, i) => {
    const active = i === selected && !adding;
    ctx.strokeStyle = active ? "#1565c0" : "#ca3924";
    ctx.fillStyle = active ? "#1565c022" : "#ca392412";
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(String(i + 1), r.x + 8, r.y + 30);
  });

  if (live) {
    ctx.strokeStyle = "#138548";
    ctx.strokeRect(live.x, live.y, live.width, live.height);
  }
}

async function parseEditor() {
  const version = ++revision;
  busy = true;

  try {
    const result = await api("/parse", { text: $("yaml").value });
    if (version !== revision) return false;

    validate(result.doc);
    doc = result.doc;
    selected = Math.min(Math.max(selected, 0), doc.panels.length - 1);
    valid = true;
    adding = false;
    controls();
    draw();
    announce();
    return true;
  } catch (error) {
    if (version === revision) {
      valid = false;
      status(error.message + " Last valid preview retained.", true);
    }
    return false;
  } finally {
    if (version === revision) busy = false;
  }
}

async function saveModel(next, nextSelection) {
  if (busy || !valid) return;
  const version = ++revision;
  busy = true;

  try {
    validate(next);
    const result = await api("/serialize", { doc: next });
    if (version !== revision) return;

    doc = next;
    selected = nextSelection;
    $("yaml").value = result.text;
    adding = false;
    controls();
    draw();
    announce();
  } catch (error) {
    if (version === revision) {
      status(error.message, true);
      controls();
      draw();
    }
  } finally {
    if (version === revision) busy = false;
  }
}

$("yaml").addEventListener("input", () => {
  ++revision;
  busy = true;
  clearTimeout(timer);
  timer = setTimeout(parseEditor, 250);
});

$("selection").onchange = () => {
  if (busy || !valid) return;
  selected = Number($("selection").value);
  adding = false;
  controls();
  draw();
};

for (const key of fields) {
  $(key).onchange = () => {
    if (busy || !valid || !doc.panels[selected]) return;
    const next = structuredClone(doc);

    for (const field of fields) {
      if ($(field).value === "") {
        status("Coordinates cannot be blank.", true);
        return;
      }
      next.panels[selected][field] = Number($(field).value);
    }

    saveModel(next, selected);
  };
}

$("add").onclick = () => {
  if (busy || !valid) return;
  adding = true;
  controls();
  draw();
};

$("remove").onclick = () => {
  if (busy || !valid || selected < 0) return;
  const next = structuredClone(doc);
  next.panels.splice(selected, 1);
  saveModel(next, Math.min(selected, next.panels.length - 1));
};

$("file").onchange = () => {
  const file = $("file").files[0];
  if (!file) return;

  if (imageURL) URL.revokeObjectURL(imageURL);
  imageURL = URL.createObjectURL(file);

  const nextImage = new Image();
  nextImage.onload = async () => {
    image = nextImage;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    if (!$("yaml").value.trim()) {
      await saveModel({
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
        panels: []
      }, -1);
    } else {
      await parseEditor();
    }

    draw();
  };
  nextImage.onerror = () => status("Could not open this image.", true);
  nextImage.src = imageURL;
};

function point(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width,
      Math.round((event.clientX - box.left) * canvas.width / box.width))),
    y: Math.max(0, Math.min(canvas.height,
      Math.round((event.clientY - box.top) * canvas.height / box.height)))
  };
}

function rectangle(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

canvas.onpointerdown = event => {
  if (!image || busy || !valid) return;
  if (!adding && selected < 0) adding = true;
  start = point(event);
  canvas.setPointerCapture(event.pointerId);
};

canvas.onpointermove = event => {
  if (!start) return;
  live = rectangle(start, point(event));
  draw();
};

canvas.onpointerup = event => {
  if (!start) return;

  const r = rectangle(start, point(event));
  start = null;
  live = null;

  if (!r.width || !r.height) {
    draw();
    return;
  }

  const next = structuredClone(doc);
  next.sourceWidth ??= image.naturalWidth;
  next.sourceHeight ??= image.naturalHeight;

  let index = selected;
  if (adding || selected < 0) {
    index = next.panels.length;
    next.panels.push({ ...r, alt: "" });
  } else {
    // Preserve alt text and all other existing panel properties.
    Object.assign(next.panels[selected], r);
  }

  saveModel(next, index);
};

canvas.onpointercancel = () => {
  start = null;
  live = null;
  draw();
};

$("copy").onclick = async () => {
  clearTimeout(timer);
  if (!await parseEditor()) return;

  try {
    await navigator.clipboard.writeText($("yaml").value);
    status("Copied YAML.");
  } catch {
    $("yaml").select();
    status("Press Command+C to copy the selected YAML.");
  }
};

controls();
</script>
</html>`;

http.createServer(async (req, res) => {
  const send = (code, value) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };

  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method !== "POST" ||
      !["/parse", "/serialize"].includes(req.url)) {
    send(404, { error: "Not found" });
    return;
  }

  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1_000_000)
        throw new Error("YAML is too large.");
    }

    const data = JSON.parse(body);

    if (req.url === "/parse") {
      const text = String(data.text || "").trim();
      const wrapped = text.startsWith("---")
        ? text
        : "---\n" + text + "\n---\n";
      send(200, { doc: matter(wrapped).data });
    } else {
      const wrapped = matter.stringify("", data.doc);
      const text = wrapped
        .replace(/^---\r?\n/, "")
        .replace(/\r?\n---(?:\r?\n)?$/, "");
      send(200, { text });
    }
  } catch (error) {
    send(400, { error: error.message });
  }
}).listen(4322, "127.0.0.1", () => {
  console.log("Panel editor: http://localhost:4322");
});
