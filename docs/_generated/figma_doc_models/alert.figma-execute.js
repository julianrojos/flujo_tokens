const PAYLOAD = {"model":{"version":2,"componentName":"alert","markdownPath":"docs/components/alert.md","title":"Alert","blocks":[{"type":"heading","level":1,"text":"Alert","segments":[{"text":"Alert","style":"normal"}]},{"type":"paragraph","text":"The Alert component communicates concise feedback messages in a highly visible inline block.","segments":[{"text":"The ","style":"normal"},{"text":"Alert","style":"bold"},{"text":" component communicates concise feedback messages in a highly visible inline block.","style":"normal"}]},{"type":"heading","level":2,"text":"Overview","segments":[{"text":"Overview","style":"normal"}]},{"type":"paragraph","text":"In Figma, this component is defined as a COMPONENT_SET (Alert) with one variant property:","segments":[{"text":"In Figma, this component is defined as a ","style":"normal"},{"text":"COMPONENT_SET","style":"code"},{"text":" (","style":"normal"},{"text":"Alert","style":"code"},{"text":") with one variant property:","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Type: Information, Warning, Positive","segments":[{"text":"Type","style":"code"},{"text":": ","style":"normal"},{"text":"Information","style":"code"},{"text":", ","style":"normal"},{"text":"Warning","style":"code"},{"text":", ","style":"normal"},{"text":"Positive","style":"code"}]}]},{"type":"paragraph","text":"All variants share the same structure, spacing, and typography. Visual meaning is conveyed through semantic border and icon color tokens.","segments":[{"text":"All variants share the same structure, spacing, and typography. Visual meaning is conveyed through semantic border and icon color tokens.","style":"normal"}]},{"type":"paragraph","text":"Source: [Alert in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892)","segments":[{"text":"Source: [Alert in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892)","style":"normal"}]},{"type":"heading","level":2,"text":"Anatomy","segments":[{"text":"Anatomy","style":"normal"}]},{"type":"paragraph","text":"Each alert contains:","segments":[{"text":"Each alert contains:","style":"normal"}]},{"type":"list","ordered":true,"items":[{"index":1,"text":"Container (Auto Layout, horizontal)","segments":[{"text":"Container","style":"bold"},{"text":" (","style":"normal"},{"text":"Auto Layout","style":"code"},{"text":", horizontal)","style":"normal"}]},{"index":2,"text":"Leading icon (24 x 24, internal vector 18 x 18)","segments":[{"text":"Leading icon","style":"bold"},{"text":" (","style":"normal"},{"text":"24 x 24","style":"code"},{"text":", internal vector ","style":"normal"},{"text":"18 x 18","style":"code"},{"text":")","style":"normal"}]},{"index":3,"text":"Text container with a single message text node","segments":[{"text":"Text container","style":"bold"},{"text":" with a single message text node","style":"normal"}]}]},{"type":"paragraph","text":"Current variant dimensions in Figma:","segments":[{"text":"Current variant dimensions in Figma:","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Type=Information: 383 x 38","segments":[{"text":"Type=Information","style":"code"},{"text":": ","style":"normal"},{"text":"383 x 38","style":"code"}]},{"text":"Type=Warning: 383 x 38","segments":[{"text":"Type=Warning","style":"code"},{"text":": ","style":"normal"},{"text":"383 x 38","style":"code"}]},{"text":"Type=Positive: 383 x 38","segments":[{"text":"Type=Positive","style":"code"},{"text":": ","style":"normal"},{"text":"383 x 38","style":"code"}]}]},{"type":"heading","level":2,"text":"Component API","segments":[{"text":"Component API","style":"normal"}]},{"type":"heading","level":3,"text":"Properties","segments":[{"text":"Properties","style":"normal"}]},{"type":"table","header":["Name","Type","Default","Required","Description"],"headerSegments":[[{"text":"Name","style":"normal"}],[{"text":"Type","style":"normal"}],[{"text":"Default","style":"normal"}],[{"text":"Required","style":"normal"}],[{"text":"Description","style":"normal"}]],"rows":[["Type","VARIANT","Information","true","Semantic alert type. Options: Information, Warning, Positive."],["Change_Message_Text","TEXT","Text text text","TBD","Overrides the main alert message copy."]],"rowSegments":[[[{"text":"Type","style":"code"}],[{"text":"VARIANT","style":"code"}],[{"text":"Information","style":"code"}],[{"text":"true","style":"code"}],[{"text":"Semantic alert type. Options: ","style":"normal"},{"text":"Information","style":"code"},{"text":", ","style":"normal"},{"text":"Warning","style":"code"},{"text":", ","style":"normal"},{"text":"Positive","style":"code"},{"text":".","style":"normal"}]],[[{"text":"Change_Message_Text","style":"code"}],[{"text":"TEXT","style":"code"}],[{"text":"Text text text","style":"code"}],[{"text":"TBD","style":"code"}],[{"text":"Overrides the main alert message copy.","style":"normal"}]]]},{"type":"heading","level":2,"text":"Visual Specifications","segments":[{"text":"Visual Specifications","style":"normal"}]},{"type":"heading","level":3,"text":"Container","segments":[{"text":"Container","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Layout: Auto Layout, HORIZONTAL","segments":[{"text":"Layout","style":"bold"},{"text":": Auto Layout, ","style":"normal"},{"text":"HORIZONTAL","style":"code"}]},{"text":"Item spacing: 8px","segments":[{"text":"Item spacing","style":"bold"},{"text":": ","style":"normal"},{"text":"8px","style":"code"}]},{"text":"Padding: 7px top and bottom, 8px left and right","segments":[{"text":"Padding","style":"bold"},{"text":": ","style":"normal"},{"text":"7px","style":"code"},{"text":" top and bottom, ","style":"normal"},{"text":"8px","style":"code"},{"text":" left and right","style":"normal"}]},{"text":"Corner radius: 8px","segments":[{"text":"Corner radius","style":"bold"},{"text":": ","style":"normal"},{"text":"8px","style":"code"}]},{"text":"Border: 2px, aligned INSIDE","segments":[{"text":"Border","style":"bold"},{"text":": ","style":"normal"},{"text":"2px","style":"code"},{"text":", aligned ","style":"normal"},{"text":"INSIDE","style":"code"}]},{"text":"Background token: Color/Background/Feedback/Default","segments":[{"text":"Background token","style":"bold"},{"text":": ","style":"normal"},{"text":"Color/Background/Feedback/Default","style":"code"}]},{"text":"Background fallback: #FFFFFF","segments":[{"text":"Background fallback","style":"bold"},{"text":": ","style":"normal"},{"text":"#FFFFFF","style":"code"}]}]},{"type":"heading","level":3,"text":"Typography","segments":[{"text":"Typography","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Text style: Regular/Body 16","segments":[{"text":"Text style","style":"bold"},{"text":": ","style":"normal"},{"text":"Regular/Body 16","style":"code"}]},{"text":"Font: Nunito Sans Regular","segments":[{"text":"Font","style":"bold"},{"text":": ","style":"normal"},{"text":"Nunito Sans Regular","style":"code"}]},{"text":"Size / line height: 16 / 24","segments":[{"text":"Size / line height","style":"bold"},{"text":": ","style":"normal"},{"text":"16 / 24","style":"code"}]},{"text":"Letter spacing: 0%","segments":[{"text":"Letter spacing","style":"bold"},{"text":": ","style":"normal"},{"text":"0%","style":"code"}]},{"text":"Text color token: Color/Text/Neutral/Default","segments":[{"text":"Text color token","style":"bold"},{"text":": ","style":"normal"},{"text":"Color/Text/Neutral/Default","style":"code"}]},{"text":"Text color fallback: #483F3F","segments":[{"text":"Text color fallback","style":"bold"},{"text":": ","style":"normal"},{"text":"#483F3F","style":"code"}]}]},{"type":"heading","level":3,"text":"Iconography","segments":[{"text":"Iconography","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Icon container size: 24 x 24","segments":[{"text":"Icon container size","style":"bold"},{"text":": ","style":"normal"},{"text":"24 x 24","style":"code"}]},{"text":"Internal vector size: 18 x 18","segments":[{"text":"Internal vector size","style":"bold"},{"text":": ","style":"normal"},{"text":"18 x 18","style":"code"}]}]},{"type":"heading","level":3,"text":"Token Mapping","segments":[{"text":"Token Mapping","style":"normal"}]},{"type":"table","header":["Part","Condition","Token","Fallback"],"headerSegments":[[{"text":"Part","style":"normal"}],[{"text":"Condition","style":"normal"}],[{"text":"Token","style":"normal"}],[{"text":"Fallback","style":"normal"}]],"rows":[["container.background","all variants","Color/Background/Feedback/Default","#FFFFFF"],["text.color","all variants","Color/Text/Neutral/Default","#483F3F"]],"rowSegments":[[[{"text":"container.background","style":"code"}],[{"text":"all variants","style":"normal"}],[{"text":"Color/Background/Feedback/Default","style":"code"}],[{"text":"#FFFFFF","style":"code"}]],[[{"text":"text.color","style":"code"}],[{"text":"all variants","style":"normal"}],[{"text":"Color/Text/Neutral/Default","style":"code"}],[{"text":"#483F3F","style":"code"}]]]},{"type":"heading","level":2,"text":"Variants","segments":[{"text":"Variants","style":"normal"}]},{"type":"table","header":["Variant","Differentiating token(s)","Fallback value(s)","Visual indicator"],"headerSegments":[[{"text":"Variant","style":"normal"}],[{"text":"Differentiating token(s)","style":"normal"}],[{"text":"Fallback value(s)","style":"normal"}],[{"text":"Visual indicator","style":"normal"}]],"rows":[["Information","Color/Border/Feedback/Information, Color/Icon/Feedback/Information","#BAA06B, #9D8555","information-circle-contained icon + information border"],["Warning","Color/Border/Feedback/Danger, Color/Icon/Feedback/Danger","#B22222, #B22222","x-circle-contained icon + warning border"],["Positive","Color/Border/Feedback/Success, Color/Icon/Feedback/Success","#299157, #299157","check-contained icon + success border"]],"rowSegments":[[[{"text":"Information","style":"code"}],[{"text":"Color/Border/Feedback/Information","style":"code"},{"text":", ","style":"normal"},{"text":"Color/Icon/Feedback/Information","style":"code"}],[{"text":"#BAA06B","style":"code"},{"text":", ","style":"normal"},{"text":"#9D8555","style":"code"}],[{"text":"information-circle-contained","style":"code"},{"text":" icon + information border","style":"normal"}]],[[{"text":"Warning","style":"code"}],[{"text":"Color/Border/Feedback/Danger","style":"code"},{"text":", ","style":"normal"},{"text":"Color/Icon/Feedback/Danger","style":"code"}],[{"text":"#B22222","style":"code"},{"text":", ","style":"normal"},{"text":"#B22222","style":"code"}],[{"text":"x-circle-contained","style":"code"},{"text":" icon + warning border","style":"normal"}]],[[{"text":"Positive","style":"code"}],[{"text":"Color/Border/Feedback/Success","style":"code"},{"text":", ","style":"normal"},{"text":"Color/Icon/Feedback/Success","style":"code"}],[{"text":"#299157","style":"code"},{"text":", ","style":"normal"},{"text":"#299157","style":"code"}],[{"text":"check-contained","style":"code"},{"text":" icon + success border","style":"normal"}]]]},{"type":"heading","level":2,"text":"States","segments":[{"text":"States","style":"normal"}]},{"type":"paragraph","text":"This component has no interactive states in the current Figma component set.","segments":[{"text":"This component has no interactive states in the current Figma component set.","style":"normal"}]},{"type":"paragraph","text":"Feedback semantics are represented through the Type variant, not through hover/focus/pressed states.","segments":[{"text":"Feedback semantics are represented through the ","style":"normal"},{"text":"Type","style":"code"},{"text":" variant, not through ","style":"normal"},{"text":"hover","style":"code"},{"text":"/","style":"normal"},{"text":"focus","style":"code"},{"text":"/","style":"normal"},{"text":"pressed","style":"code"},{"text":" states.","style":"normal"}]},{"type":"heading","level":2,"text":"Usage Guidelines","segments":[{"text":"Usage Guidelines","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"When to use: Use Information, Warning, and Positive to communicate concise status feedback in context.","segments":[{"text":"When to use","style":"bold"},{"text":": Use ","style":"normal"},{"text":"Information","style":"code"},{"text":", ","style":"normal"},{"text":"Warning","style":"code"},{"text":", and ","style":"normal"},{"text":"Positive","style":"code"},{"text":" to communicate concise status feedback in context.","style":"normal"}]},{"text":"When not to use: Do not use this component for persistent page-level navigation or long-form guidance.","segments":[{"text":"When not to use","style":"bold"},{"text":": Do not use this component for persistent page-level navigation or long-form guidance.","style":"normal"}]},{"text":"Do: Keep icon size and spacing unchanged to preserve visual rhythm.","segments":[{"text":"Do","style":"bold"},{"text":": Keep icon size and spacing unchanged to preserve visual rhythm.","style":"normal"}]},{"text":"Do: Keep semantic feedback tokens aligned with the selected variant.","segments":[{"text":"Do","style":"bold"},{"text":": Keep semantic feedback tokens aligned with the selected variant.","style":"normal"}]},{"text":"Don't: Replace semantic border/icon tokens with neutral values.","segments":[{"text":"Don't","style":"bold"},{"text":": Replace semantic border/icon tokens with neutral values.","style":"normal"}]},{"text":"Don't: Use this component for multi-paragraph content.","segments":[{"text":"Don't","style":"bold"},{"text":": Use this component for multi-paragraph content.","style":"normal"}]}]},{"type":"heading","level":2,"text":"Content Guidelines","segments":[{"text":"Content Guidelines","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Use short, direct message text.","segments":[{"text":"Use short, direct message text.","style":"normal"}]},{"text":"Prefer one sentence per alert.","segments":[{"text":"Prefer one sentence per alert.","style":"normal"}]},{"text":"Use sentence case.","segments":[{"text":"Use sentence case.","style":"normal"}]},{"text":"Avoid unnecessary punctuation and repeated emphasis.","segments":[{"text":"Avoid unnecessary punctuation and repeated emphasis.","style":"normal"}]}]},{"type":"heading","level":2,"text":"Accessibility","segments":[{"text":"Accessibility","style":"normal"}]},{"type":"heading","level":3,"text":"1. ARIA role and semantics","segments":[{"text":"1. ARIA role and semantics","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Expected role for passive feedback: role=\"alert\".","segments":[{"text":"Expected role for passive feedback: ","style":"normal"},{"text":"role=\"alert\"","style":"code"},{"text":".","style":"normal"}]},{"text":"If the host context already conveys live feedback semantics, use semantic HTML and avoid duplicate ARIA.","segments":[{"text":"If the host context already conveys live feedback semantics, use semantic HTML and avoid duplicate ARIA.","style":"normal"}]},{"text":"Required ARIA attributes are TBD for this component configuration.","segments":[{"text":"Required ARIA attributes are ","style":"normal"},{"text":"TBD","style":"code"},{"text":" for this component configuration.","style":"normal"}]}]},{"type":"heading","level":3,"text":"2. Keyboard navigation","segments":[{"text":"2. Keyboard navigation","style":"normal"}]},{"type":"paragraph","text":"This component is not keyboard-interactive in the current Figma configuration.","segments":[{"text":"This component is not keyboard-interactive in the current Figma configuration.","style":"normal"}]},{"type":"heading","level":3,"text":"3. Focus management","segments":[{"text":"3. Focus management","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"This component has no focusable element in the current Figma definition.","segments":[{"text":"This component has no focusable element in the current Figma definition.","style":"normal"}]},{"text":"Focus behavior for dismissible/interactive alert variants is TBD.","segments":[{"text":"Focus behavior for dismissible/interactive alert variants is ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}]},{"text":"Focus outline tokens (Semantic.Color.Focus-Outline.Inner, Semantic.Color.Focus-Outline.Outer) are TBD for this component.","segments":[{"text":"Focus outline tokens (","style":"normal"},{"text":"Semantic.Color.Focus-Outline.Inner","style":"code"},{"text":", ","style":"normal"},{"text":"Semantic.Color.Focus-Outline.Outer","style":"code"},{"text":") are ","style":"normal"},{"text":"TBD","style":"code"},{"text":" for this component.","style":"normal"}]}]},{"type":"heading","level":3,"text":"4. Labeling","segments":[{"text":"4. Labeling","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"The message text itself provides the accessible content.","segments":[{"text":"The message text itself provides the accessible content.","style":"normal"}]},{"text":"Additional labeling patterns (aria-label, aria-labelledby, aria-describedby) are TBD for interactive variants.","segments":[{"text":"Additional labeling patterns (","style":"normal"},{"text":"aria-label","style":"code"},{"text":", ","style":"normal"},{"text":"aria-labelledby","style":"code"},{"text":", ","style":"normal"},{"text":"aria-describedby","style":"code"},{"text":") are ","style":"normal"},{"text":"TBD","style":"code"},{"text":" for interactive variants.","style":"normal"}]}]},{"type":"heading","level":3,"text":"5. Contrast and visibility","segments":[{"text":"5. Contrast and visibility","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"The component should not rely on color alone; iconography and text must remain present with each variant.","segments":[{"text":"The component should not rely on color alone; iconography and text must remain present with each variant.","style":"normal"}]},{"text":"Verified contrast ratios are TBD (pending audit).","segments":[{"text":"Verified contrast ratios are ","style":"normal"},{"text":"TBD (pending audit)","style":"code"},{"text":".","style":"normal"}]}]},{"type":"heading","level":2,"text":"Related Components","segments":[{"text":"Related Components","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"[Status Bar](status_bar.md): Use for fixed device/system chrome, not inline feedback messaging.","segments":[{"text":"[Status Bar](status_bar.md): Use for fixed device/system chrome, not inline feedback messaging.","style":"normal"}]},{"text":"[Bottom Bar](bottom_bar.md): Use for persistent action navigation, not semantic feedback.","segments":[{"text":"[Bottom Bar](bottom_bar.md): Use for persistent action navigation, not semantic feedback.","style":"normal"}]}]},{"type":"heading","level":2,"text":"Gaps / TBD","segments":[{"text":"Gaps / TBD","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Required status for Change_Message_Text in Figma is TBD.","segments":[{"text":"Required status for ","style":"normal"},{"text":"Change_Message_Text","style":"code"},{"text":" in Figma is ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}]},{"text":"Accessibility behavior for interactive/dismissible alert variants is TBD.","segments":[{"text":"Accessibility behavior for interactive/dismissible alert variants is ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}]}]}],"stats":{"headings":22,"paragraphs":9,"lists":14,"tables":3,"codeBlocks":0}},"theme":{"name":"figma-doc-theme-karmap","status":"ready","description":"Render contract for converting markdown component docs into Figma documentation sections. Styled to match the Karmap / Iter design system visual identity: Lora headings, Nunito Sans body, cucumber-green accents on warm cream surfaces.\n","layout":{"target":{"section_name_pattern":"Doc/{component_name}","position":{"reference":"component_section","offset_x":200,"align_y":"top"}},"section":{"width":940,"min_height":1100},"canvas":{"inset":40,"width":860,"padding":{"top":32,"right":32,"bottom":32,"left":32},"item_spacing":20}},"theme":{"colors":{"page_bg":"#FFFAF0","section_border":"#C9E0BE","canvas_shadow":"#00000014","card_bg":"#FFFFFF","card_border":"#E7DDCF","table_header_bg":"#F5F0E6","title_text":"#495841","heading_text":"#495841","body_text":"#483F3F","muted_text":"#716666","chip_bg":"#E8F0E4","chip_border":"#C9E0BE","chip_text":"#495841","header_accent":"#C9E0BE"},"radii":{"canvas":20,"card":12,"chip":999,"header_accent":12},"strokes":{"section_border":1.5,"card_border":1,"chip_border":1},"spacing":{"card_padding":20,"card_gap":12,"chip_padding_v":5,"chip_padding_h":12,"chip_gap":8,"paragraph_gap":8,"list_gap":6,"header_accent_padding_v":16,"header_accent_padding_h":24},"typography":{"font_family":"Nunito Sans","font_family_heading":"Lora","font_family_mono":"Roboto Mono","h1":{"font_family":"Lora","size":36,"line_height":42,"weight":"Bold","color":"title_text"},"h2":{"font_family":"Lora","size":20,"line_height":26,"weight":"Bold","color":"heading_text"},"h3":{"size":16,"line_height":24,"weight":"SemiBold","color":"heading_text"},"body":{"size":15,"line_height":24,"weight":"Regular","color":"body_text"},"body_small":{"size":13,"line_height":18,"weight":"SemiBold","color":"chip_text"}}},"markdown_mapping":{"document":{"wrapper":"canvas"},"title":{"component":"header_block","text_style":"h1"},"subtitle":{"component":"intro_text","text_style":"body","color_override":"muted_text"},"heading_2":{"component":"card","title_style":"h2"},"heading_3":{"component":"inline_heading","text_style":"h3"},"paragraph":{"component":"text","text_style":"body"},"unordered_list":{"component":"stack","item_gap":"list_gap"},"ordered_list":{"component":"stack","item_gap":"list_gap"},"list_item":{"component":"text","text_style":"body"},"table":{"component":"table_card","header_style":"h3","cell_style":"body","border_color":"card_border","header_bg":"table_header_bg"},"code_inline":{"component":"text","text_style":"body","color_override":"heading_text"}},"components":{"header_block":{"layout":"vertical","stretch":true,"item_spacing":8,"accent":{"enabled":true,"fills":{"color":"header_accent"},"radius":12,"padding":{"top":16,"right":24,"bottom":16,"left":24}}},"chips_row":{"layout":"horizontal","stretch":true,"item_spacing":8},"card":{"layout":"vertical","stretch":true,"width":796,"padding":{"top":20,"right":20,"bottom":20,"left":20},"item_spacing":12,"fills":{"color":"card_bg"},"strokes":{"color":"card_border","weight":1},"radius":12},"table_card":{"extends":"card","table":{"cell_padding_v":8,"cell_padding_h":10,"row_gap":0,"column_gap":0,"border_weight":1,"header_bg":"table_header_bg"}}},"rules":["Keep one visual card per H2 section.","Render markdown in source order; do not reorder content blocks.","Preserve semantic spacing and hierarchy from heading levels.","Avoid hardcoded widths for text nodes; use stretch behavior when possible.","If a markdown element is unsupported, render it as body text and flag it in report.","Use Lora for h1 and h2 headings; Nunito Sans for everything else.","Table header rows use a tinted background to distinguish from body rows.","The header accent block wraps the title area with a brand-colored background."],"output_contract":{"report_fields":["markdown_path","target_section_id","theme_name","offset_x_applied","unsupported_blocks"]}},"options":{"componentName":"alert","componentSetNodeId":null}};

function getPath(obj, path, fallbackValue) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || !Object.prototype.hasOwnProperty.call(current, part)) {
      return fallbackValue;
    }
    current = current[part];
  }
  return current == null ? fallbackValue : current;
}

function hexToRgb(hex) {
  if (typeof hex !== "string") return { r: 0, g: 0, b: 0 };
  const cleaned = hex.trim().replace("#", "");
  const expanded =
    cleaned.length === 3
      ? cleaned.split("").map((c) => c + c).join("")
      : cleaned.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(expanded, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function solid(hex, opacity) {
  return {
    type: "SOLID",
    color: hexToRgb(hex),
    opacity: opacity == null ? 1 : opacity,
  };
}

function resolveColor(theme, colorOrToken, fallbackHex) {
  if (typeof colorOrToken === "string" && colorOrToken.startsWith("#")) {
    return colorOrToken;
  }
  if (typeof colorOrToken === "string") {
    const tokenValue = getPath(theme, "theme.colors." + colorOrToken, null);
    if (typeof tokenValue === "string" && tokenValue.startsWith("#")) return tokenValue;
  }
  return fallbackHex;
}

function fontStyleFromWeight(weight) {
  if (!weight) return "Regular";
  const normalized = String(weight).toLowerCase();
  if (normalized === "bold") return "Bold";
  if (normalized === "semibold" || normalized === "semi-bold") return "SemiBold";
  if (normalized === "medium") return "Medium";
  return "Regular";
}

function normalizeInlineSegments(rawSegments, fallbackText) {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return [{ text: String(fallbackText == null ? "" : fallbackText), style: "normal" }];
  }

  const segments = [];
  for (const rawSegment of rawSegments) {
    const text = String(rawSegment && rawSegment.text != null ? rawSegment.text : "");
    if (!text) continue;

    const style = String(rawSegment && rawSegment.style ? rawSegment.style : "normal");
    const safeStyle =
      style === "bold" || style === "italic" || style === "code" || style === "normal"
        ? style
        : "normal";

    const last = segments[segments.length - 1];
    if (last && last.style === safeStyle) {
      last.text += text;
    } else {
      segments.push({ text, style: safeStyle });
    }
  }

  if (segments.length === 0) {
    return [{ text: String(fallbackText == null ? "" : fallbackText), style: "normal" }];
  }

  return segments;
}

function segmentsToText(segments) {
  return segments.map((segment) => String(segment.text || "")).join("");
}

function applySegmentFormatting(node, segments, family, theme) {
  const monoFamily = String(getPath(theme, "theme.typography.font_family_mono", "Roboto Mono"));
  let offset = 0;

  for (const segment of segments) {
    const text = String(segment.text || "");
    const end = offset + text.length;
    if (end <= offset) continue;

    try {
      if (segment.style === "bold") {
        node.setRangeFontName(offset, end, { family, style: "Bold" });
      } else if (segment.style === "italic") {
        node.setRangeFontName(offset, end, { family, style: "Italic" });
      } else if (segment.style === "code") {
        node.setRangeFontName(offset, end, { family: monoFamily, style: "Regular" });
      }
    } catch (_) {
      // Keep base style if a specific variant is unavailable.
    }

    offset = end;
  }
}

async function ensureFonts(theme) {
  const bodyFamily = getPath(theme, "theme.typography.font_family", "Nunito Sans");
  const headingFamily = getPath(theme, "theme.typography.font_family_heading", bodyFamily);
  const monoFamily = getPath(theme, "theme.typography.font_family_mono", "Roboto Mono");
  const typography = getPath(theme, "theme.typography", {});

  // Collect { family, style } pairs from all typography entries
  const fontPairs = new Set();
  fontPairs.add(bodyFamily + ":Regular");
  fontPairs.add(bodyFamily + ":Bold");
  fontPairs.add(bodyFamily + ":Italic");
  if (headingFamily !== bodyFamily) {
    fontPairs.add(headingFamily + ":Regular");
    fontPairs.add(headingFamily + ":Bold");
    fontPairs.add(headingFamily + ":Italic");
  }
  fontPairs.add(monoFamily + ":Regular");
  for (const [key, value] of Object.entries(typography)) {
    if (key === "font_family" || key === "font_family_heading") continue;
    if (!value || typeof value !== "object") continue;
    const fam = value.font_family || bodyFamily;
    fontPairs.add(fam + ":" + fontStyleFromWeight(value.weight));
  }

  for (const pair of fontPairs) {
    const [family, style] = pair.split(":");
    try {
      await figma.loadFontAsync({ family, style });
    } catch (error) {
      if (style !== "Regular") {
        try {
          await figma.loadFontAsync({ family, style: "Regular" });
        } catch (_) {
          // Skip unavailable font variant
        }
      }
    }
  }
}

function createVerticalFrame(name) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.fills = [];
  return frame;
}

function createHorizontalFrame(name) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.fills = [];
  return frame;
}

