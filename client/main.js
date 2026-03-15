import "./styles.css";

// Set up the interactive world map inside a container element
async function initInteractiveMap(container) {
  // Get visited country codes from the server
  const visitedRaw = container.dataset.visited || "";
  const visitedSet = new Set(
    visitedRaw
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
  );

  // Coming soon: Get combined visit data for the family map
  const combinedRaw = container.dataset.combined;
  let combinedArr = null;

  try {
    combinedArr = combinedRaw ? JSON.parse(combinedRaw) : null;
  } catch {
    combinedArr = null;
  }

  // Store combined visit data by country code
  const combinedMap = new Map();
  if (Array.isArray(combinedArr)) {
    combinedArr.forEach((row) => {
      const code = (row.country_code || "").toUpperCase();
      if (!code) return;
      combinedMap.set(code, row.visitors || []);
    });
  }

  // Check if this is the family map view
  const isCombinedMode = combinedMap.size > 0;

  // Load the SVG world map
  let svgText;
  try {
    const res = await fetch("/world.svg");
    if (!res.ok) throw new Error("Map load failed");
    svgText = await res.text();
  } catch (err) {
    console.error("Error loading world map:", err);
    container.textContent = "Map failed to load.";
    return;
  }

  // Add the SVG into the container
  container.innerHTML = svgText;
  const svg = container.querySelector("svg");
  if (!svg) return;

  container.classList.add("map-interactive");
  container.style.position = "relative";

  // Create tooltip element
  const tooltip = document.createElement("div");
  tooltip.className = "map-tooltip";
  tooltip.style.opacity = "0";
  container.appendChild(tooltip);

  // Main colors used for the map
  const accent =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#ec4899";

  const baseFill = "#020617";
  const hoverFill = "#1f2937";

  // Create SVG defs for map patterns
  const SVG_NS = "http://www.w3.org/2000/svg";
  let defs = svg.querySelector("defs");

  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    svg.prepend(defs);
  }

  // Coming soon: Create a polka-dot pattern for countries visited by multiple users
  function makePolkaPattern(code, colors) {
    const patternId = `pattern-${code}`;
    let pattern = svg.querySelector(`#${patternId}`);
    if (pattern) return `url(#${patternId})`;

    pattern = document.createElementNS(SVG_NS, "pattern");
    pattern.setAttribute("id", patternId);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", "12");
    pattern.setAttribute("height", "12");

    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("width", "12");
    bg.setAttribute("height", "12");
    bg.setAttribute("fill", baseFill);
    pattern.appendChild(bg);

    const positions = [
      [3, 3],
      [9, 3],
      [3, 9],
      [9, 9]
    ];

    colors.slice(0, 4).forEach((col, idx) => {
      const [cx, cy] = positions[idx];
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", "2");
      circle.setAttribute("fill", col || accent);
      pattern.appendChild(circle);
    });

    defs.appendChild(pattern);
    return `url(#${patternId})`;
  }

  // Get all country paths from the SVG
  const paths = svg.querySelectorAll("g#countries path[id]");

  paths.forEach((path) => {
    const code = path.id.toUpperCase();
    const name = path.getAttribute("title") || code;

    // Check if the current user has visited this country
    let isVisited = visitedSet.has(code);

    // Get family visitors for this country
    const visitors = combinedMap.get(code) || [];

    // Get the correct fill color or pattern for a country
    function getBaseFill() {
      if (!isCombinedMode) {
        return isVisited ? accent : baseFill;
      }

      if (visitors.length === 0) return baseFill;

      if (visitors.length === 1) {
        return visitors[0].color || accent;
      }

      const colors = visitors.map((v) => v.color || accent);
      return makePolkaPattern(code, colors);
    }

    // Apply fill color to the country
    function applyFill(isHover) {
      if (isCombinedMode) {
        path.style.fill = getBaseFill();
        return;
      }

      if (isHover) {
        path.style.fill = isVisited ? accent : hoverFill;
      } else {
        path.style.fill = getBaseFill();
      }
    }

    // Set initial path styling
    path.classList.add("map-country");
    path.style.stroke = "white";
    path.style.strokeWidth = "0.4";
    path.style.cursor = "pointer";
    applyFill(false);

    // Show tooltip on hover
    path.addEventListener("mouseenter", () => {
      tooltip.textContent = name;
      tooltip.style.opacity = "1";
      applyFill(true);
    });

    // Hide tooltip when leaving
    path.addEventListener("mouseleave", () => {
      tooltip.style.opacity = "0";
      applyFill(false);
    });

    // Move tooltip with the cursor
    path.addEventListener("mousemove", (event) => {
      const rect = container.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth || 0;
      const tooltipHeight = tooltip.offsetHeight || 0;

      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      let x = cursorX + 12;
      let y = cursorY - tooltipHeight - 8;

      if (x + tooltipWidth > rect.width - 8) {
        x = rect.width - tooltipWidth - 8;
      }
      if (x < 8) x = 8;

      if (y < 8) y = cursorY + 16;

      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    });

    // Allow click-to-toggle only on the personal map
    if (!isCombinedMode) {
      path.addEventListener("click", async () => {
        const previous = isVisited;
        const next = !previous;

        // Update the UI before saving
        isVisited = next;
        if (isVisited) {
          visitedSet.add(code);
        } else {
          visitedSet.delete(code);
        }
        applyFill(false);

        try {
          const res = await fetch("/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code })
          });

          const data = await res.json();

          if (!res.ok || data?.error) {
            console.error("Toggle failed:", data?.error);

            // Revert if the request fails
            isVisited = previous;
            if (previous) visitedSet.add(code);
            else visitedSet.delete(code);
            applyFill(false);
          }
        } catch (err) {
          console.error("Network/server error while toggling:", err);

          // Revert if there is a network error
          isVisited = previous;
          if (previous) visitedSet.add(code);
          else visitedSet.delete(code);
          applyFill(false);
        }
      });
    }
  });
}

// Load the full map when the page is ready
document.addEventListener("DOMContentLoaded", () => {
  const full = document.getElementById("world-map-full");

  if (full) {
    initInteractiveMap(full);
  }
});