function createText(parent, text, styleKey, theme, options) {
  const typography = getPath(theme, "theme.typography", {});
  const style = typography[styleKey] || typography.body || {
    size: 15,
    line_height: 24,
    weight: "Regular",
    color: "body_text",
  };

  const defaultFamily = getPath(theme, "theme.typography.font_family", "Nunito Sans");
  const family = style.font_family || defaultFamily;
  const colorToken = options && options.colorOverride ? options.colorOverride : style.color;
  const wrap = options && Object.prototype.hasOwnProperty.call(options, "wrap")
    ? Boolean(options.wrap)
    : true;
  const wrapWidth = options && typeof options.wrapWidth === "number"
    ? Number(options.wrapWidth)
    : null;
  const colorHex = resolveColor(theme, colorToken, "#4E4343");

  const node = figma.createText();
  node.fontName = { family, style: fontStyleFromWeight(style.weight) };
  node.fontSize = Number(style.size || 15);
  node.lineHeight = { unit: "PIXELS", value: Number(style.line_height || 24) };
  node.fills = [solid(colorHex, 1)];
  if (wrap) {
    node.textAutoResize = "HEIGHT";
  } else {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  const resolvedSegments = normalizeInlineSegments(options && options.segments, text);
  node.characters = segmentsToText(resolvedSegments);
  parent.appendChild(node);
  applySegmentFormatting(node, resolvedSegments, family, theme);
  if (wrap) {
    const parentWidth = "width" in parent ? Number(parent.width || 0) : 0;
    const padLeft = "paddingLeft" in parent ? Number(parent.paddingLeft || 0) : 0;
    const padRight = "paddingRight" in parent ? Number(parent.paddingRight || 0) : 0;
    const inferredWidth = Math.max(1, parentWidth - padLeft - padRight);
    const targetWidth = wrapWidth != null ? Math.max(1, wrapWidth) : inferredWidth;
    if (targetWidth > 1) {
      node.resize(targetWidth, node.height);
    }
  }
  return node;
}

function findAncestorSection(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "SECTION") return current;
    current = current.parent;
  }
  return null;
}

function toSafeName(raw) {
  return String(raw || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function clearChildren(node) {
  for (const child of [...node.children]) {
    child.remove();
  }
}

function createCard(canvas, title, titleSegments, theme) {
  const card = createVerticalFrame("Card/" + toSafeName(title || "Untitled"));
  const cardWidth = Number(getPath(theme, "components.card.width", 820));
  const padding = getPath(theme, "components.card.padding", {});
  const padTop = Number(padding.top ?? 20);
  const padRight = Number(padding.right ?? 20);
  const padBottom = Number(padding.bottom ?? 20);
  const padLeft = Number(padding.left ?? 20);

  card.resizeWithoutConstraints(cardWidth, 100);
  card.layoutAlign = "STRETCH";
  card.paddingTop = padTop;
  card.paddingRight = padRight;
  card.paddingBottom = padBottom;
  card.paddingLeft = padLeft;
  card.itemSpacing = Number(getPath(theme, "components.card.item_spacing", 10));
  card.cornerRadius = Number(getPath(theme, "components.card.radius", getPath(theme, "theme.radii.card", 16)));
  card.fills = [solid(resolveColor(theme, getPath(theme, "components.card.fills.color", "card_bg"), "#FFFFFF"), 1)];
  card.strokes = [solid(resolveColor(theme, getPath(theme, "components.card.strokes.color", "card_border"), "#E7DDCF"), 1)];
  card.strokeWeight = Number(getPath(theme, "components.card.strokes.weight", 1));
  canvas.appendChild(card);

  createText(card, title, "h2", theme, { segments: titleSegments });
  return card;
}

function createChip(parent, label, theme) {
  const chip = createHorizontalFrame("Chip/" + toSafeName(label));
  chip.paddingTop = Number(getPath(theme, "theme.spacing.chip_padding_v", 6));
  chip.paddingBottom = Number(getPath(theme, "theme.spacing.chip_padding_v", 6));
  chip.paddingLeft = Number(getPath(theme, "theme.spacing.chip_padding_h", 10));
  chip.paddingRight = Number(getPath(theme, "theme.spacing.chip_padding_h", 10));
  chip.cornerRadius = Number(getPath(theme, "theme.radii.chip", 999));
  chip.strokes = [solid(resolveColor(theme, "chip_border", "#DCCBB2"), 1)];
  chip.strokeWeight = Number(getPath(theme, "theme.strokes.chip_border", 1));
  chip.fills = [solid(resolveColor(theme, "chip_bg", "#F6EFE4"), 1)];
  parent.appendChild(chip);
  createText(chip, label, "body_small", theme, {
    colorOverride: "chip_text",
    wrap: false,
  });
}

function createTable(parent, title, tableBlock, theme) {
  const tableCard = createVerticalFrame("Table/" + toSafeName(title || "Table"));
  tableCard.layoutAlign = "STRETCH";
  tableCard.itemSpacing = 0;
  tableCard.fills = [];
  parent.appendChild(tableCard);

  const header = Array.isArray(tableBlock.header) ? tableBlock.header : [];
  const headerSegments = Array.isArray(tableBlock.headerSegments)
    ? tableBlock.headerSegments
    : [];
  const bodyRows = Array.isArray(tableBlock.rows) ? tableBlock.rows : [];
  const bodyRowSegments = Array.isArray(tableBlock.rowSegments)
    ? tableBlock.rowSegments
    : [];
  const columnCount = Math.max(
    header.length,
    ...bodyRows.map((row) => (Array.isArray(row) ? row.length : 0)),
    1
  );
  const rows = [];
  if (header.length > 0) {
    rows.push({
      cells: header,
      segments: Array.isArray(headerSegments) ? headerSegments : [],
      isHeader: true,
    });
  }
  for (let bodyRowIndex = 0; bodyRowIndex < bodyRows.length; bodyRowIndex += 1) {
    const row = bodyRows[bodyRowIndex];
    const safeRow = Array.isArray(row) ? row : [String(row)];
    rows.push({
      cells: safeRow,
      segments: Array.isArray(bodyRowSegments[bodyRowIndex])
        ? bodyRowSegments[bodyRowIndex]
        : [],
      isHeader: false,
    });
  }
  if (rows.length === 0) return;

  const cellPaddingV = Number(getPath(theme, "components.table_card.table.cell_padding_v", 8));
  const cellPaddingH = Number(getPath(theme, "components.table_card.table.cell_padding_h", 10));
  const borderColor = resolveColor(theme, getPath(theme, "markdown_mapping.table.border_color", "card_border"), "#E7DDCF");
  const borderWeight = Number(getPath(theme, "components.table_card.table.border_weight", 1));
  const minRowHeight = Number(getPath(theme, "components.table_card.table.min_row_height", 40));
  const minColumnWidth = Number(getPath(theme, "components.table_card.table.min_column_width", 120));
  const rowGap = Number(getPath(theme, "components.table_card.table.row_gap", 0));
  const columnGap = Number(getPath(theme, "components.table_card.table.column_gap", 0));
  const headerBgColor = resolveColor(theme, getPath(theme, "components.table_card.table.header_bg", "table_header_bg"), null);
  const cardWidth = Number(getPath(theme, "components.card.width", 820));
  const cardPadLeft = Number(getPath(theme, "components.card.padding.left", 20));
  const cardPadRight = Number(getPath(theme, "components.card.padding.right", 20));
  const tableWidth = Math.max(240, cardWidth - cardPadLeft - cardPadRight);
  tableCard.itemSpacing = rowGap;

  function normalizeCellText(raw) {
    return String(raw == null ? "" : raw)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const contentScores = new Array(columnCount).fill(1);
  for (const row of rows) {
    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const raw = colIndex < row.cells.length ? row.cells[colIndex] : "";
      const normalized = normalizeCellText(raw);
      const lengthScore = Math.max(1, normalized.length);
      const boostedScore = row.isHeader ? lengthScore * 1.15 : lengthScore;
      contentScores[colIndex] = Math.max(contentScores[colIndex], boostedScore);
    }
  }

  const availableWidth = Math.max(1, tableWidth - columnGap * Math.max(0, columnCount - 1));
  const minWeight = Number(getPath(theme, "components.table_card.table.min_column_weight", 1));
  const maxWeight = Number(getPath(theme, "components.table_card.table.max_column_weight", 3.2));
  const columnWeights = contentScores.map((score) => {
    const baseWeight = Math.sqrt(Math.max(4, score)) / 2;
    return Math.min(maxWeight, Math.max(minWeight, baseWeight));
  });
  const totalWeight = Math.max(1, columnWeights.reduce((sum, value) => sum + value, 0));
  const columnWidths = columnWeights.map((weight) =>
    Math.max(1, Math.floor((availableWidth * weight) / totalWeight))
  );

  // Ensure the full table width is consumed after flooring.
  let widthRemainder =
    availableWidth - columnWidths.reduce((sum, value) => sum + value, 0);
  let remainderIndex = 0;
  while (widthRemainder > 0) {
    const target = remainderIndex % columnWidths.length;
    columnWidths[target] += 1;
    remainderIndex += 1;
    widthRemainder -= 1;
  }

  // Try to keep columns readable without exceeding the table width budget.
  if (minColumnWidth * columnCount <= availableWidth) {
    for (let i = 0; i < columnWidths.length; i += 1) {
      columnWidths[i] = Math.max(minColumnWidth, columnWidths[i]);
    }
    let overflow =
      columnWidths.reduce((sum, value) => sum + value, 0) - availableWidth;
    while (overflow > 0) {
      let widestIndex = 0;
      for (let i = 1; i < columnWidths.length; i += 1) {
        if (columnWidths[i] > columnWidths[widestIndex]) widestIndex = i;
      }
      if (columnWidths[widestIndex] <= minColumnWidth) break;
      columnWidths[widestIndex] -= 1;
      overflow -= 1;
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowFrame = createHorizontalFrame(row.isHeader ? "Header Row" : "Body Row");
    rowFrame.primaryAxisSizingMode = "FIXED";
    rowFrame.counterAxisSizingMode = "AUTO";
    rowFrame.resizeWithoutConstraints(tableWidth, 1);
    rowFrame.itemSpacing = columnGap;
    rowFrame.layoutAlign = "STRETCH";
    rowFrame.fills = [];
    tableCard.appendChild(rowFrame);
    const rowCells = [];

    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const value = colIndex < row.cells.length ? String(row.cells[colIndex] ?? "") : "";
      const cell = createVerticalFrame((row.isHeader ? "Header Cell " : "Cell ") + String(colIndex + 1));
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "FIXED";
      const cellWidth = Math.max(1, columnWidths[colIndex]);
      cell.resizeWithoutConstraints(cellWidth, 1);
      cell.layoutAlign = "STRETCH";
      cell.clipsContent = false;
      cell.paddingTop = cellPaddingV;
      cell.paddingBottom = cellPaddingV;
      cell.paddingLeft = cellPaddingH;
      cell.paddingRight = cellPaddingH;
      cell.strokes = [solid(borderColor, 1)];
      cell.strokeWeight = borderWeight;
      const cellBg = row.isHeader && headerBgColor ? headerBgColor : "#FFFFFF";
      cell.fills = [solid(cellBg, 1)];
      rowFrame.appendChild(cell);
      rowCells.push(cell);
      const cellSegments =
        Array.isArray(row.segments) && Array.isArray(row.segments[colIndex])
          ? row.segments[colIndex]
          : null;
      createText(cell, value, row.isHeader ? "h3" : "body", theme, {
        wrapWidth: Math.max(1, cellWidth - cellPaddingH * 2),
        segments: cellSegments,
      });
    }

    const targetRowHeight = Math.max(minRowHeight, Math.ceil(rowFrame.height));
    rowFrame.resizeWithoutConstraints(tableWidth, targetRowHeight);

    // Force same cell height in a row to avoid ragged table baselines.
    for (const cell of rowCells) {
      cell.primaryAxisSizingMode = "FIXED";
      cell.counterAxisSizingMode = "FIXED";
      cell.layoutAlign = "STRETCH";
      cell.resizeWithoutConstraints(cell.width, targetRowHeight);
    }
  }
}

function renderList(parent, listBlock, theme) {
  const ordered = Boolean(listBlock.ordered);
  const items = Array.isArray(listBlock.items) ? listBlock.items : [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const text = typeof item === "string" ? item : String(item?.text ?? "");
    const itemSegments =
      typeof item === "string" || !Array.isArray(item?.segments) ? null : item.segments;
    const prefix = ordered ? String(i + 1) + ". " : "\u2022 ";
    const mergedSegments = itemSegments
      ? [{ text: prefix, style: "normal" }, ...itemSegments]
      : null;
    createText(parent, prefix + text, "body", theme, { segments: mergedSegments });
  }
}

const model = PAYLOAD.model || {};
const theme = PAYLOAD.theme || {};
const options = PAYLOAD.options || {};
const unsupportedBlocks = [];
const renderedCount = {
  heading: 0,
  paragraph: 0,
  list: 0,
  table: 0,
  code_block: 0,
};

await ensureFonts(theme);

const componentName = String(
  options.componentName || model.componentName || model.title || "Component"
);

let componentSet = null;
if (options.componentSetNodeId) {
  componentSet = await figma.getNodeByIdAsync(options.componentSetNodeId);
}

if (!componentSet) {
  const lookup = componentName.toLowerCase();
  const candidates = figma.currentPage.findAll(
    (node) => node.type === "COMPONENT_SET" && node.name.toLowerCase() === lookup
  );
  componentSet = candidates[0] || null;
}

if (!componentSet) {
  return {
    ok: false,
    error: "Component set not found",
    componentName,
    componentSetNodeId: options.componentSetNodeId || null,
  };
}

const componentSection = findAncestorSection(componentSet);
if (!componentSection) {
  return {
    ok: false,
    error: "Component set has no ancestor SECTION",
    componentSetId: componentSet.id,
  };
}

const page = componentSection.parent;
if (!page || page.type !== "PAGE") {
  return {
    ok: false,
    error: "Component section parent is not a PAGE",
    componentSectionId: componentSection.id,
  };
}

const sectionPattern = String(
  getPath(theme, "layout.target.section_name_pattern", "Doc/{component_name}")
);
const docSectionName = sectionPattern.replace("{component_name}", componentName);
let docSection = null;
for (const child of page.children) {
  if (child.type === "SECTION" && child.name === docSectionName) {
    docSection = child;
    break;
  }
}
if (!docSection) {
  docSection = figma.createSection();
  docSection.name = docSectionName;
  page.appendChild(docSection);
}

const offsetX = Number(
  options.offsetX != null
    ? options.offsetX
    : getPath(theme, "layout.target.position.offset_x", 200)
);
const sectionWidth = Number(getPath(theme, "layout.section.width", 940));
const minSectionHeight = Number(getPath(theme, "layout.section.min_height", 1100));

docSection.name = docSectionName;
docSection.x = componentSection.x + componentSection.width + offsetX;
docSection.y = componentSection.y;
docSection.resizeWithoutConstraints(sectionWidth, minSectionHeight);
clearChildren(docSection);

const canvas = createVerticalFrame("Doc Canvas");
const canvasInset = Number(getPath(theme, "layout.canvas.inset", 40));
const canvasWidth = Number(getPath(theme, "layout.canvas.width", sectionWidth - canvasInset * 2));
const canvasPadding = getPath(theme, "layout.canvas.padding", {});
canvas.resizeWithoutConstraints(canvasWidth, 100);
canvas.paddingTop = Number(canvasPadding.top ?? 28);
canvas.paddingRight = Number(canvasPadding.right ?? 28);
canvas.paddingBottom = Number(canvasPadding.bottom ?? 28);
canvas.paddingLeft = Number(canvasPadding.left ?? 28);
canvas.itemSpacing = Number(getPath(theme, "layout.canvas.item_spacing", 18));
canvas.cornerRadius = Number(getPath(theme, "theme.radii.canvas", 24));
canvas.fills = [solid(resolveColor(theme, "page_bg", "#FFF9F0"), 1)];
canvas.strokes = [solid(resolveColor(theme, "section_border", "#E7DDCF"), 1)];
canvas.strokeWeight = Number(getPath(theme, "theme.strokes.section_border", 1));
canvas.x = canvasInset;
canvas.y = canvasInset;
docSection.appendChild(canvas);

const accentEnabled = getPath(theme, "components.header_block.accent.enabled", false);

let headerTarget;
if (accentEnabled) {
  const accent = createVerticalFrame("Header Accent");
  accent.layoutAlign = "STRETCH";
  const accentPad = getPath(theme, "components.header_block.accent.padding", {});
  accent.paddingTop = Number(accentPad.top ?? 16);
  accent.paddingRight = Number(accentPad.right ?? 24);
  accent.paddingBottom = Number(accentPad.bottom ?? 16);
  accent.paddingLeft = Number(accentPad.left ?? 24);
  accent.itemSpacing = Number(getPath(theme, "components.header_block.item_spacing", 8));
  accent.cornerRadius = Number(getPath(theme, "components.header_block.accent.radius", getPath(theme, "theme.radii.header_accent", 12)));
  const accentColor = resolveColor(theme, getPath(theme, "components.header_block.accent.fills.color", "header_accent"), "#C9E0BE");
  accent.fills = [solid(accentColor, 1)];
  canvas.appendChild(accent);
  headerTarget = accent;
} else {
  const header = createVerticalFrame("Header");
  header.layoutAlign = "STRETCH";
  header.itemSpacing = Number(getPath(theme, "components.header_block.item_spacing", 8));
  canvas.appendChild(header);
  headerTarget = header;
}

const blocks = Array.isArray(model.blocks) ? model.blocks : [];
const titleBlock = blocks.find(
  (block) => block.type === "heading" && Number(block.level) === 1
);
const titleText = String(model.title || titleBlock?.text || componentName);
createText(headerTarget, titleText, "h1", theme, {
  segments: Array.isArray(titleBlock?.segments) ? titleBlock.segments : null,
});

let firstH2Index = blocks.findIndex(
  (block) => block.type === "heading" && Number(block.level) === 2
);
if (firstH2Index < 0) firstH2Index = blocks.length;

for (let index = 0; index < firstH2Index; index += 1) {
  const block = blocks[index];
  if (block.type === "paragraph") {
    createText(headerTarget, String(block.text || ""), "body", theme, {
      colorOverride: "muted_text",
      segments: Array.isArray(block.segments) ? block.segments : null,
    });
    renderedCount.paragraph += 1;
  }
}

const chipsRow = createHorizontalFrame("Meta Chips");
chipsRow.itemSpacing = Number(getPath(theme, "components.chips_row.item_spacing", 8));
chipsRow.layoutAlign = "STRETCH";
canvas.appendChild(chipsRow);

const sectionCount = blocks.filter(
  (block) => block.type === "heading" && Number(block.level) === 2
).length;
const tableCount = blocks.filter((block) => block.type === "table").length;
createChip(chipsRow, String(sectionCount) + " Sections", theme);
createChip(chipsRow, String(tableCount) + " Tables", theme);
createChip(chipsRow, "Markdown Sync", theme);

let currentCard = null;
for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
  const block = blocks[blockIndex];
  if (block.type === "heading" && Number(block.level) === 1) {
    renderedCount.heading += 1;
    continue;
  }

  if (block.type === "heading" && Number(block.level) === 2) {
    currentCard = createCard(
      canvas,
      String(block.text || "Untitled"),
      Array.isArray(block.segments) ? block.segments : null,
      theme
    );
    renderedCount.heading += 1;
    continue;
  }

  if (!currentCard) {
    currentCard = createCard(canvas, "General", null, theme);
  }

  if (block.type === "heading" && Number(block.level) === 3) {
    createText(currentCard, String(block.text || ""), "h3", theme, {
      segments: Array.isArray(block.segments) ? block.segments : null,
    });
    renderedCount.heading += 1;
    continue;
  }

  if (block.type === "paragraph") {
    createText(currentCard, String(block.text || ""), "body", theme, {
      segments: Array.isArray(block.segments) ? block.segments : null,
    });
    renderedCount.paragraph += 1;
    continue;
  }

  if (block.type === "list") {
    renderList(currentCard, block, theme);
    renderedCount.list += 1;
    continue;
  }

  if (block.type === "table") {
    createTable(currentCard, "Table", block, theme);
    renderedCount.table += 1;
    continue;
  }

  if (block.type === "code_block") {
    renderedCount.code_block += 1;
    unsupportedBlocks.push({
      index: blockIndex,
      type: "code_block",
      reason: "Rendered as fallback paragraph",
    });
    createText(currentCard, "[code block omitted in visual render]", "body", theme, {});
    continue;
  }

  unsupportedBlocks.push({
    index: blockIndex,
    type: String(block.type || "unknown"),
    reason: "Rendered as fallback paragraph",
  });
  createText(currentCard, String(block.text || ""), "body", theme, {});
}

const finalHeight = Math.max(minSectionHeight, Number(canvas.height) + canvasInset * 2);
docSection.resizeWithoutConstraints(sectionWidth, finalHeight);

figma.currentPage.selection = [docSection];
figma.viewport.scrollAndZoomIntoView([docSection]);

return {
  ok: true,
  markdownPath: model.markdownPath || null,
  themeName: getPath(theme, "name", "unknown"),
  componentSetId: componentSet.id,
  componentSectionId: componentSection.id,
  targetSectionId: docSection.id,
  targetSectionName: docSection.name,
  offsetXApplied: docSection.x - (componentSection.x + componentSection.width),
  renderedCount,
  unsupportedBlocks,
};

