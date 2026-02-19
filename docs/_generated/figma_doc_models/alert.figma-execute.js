const PAYLOAD = {"model":{"version":2,"componentName":"Alert","markdownPath":"/Users/julian/Documents/flujo_tokens/docs/components/alert.md","title":"Alert","blocks":[{"type":"heading","level":1,"text":"Alert","segments":[{"text":"Alert","style":"normal"}]},{"type":"paragraph","text":"The Alert component communicates concise feedback messages in a highly visible inline block.","segments":[{"text":"The ","style":"normal"},{"text":"Alert","style":"bold"},{"text":" component communicates concise feedback messages in a highly visible inline block.","style":"normal"}]},{"type":"heading","level":2,"text":"Overview","segments":[{"text":"Overview","style":"normal"}]},{"type":"paragraph","text":"In Figma, this component is defined as a COMPONENT_SET (Alert) with two exposed properties:","segments":[{"text":"In Figma, this component is defined as a ","style":"normal"},{"text":"COMPONENT_SET","style":"code"},{"text":" (","style":"normal"},{"text":"Alert","style":"code"},{"text":") with two exposed properties:","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Type: Information, Warning, Positive","segments":[{"text":"Type","style":"code"},{"text":": ","style":"normal"},{"text":"Information","style":"code"},{"text":", ","style":"normal"},{"text":"Warning","style":"code"},{"text":", ","style":"normal"},{"text":"Positive","style":"code"}],"depth":0,"ordered":false},{"text":"Change_Message_Text: Text text text (default)","segments":[{"text":"Change_Message_Text","style":"code"},{"text":": ","style":"normal"},{"text":"Text text text","style":"code"},{"text":" (default)","style":"normal"}],"depth":0,"ordered":false}]},{"type":"paragraph","text":"All variants share the same structure, spacing, and typography. Visual meaning is conveyed through semantic border and icon color tokens.","segments":[{"text":"All variants share the same structure, spacing, and typography. Visual meaning is conveyed through semantic border and icon color tokens.","style":"normal"}]},{"type":"paragraph","text":"Source: [Alert in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892)","segments":[{"text":"Source: [Alert in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2304-1892)","style":"normal"}]},{"type":"heading","level":3,"text":"Visual Proof","segments":[{"text":"Visual Proof","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Screenshot URL: TBD","segments":[{"text":"Screenshot URL: ","style":"normal"},{"text":"TBD","style":"code"}],"depth":0,"ordered":false},{"text":"Source node id: 2304:1892","segments":[{"text":"Source node id: ","style":"normal"},{"text":"2304:1892","style":"code"}],"depth":0,"ordered":false},{"text":"Proof artifact: TBD","segments":[{"text":"Proof artifact: ","style":"normal"},{"text":"TBD","style":"code"}],"depth":0,"ordered":false}]},{"type":"heading","level":2,"text":"Anatomy","segments":[{"text":"Anatomy","style":"normal"}]},{"type":"paragraph","text":"Each alert contains:","segments":[{"text":"Each alert contains:","style":"normal"}]},{"type":"list","ordered":true,"items":[{"text":"Container (Auto Layout, horizontal)","segments":[{"text":"Container","style":"bold"},{"text":" (","style":"normal"},{"text":"Auto Layout","style":"code"},{"text":", horizontal)","style":"normal"}],"depth":0,"ordered":true},{"text":"Leading icon (24 x 24, internal vector 18 x 18)","segments":[{"text":"Leading icon","style":"bold"},{"text":" (","style":"normal"},{"text":"24 x 24","style":"code"},{"text":", internal vector ","style":"normal"},{"text":"18 x 18","style":"code"},{"text":")","style":"normal"}],"depth":0,"ordered":true},{"text":"Text container with a single message text node","segments":[{"text":"Text container","style":"bold"},{"text":" with a single message text node","style":"normal"}],"depth":0,"ordered":true}]},{"type":"paragraph","text":"Current variant dimensions in Figma:","segments":[{"text":"Current variant dimensions in Figma:","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Type=Information: 383 x 38","segments":[{"text":"Type=Information","style":"code"},{"text":": ","style":"normal"},{"text":"383 x 38","style":"code"}],"depth":0,"ordered":false},{"text":"Type=Warning: 383 x 38","segments":[{"text":"Type=Warning","style":"code"},{"text":": ","style":"normal"},{"text":"383 x 38","style":"code"}],"depth":0,"ordered":false},{"text":"Type=Positive: 383 x 38","segments":[{"text":"Type=Positive","style":"code"},{"text":": ","style":"normal"},{"text":"383 x 38","style":"code"}],"depth":0,"ordered":false}]},{"type":"heading","level":2,"text":"Component API","segments":[{"text":"Component API","style":"normal"}]},{"type":"heading","level":3,"text":"Properties","segments":[{"text":"Properties","style":"normal"}]},{"type":"table","header":["Name","Type","Default","Required","Description"],"headerSegments":[[{"text":"Name","style":"normal"}],[{"text":"Type","style":"normal"}],[{"text":"Default","style":"normal"}],[{"text":"Required","style":"normal"}],[{"text":"Description","style":"normal"}]],"rows":[["Type","VARIANT","Information","true","Semantic alert type. Options: Information, Warning, Positive."],["Change_Message_Text","TEXT","Text text text","false","Overrides the main alert message copy."]],"rowSegments":[[[{"text":"Type","style":"code"}],[{"text":"VARIANT","style":"code"}],[{"text":"Information","style":"code"}],[{"text":"true","style":"code"}],[{"text":"Semantic alert type. Options: ","style":"normal"},{"text":"Information","style":"code"},{"text":", ","style":"normal"},{"text":"Warning","style":"code"},{"text":", ","style":"normal"},{"text":"Positive","style":"code"},{"text":".","style":"normal"}]],[[{"text":"Change_Message_Text","style":"code"}],[{"text":"TEXT","style":"code"}],[{"text":"Text text text","style":"code"}],[{"text":"false","style":"code"}],[{"text":"Overrides the main alert message copy.","style":"normal"}]]]},{"type":"heading","level":2,"text":"Visual Specifications","segments":[{"text":"Visual Specifications","style":"normal"}]},{"type":"heading","level":3,"text":"Container","segments":[{"text":"Container","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Layout: Auto Layout, HORIZONTAL","segments":[{"text":"Layout","style":"bold"},{"text":": Auto Layout, ","style":"normal"},{"text":"HORIZONTAL","style":"code"}],"depth":0,"ordered":false},{"text":"Item spacing: 8px","segments":[{"text":"Item spacing","style":"bold"},{"text":": ","style":"normal"},{"text":"8px","style":"code"}],"depth":0,"ordered":false},{"text":"Padding: 7px top and bottom, 8px left and right","segments":[{"text":"Padding","style":"bold"},{"text":": ","style":"normal"},{"text":"7px","style":"code"},{"text":" top and bottom, ","style":"normal"},{"text":"8px","style":"code"},{"text":" left and right","style":"normal"}],"depth":0,"ordered":false},{"text":"Corner radius: 8px","segments":[{"text":"Corner radius","style":"bold"},{"text":": ","style":"normal"},{"text":"8px","style":"code"}],"depth":0,"ordered":false},{"text":"Border: 2px, aligned INSIDE","segments":[{"text":"Border","style":"bold"},{"text":": ","style":"normal"},{"text":"2px","style":"code"},{"text":", aligned ","style":"normal"},{"text":"INSIDE","style":"code"}],"depth":0,"ordered":false},{"text":"Background token: Color/Background/Feedback/Default","segments":[{"text":"Background token","style":"bold"},{"text":": ","style":"normal"},{"text":"Color/Background/Feedback/Default","style":"code"}],"depth":0,"ordered":false},{"text":"Background fallback: #FFFFFF","segments":[{"text":"Background fallback","style":"bold"},{"text":": ","style":"normal"},{"text":"#FFFFFF","style":"code"}],"depth":0,"ordered":false}]},{"type":"heading","level":3,"text":"Typography","segments":[{"text":"Typography","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Text style: Regular/Body 16","segments":[{"text":"Text style","style":"bold"},{"text":": ","style":"normal"},{"text":"Regular/Body 16","style":"code"}],"depth":0,"ordered":false},{"text":"Font: Nunito Sans Regular","segments":[{"text":"Font","style":"bold"},{"text":": ","style":"normal"},{"text":"Nunito Sans Regular","style":"code"}],"depth":0,"ordered":false},{"text":"Size / line height: 16 / 24","segments":[{"text":"Size / line height","style":"bold"},{"text":": ","style":"normal"},{"text":"16 / 24","style":"code"}],"depth":0,"ordered":false},{"text":"Letter spacing: 0%","segments":[{"text":"Letter spacing","style":"bold"},{"text":": ","style":"normal"},{"text":"0%","style":"code"}],"depth":0,"ordered":false},{"text":"Text color token: Color/Text/Neutral/Default","segments":[{"text":"Text color token","style":"bold"},{"text":": ","style":"normal"},{"text":"Color/Text/Neutral/Default","style":"code"}],"depth":0,"ordered":false},{"text":"Text color fallback: #483F3F","segments":[{"text":"Text color fallback","style":"bold"},{"text":": ","style":"normal"},{"text":"#483F3F","style":"code"}],"depth":0,"ordered":false}]},{"type":"heading","level":3,"text":"Iconography","segments":[{"text":"Iconography","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Icon container size: 24 x 24","segments":[{"text":"Icon container size","style":"bold"},{"text":": ","style":"normal"},{"text":"24 x 24","style":"code"}],"depth":0,"ordered":false},{"text":"Internal vector size: 18 x 18","segments":[{"text":"Internal vector size","style":"bold"},{"text":": ","style":"normal"},{"text":"18 x 18","style":"code"}],"depth":0,"ordered":false}]},{"type":"heading","level":3,"text":"Token Mapping","segments":[{"text":"Token Mapping","style":"normal"}]},{"type":"table","header":["Part","Condition","Token","Fallback"],"headerSegments":[[{"text":"Part","style":"normal"}],[{"text":"Condition","style":"normal"}],[{"text":"Token","style":"normal"}],[{"text":"Fallback","style":"normal"}]],"rows":[["container.background","all variants","Color/Background/Feedback/Default","#FFFFFF"],["text.color","all variants","Color/Text/Neutral/Default","#483F3F"]],"rowSegments":[[[{"text":"container.background","style":"code"}],[{"text":"all variants","style":"normal"}],[{"text":"Color/Background/Feedback/Default","style":"code"}],[{"text":"#FFFFFF","style":"code"}]],[[{"text":"text.color","style":"code"}],[{"text":"all variants","style":"normal"}],[{"text":"Color/Text/Neutral/Default","style":"code"}],[{"text":"#483F3F","style":"code"}]]]},{"type":"heading","level":2,"text":"Variants","segments":[{"text":"Variants","style":"normal"}]},{"type":"table","header":["Variant","Differentiating token(s)","Fallback value(s)","Visual indicator"],"headerSegments":[[{"text":"Variant","style":"normal"}],[{"text":"Differentiating token(s)","style":"normal"}],[{"text":"Fallback value(s)","style":"normal"}],[{"text":"Visual indicator","style":"normal"}]],"rows":[["Information","Color/Border/Feedback/Information, Color/Icon/Feedback/Information","#BAA06B, #9D8555","information-circle-contained icon + information border"],["Warning","Color/Border/Feedback/Danger, Color/Icon/Feedback/Danger","#B22222, #B22222","x-circle-contained icon + warning border"],["Positive","Color/Border/Feedback/Success, Color/Icon/Feedback/Success","#299157, #299157","check-contained icon + success border"]],"rowSegments":[[[{"text":"Information","style":"code"}],[{"text":"Color/Border/Feedback/Information","style":"code"},{"text":", ","style":"normal"},{"text":"Color/Icon/Feedback/Information","style":"code"}],[{"text":"#BAA06B","style":"code"},{"text":", ","style":"normal"},{"text":"#9D8555","style":"code"}],[{"text":"information-circle-contained","style":"code"},{"text":" icon + information border","style":"normal"}]],[[{"text":"Warning","style":"code"}],[{"text":"Color/Border/Feedback/Danger","style":"code"},{"text":", ","style":"normal"},{"text":"Color/Icon/Feedback/Danger","style":"code"}],[{"text":"#B22222","style":"code"},{"text":", ","style":"normal"},{"text":"#B22222","style":"code"}],[{"text":"x-circle-contained","style":"code"},{"text":" icon + warning border","style":"normal"}]],[[{"text":"Positive","style":"code"}],[{"text":"Color/Border/Feedback/Success","style":"code"},{"text":", ","style":"normal"},{"text":"Color/Icon/Feedback/Success","style":"code"}],[{"text":"#299157","style":"code"},{"text":", ","style":"normal"},{"text":"#299157","style":"code"}],[{"text":"check-contained","style":"code"},{"text":" icon + success border","style":"normal"}]]]},{"type":"heading","level":2,"text":"States","segments":[{"text":"States","style":"normal"}]},{"type":"paragraph","text":"This component has no interactive states in the current Figma component set.","segments":[{"text":"This component has no interactive states in the current Figma component set.","style":"normal"}]},{"type":"paragraph","text":"Feedback semantics are represented through the Type variant, not through hover/focus/pressed states.","segments":[{"text":"Feedback semantics are represented through the ","style":"normal"},{"text":"Type","style":"code"},{"text":" variant, not through ","style":"normal"},{"text":"hover","style":"code"},{"text":"/","style":"normal"},{"text":"focus","style":"code"},{"text":"/","style":"normal"},{"text":"pressed","style":"code"},{"text":" states.","style":"normal"}]},{"type":"heading","level":2,"text":"Usage Guidelines","segments":[{"text":"Usage Guidelines","style":"normal"}]},{"type":"heading","level":3,"text":"Behavior","segments":[{"text":"Behavior","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"When to use: Use Information, Warning, and Positive to communicate concise status feedback in context.","segments":[{"text":"When to use","style":"bold"},{"text":": Use ","style":"normal"},{"text":"Information","style":"code"},{"text":", ","style":"normal"},{"text":"Warning","style":"code"},{"text":", and ","style":"normal"},{"text":"Positive","style":"code"},{"text":" to communicate concise status feedback in context.","style":"normal"}],"depth":0,"ordered":false},{"text":"When not to use: Do not use this component for persistent page-level navigation or long-form guidance.","segments":[{"text":"When not to use","style":"bold"},{"text":": Do not use this component for persistent page-level navigation or long-form guidance.","style":"normal"}],"depth":0,"ordered":false},{"text":"Do: Keep icon size and spacing unchanged to preserve visual rhythm.","segments":[{"text":"Do","style":"bold"},{"text":": Keep icon size and spacing unchanged to preserve visual rhythm.","style":"normal"}],"depth":0,"ordered":false},{"text":"Do: Keep semantic feedback tokens aligned with the selected variant.","segments":[{"text":"Do","style":"bold"},{"text":": Keep semantic feedback tokens aligned with the selected variant.","style":"normal"}],"depth":0,"ordered":false},{"text":"Don't: Replace semantic border/icon tokens with neutral values.","segments":[{"text":"Don't","style":"bold"},{"text":": Replace semantic border/icon tokens with neutral values.","style":"normal"}],"depth":0,"ordered":false},{"text":"Don't: Use this component for multi-paragraph content.","segments":[{"text":"Don't","style":"bold"},{"text":": Use this component for multi-paragraph content.","style":"normal"}],"depth":0,"ordered":false},{"text":"Responsive behavior: TBD","segments":[{"text":"Responsive behavior: ","style":"normal"},{"text":"TBD","style":"code"}],"depth":0,"ordered":false},{"text":"Overflow / truncation behavior: TBD","segments":[{"text":"Overflow / truncation behavior: ","style":"normal"},{"text":"TBD","style":"code"}],"depth":0,"ordered":false},{"text":"i18n / RTL behavior: TBD","segments":[{"text":"i18n / RTL behavior: ","style":"normal"},{"text":"TBD","style":"code"}],"depth":0,"ordered":false}]},{"type":"heading","level":3,"text":"Examples","segments":[{"text":"Examples","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Basic example: Type=Information for neutral informational feedback inside forms or cards.","segments":[{"text":"Basic example: ","style":"normal"},{"text":"Type=Information","style":"code"},{"text":" for neutral informational feedback inside forms or cards.","style":"normal"}],"depth":0,"ordered":false},{"text":"Contextual example: Type=Warning or Type=Positive for validation and result feedback after user actions.","segments":[{"text":"Contextual example: ","style":"normal"},{"text":"Type=Warning","style":"code"},{"text":" or ","style":"normal"},{"text":"Type=Positive","style":"code"},{"text":" for validation and result feedback after user actions.","style":"normal"}],"depth":0,"ordered":false}]},{"type":"heading","level":2,"text":"Content Guidelines","segments":[{"text":"Content Guidelines","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Use short, direct message text.","segments":[{"text":"Use short, direct message text.","style":"normal"}],"depth":0,"ordered":false},{"text":"Prefer one sentence per alert.","segments":[{"text":"Prefer one sentence per alert.","style":"normal"}],"depth":0,"ordered":false},{"text":"Use sentence case.","segments":[{"text":"Use sentence case.","style":"normal"}],"depth":0,"ordered":false},{"text":"Avoid unnecessary punctuation and repeated emphasis.","segments":[{"text":"Avoid unnecessary punctuation and repeated emphasis.","style":"normal"}],"depth":0,"ordered":false}]},{"type":"heading","level":2,"text":"Accessibility","segments":[{"text":"Accessibility","style":"normal"}]},{"type":"heading","level":3,"text":"1. ARIA role and semantics","segments":[{"text":"1. ARIA role and semantics","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Expected role for passive feedback: role=\"alert\".","segments":[{"text":"Expected role for passive feedback: ","style":"normal"},{"text":"role=\"alert\"","style":"code"},{"text":".","style":"normal"}],"depth":0,"ordered":false},{"text":"If the host context already conveys live feedback semantics, use semantic HTML and avoid duplicate ARIA.","segments":[{"text":"If the host context already conveys live feedback semantics, use semantic HTML and avoid duplicate ARIA.","style":"normal"}],"depth":0,"ordered":false},{"text":"Required ARIA attributes are TBD for this component configuration.","segments":[{"text":"Required ARIA attributes are ","style":"normal"},{"text":"TBD","style":"code"},{"text":" for this component configuration.","style":"normal"}],"depth":0,"ordered":false}]},{"type":"heading","level":3,"text":"2. Keyboard navigation","segments":[{"text":"2. Keyboard navigation","style":"normal"}]},{"type":"paragraph","text":"This component is not keyboard-interactive in the current Figma configuration.","segments":[{"text":"This component is not keyboard-interactive in the current Figma configuration.","style":"normal"}]},{"type":"heading","level":3,"text":"3. Focus management","segments":[{"text":"3. Focus management","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"This component has no focusable element in the current Figma definition.","segments":[{"text":"This component has no focusable element in the current Figma definition.","style":"normal"}],"depth":0,"ordered":false},{"text":"Focus behavior for dismissible/interactive alert variants is TBD.","segments":[{"text":"Focus behavior for dismissible/interactive alert variants is ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}],"depth":0,"ordered":false},{"text":"Focus outline tokens (Semantic.Color.Focus-Outline.Inner (#FFFFFF), Semantic.Color.Focus-Outline.Outer (#567680)) are TBD for this component.","segments":[{"text":"Focus outline tokens (","style":"normal"},{"text":"Semantic.Color.Focus-Outline.Inner","style":"code"},{"text":" (","style":"normal"},{"text":"#FFFFFF","style":"code"},{"text":"), ","style":"normal"},{"text":"Semantic.Color.Focus-Outline.Outer","style":"code"},{"text":" (","style":"normal"},{"text":"#567680","style":"code"},{"text":")) are ","style":"normal"},{"text":"TBD","style":"code"},{"text":" for this component.","style":"normal"}],"depth":0,"ordered":false}]},{"type":"heading","level":3,"text":"4. Labeling","segments":[{"text":"4. Labeling","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"The message text itself provides the accessible content.","segments":[{"text":"The message text itself provides the accessible content.","style":"normal"}],"depth":0,"ordered":false},{"text":"Additional labeling patterns (aria-label, aria-labelledby, aria-describedby) are TBD for interactive variants.","segments":[{"text":"Additional labeling patterns (","style":"normal"},{"text":"aria-label","style":"code"},{"text":", ","style":"normal"},{"text":"aria-labelledby","style":"code"},{"text":", ","style":"normal"},{"text":"aria-describedby","style":"code"},{"text":") are ","style":"normal"},{"text":"TBD","style":"code"},{"text":" for interactive variants.","style":"normal"}],"depth":0,"ordered":false}]},{"type":"heading","level":3,"text":"5. Contrast and visibility","segments":[{"text":"5. Contrast and visibility","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"The component should not rely on color alone; iconography and text must remain present with each variant.","segments":[{"text":"The component should not rely on color alone; iconography and text must remain present with each variant.","style":"normal"}],"depth":0,"ordered":false},{"text":"Verified contrast ratios are TBD (pending audit).","segments":[{"text":"Verified contrast ratios are ","style":"normal"},{"text":"TBD (pending audit)","style":"code"},{"text":".","style":"normal"}],"depth":0,"ordered":false}]},{"type":"heading","level":2,"text":"Related Components","segments":[{"text":"Related Components","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"[Status Bar](status_bar.md): Use for fixed device/system chrome, not inline feedback messaging.","segments":[{"text":"[Status Bar](status_bar.md): Use for fixed device/system chrome, not inline feedback messaging.","style":"normal"}],"depth":0,"ordered":false},{"text":"[Bottom Bar](bottom_bar.md): Use for persistent action navigation, not semantic feedback.","segments":[{"text":"[Bottom Bar](bottom_bar.md): Use for persistent action navigation, not semantic feedback.","style":"normal"}],"depth":0,"ordered":false}]}],"stats":{"headings":24,"paragraphs":9,"lists":15,"tables":3,"codeBlocks":0}},"theme":{"name":"figma-doc-theme-karmap","status":"ready","description":"Render contract for converting markdown component docs into Figma documentation sections. Styled to match the Karmap / Iter design system visual identity: Lora headings, Nunito Sans body, cucumber-green accents on warm cream surfaces.\n","layout":{"target":{"section_name_pattern":"Doc/{component_name}","position":{"reference":"component_section","offset_x":200,"align_y":"top"}},"section":{"width":940,"min_height":1100},"canvas":{"inset":40,"width":860,"padding":{"top":32,"right":32,"bottom":32,"left":32},"item_spacing":20}},"theme":{"colors":{"page_bg":"Color/BW/White","section_border":"Color/Border/Neutral/Default","canvas_shadow":"#00000014","card_bg":"Color/Background/Surface/Card","card_border":"Color/Border/Neutral/Default","table_header_bg":"#F5F0E6","title_text":"#495841","heading_text":"#495841","body_text":"Color/Text/Neutral/Default","muted_text":"#716666","chip_bg":"#E8F0E4","chip_border":"#C9E0BE","chip_text":"#495841","header_accent":"#C9E0BE"},"radii":{"canvas":"Dimension/Border/Radius/200","card":"Dimension/Border/Radius/200","chip":"Dimension/Border/Radius/200","header_accent":"Dimension/Border/Radius/200"},"strokes":{"section_border":1.5,"card_border":1,"chip_border":1},"spacing":{"card_padding":20,"card_gap":12,"chip_padding_v":5,"chip_padding_h":12,"chip_gap":8,"paragraph_gap":8,"list_gap":6,"header_accent_padding_v":16,"header_accent_padding_h":24},"typography":{"font_family":"Nunito Sans","font_family_heading":"Lora","font_family_mono":"Roboto Mono","h1":{"font_family":"Lora","size":36,"line_height":42,"weight":"Bold","color":"title_text"},"h2":{"font_family":"Lora","size":20,"line_height":26,"weight":"Bold","color":"heading_text"},"h3":{"size":16,"line_height":24,"weight":"SemiBold","color":"heading_text"},"body":{"size":15,"line_height":24,"weight":"Regular","color":"body_text"},"body_small":{"size":13,"line_height":18,"weight":"SemiBold","color":"chip_text"}}},"markdown_mapping":{"document":{"wrapper":"canvas"},"title":{"component":"header_block","text_style":"h1"},"subtitle":{"component":"intro_text","text_style":"body","color_override":"muted_text"},"heading_2":{"component":"card","title_style":"h2"},"heading_3":{"component":"inline_heading","text_style":"h3"},"paragraph":{"component":"text","text_style":"body"},"unordered_list":{"component":"stack","item_gap":"list_gap"},"ordered_list":{"component":"stack","item_gap":"list_gap"},"list_item":{"component":"text","text_style":"body"},"table":{"component":"table_card","header_style":"h3","cell_style":"body","border_color":"card_border","header_bg":"table_header_bg"},"code_inline":{"component":"text","text_style":"body","color_override":"heading_text"}},"components":{"header_block":{"layout":"vertical","stretch":true,"item_spacing":8,"accent":{"enabled":true,"fills":{"color":"header_accent"},"radius":"Dimension/Border/Radius/200","padding":{"top":16,"right":24,"bottom":16,"left":24}}},"chips_row":{"layout":"horizontal","stretch":true,"item_spacing":8},"card":{"layout":"vertical","stretch":true,"width":796,"padding":{"top":20,"right":20,"bottom":20,"left":20},"item_spacing":12,"fills":{"color":"card_bg"},"strokes":{"color":"card_border","weight":1},"radius":"Dimension/Border/Radius/200"},"table_card":{"extends":"card","table":{"cell_padding_v":8,"cell_padding_h":10,"min_row_height":"auto","row_gap":0,"column_gap":0,"border_weight":1,"header_bg":"table_header_bg"}}},"rules":["Keep one visual card per H2 section.","Render markdown in source order; do not reorder content blocks.","Preserve semantic spacing and hierarchy from heading levels.","Avoid hardcoded widths for text nodes; use stretch behavior when possible.","If a markdown element is unsupported, render it as body text and flag it in report.","Use Lora for h1 and h2 headings; Nunito Sans for everything else.","Table header rows use a tinted background to distinguish from body rows.","The header accent block wraps the title area with a brand-colored background."],"output_contract":{"report_fields":["markdown_path","target_section_id","theme_name","offset_x_applied","unsupported_blocks"]}},"tokenColors":{"components.bottom-bar.background-default":"#ececec","bottom-bar/background-default":"#ececec","bottom-bar.background-default":"#ececec","components/bottom-bar/background-default":"#ececec","_components/bottom-bar/background-default":"#ececec","components.bottom-bar.background-selected":"#ffffff","bottom-bar/background-selected":"#ffffff","bottom-bar.background-selected":"#ffffff","components/bottom-bar/background-selected":"#ffffff","_components/bottom-bar/background-selected":"#ffffff","primitives.color.blue.100":"#dff7ff","color/blue/100":"#dff7ff","color.blue.100":"#dff7ff","primitives/color/blue/100":"#dff7ff","_primitives/color/blue/100":"#dff7ff","primitives/blue/100":"#dff7ff","_primitives/blue/100":"#dff7ff","primitives.color.blue.200":"#c5f0ff","color/blue/200":"#c5f0ff","color.blue.200":"#c5f0ff","primitives/color/blue/200":"#c5f0ff","_primitives/color/blue/200":"#c5f0ff","primitives/blue/200":"#c5f0ff","_primitives/blue/200":"#c5f0ff","primitives.color.blue.300":"#add8e6","color/blue/300":"#add8e6","color.blue.300":"#add8e6","primitives/color/blue/300":"#add8e6","_primitives/color/blue/300":"#add8e6","primitives/blue/300":"#add8e6","_primitives/blue/300":"#add8e6","primitives.color.blue.400":"#96bfcc","color/blue/400":"#96bfcc","color.blue.400":"#96bfcc","primitives/color/blue/400":"#96bfcc","_primitives/color/blue/400":"#96bfcc","primitives/blue/400":"#96bfcc","_primitives/blue/400":"#96bfcc","primitives.color.blue.500":"#7fa6b3","color/blue/500":"#7fa6b3","color.blue.500":"#7fa6b3","primitives/color/blue/500":"#7fa6b3","_primitives/color/blue/500":"#7fa6b3","primitives/blue/500":"#7fa6b3","_primitives/blue/500":"#7fa6b3","primitives.color.blue.600":"#6a8e99","color/blue/600":"#6a8e99","color.blue.600":"#6a8e99","primitives/color/blue/600":"#6a8e99","_primitives/color/blue/600":"#6a8e99","primitives/blue/600":"#6a8e99","_primitives/blue/600":"#6a8e99","primitives.color.blue.700":"#567680","color/blue/700":"#567680","color.blue.700":"#567680","primitives/color/blue/700":"#567680","_primitives/color/blue/700":"#567680","primitives/blue/700":"#567680","_primitives/blue/700":"#567680","primitives.color.blue.800":"#435e67","color/blue/800":"#435e67","color.blue.800":"#435e67","primitives/color/blue/800":"#435e67","_primitives/color/blue/800":"#435e67","primitives/blue/800":"#435e67","_primitives/blue/800":"#435e67","primitives.color.blue.900":"#31464d","color/blue/900":"#31464d","color.blue.900":"#31464d","primitives/color/blue/900":"#31464d","_primitives/color/blue/900":"#31464d","primitives/blue/900":"#31464d","_primitives/blue/900":"#31464d","primitives.color.bw.black":"#000000","color/bw/black":"#000000","color.bw.black":"#000000","primitives/color/bw/black":"#000000","_primitives/color/bw/black":"#000000","primitives/bw/black":"#000000","_primitives/bw/black":"#000000","primitives.color.bw.black-05":"#0000000d","color/bw/black-05":"#0000000d","color.bw.black-05":"#0000000d","primitives/color/bw/black-05":"#0000000d","_primitives/color/bw/black-05":"#0000000d","primitives/bw/black-05":"#0000000d","_primitives/bw/black-05":"#0000000d","primitives.color.bw.black-07":"#00000014","color/bw/black-07":"#00000014","color.bw.black-07":"#00000014","primitives/color/bw/black-07":"#00000014","_primitives/color/bw/black-07":"#00000014","primitives/bw/black-07":"#00000014","_primitives/bw/black-07":"#00000014","primitives.color.bw.black-10":"#0000001a","color/bw/black-10":"#0000001a","color.bw.black-10":"#0000001a","primitives/color/bw/black-10":"#0000001a","_primitives/color/bw/black-10":"#0000001a","primitives/bw/black-10":"#0000001a","_primitives/bw/black-10":"#0000001a","primitives.color.bw.black-16":"#00000029","color/bw/black-16":"#00000029","color.bw.black-16":"#00000029","primitives/color/bw/black-16":"#00000029","_primitives/color/bw/black-16":"#00000029","primitives/bw/black-16":"#00000029","_primitives/bw/black-16":"#00000029","primitives.color.bw.black-20":"#00000033","color/bw/black-20":"#00000033","color.bw.black-20":"#00000033","primitives/color/bw/black-20":"#00000033","_primitives/color/bw/black-20":"#00000033","primitives/bw/black-20":"#00000033","_primitives/bw/black-20":"#00000033","primitives.color.bw.white":"#ffffff","color/bw/white":"#ffffff","color.bw.white":"#ffffff","primitives/color/bw/white":"#ffffff","_primitives/color/bw/white":"#ffffff","primitives/bw/white":"#ffffff","_primitives/bw/white":"#ffffff","primitives.color.cucumber.100":"#e0f7d6","color/cucumber/100":"#e0f7d6","color.cucumber.100":"#e0f7d6","primitives/color/cucumber/100":"#e0f7d6","_primitives/color/cucumber/100":"#e0f7d6","primitives/cucumber/100":"#e0f7d6","_primitives/cucumber/100":"#e0f7d6","primitives.color.cucumber.200":"#c9e0be","color/cucumber/200":"#c9e0be","color.cucumber.200":"#c9e0be","primitives/color/cucumber/200":"#c9e0be","_primitives/color/cucumber/200":"#c9e0be","primitives/cucumber/200":"#c9e0be","_primitives/cucumber/200":"#c9e0be","primitives.color.cucumber.300":"#b2c9a7","color/cucumber/300":"#b2c9a7","color.cucumber.300":"#b2c9a7","primitives/color/cucumber/300":"#b2c9a7","_primitives/color/cucumber/300":"#b2c9a7","primitives/cucumber/300":"#b2c9a7","_primitives/cucumber/300":"#b2c9a7","primitives.color.cucumber.400":"#9cb391","color/cucumber/400":"#9cb391","color.cucumber.400":"#9cb391","primitives/color/cucumber/400":"#9cb391","_primitives/color/cucumber/400":"#9cb391","primitives/cucumber/400":"#9cb391","_primitives/cucumber/400":"#9cb391","primitives.color.cucumber.500":"#869c7c","color/cucumber/500":"#869c7c","color.cucumber.500":"#869c7c","primitives/color/cucumber/500":"#869c7c","_primitives/color/cucumber/500":"#869c7c","primitives/cucumber/500":"#869c7c","_primitives/cucumber/500":"#869c7c","primitives.color.cucumber.600":"#718568","color/cucumber/600":"#718568","color.cucumber.600":"#718568","primitives/color/cucumber/600":"#718568","_primitives/color/cucumber/600":"#718568","primitives/cucumber/600":"#718568","_primitives/cucumber/600":"#718568","primitives.color.cucumber.700":"#5d6f54","color/cucumber/700":"#5d6f54","color.cucumber.700":"#5d6f54","primitives/color/cucumber/700":"#5d6f54","_primitives/color/cucumber/700":"#5d6f54","primitives/cucumber/700":"#5d6f54","_primitives/cucumber/700":"#5d6f54","primitives.color.cucumber.800":"#495841","color/cucumber/800":"#495841","color.cucumber.800":"#495841","primitives/color/cucumber/800":"#495841","_primitives/color/cucumber/800":"#495841","primitives/cucumber/800":"#495841","_primitives/cucumber/800":"#495841","primitives.color.cucumber.900":"#35412f","color/cucumber/900":"#35412f","color.cucumber.900":"#35412f","primitives/color/cucumber/900":"#35412f","_primitives/color/cucumber/900":"#35412f","primitives/cucumber/900":"#35412f","_primitives/cucumber/900":"#35412f","primitives.color.extra-palette.bermuda":"#88d8d0","color/extra-palette/bermuda":"#88d8d0","color.extra-palette.bermuda":"#88d8d0","primitives/color/extra-palette/bermuda":"#88d8d0","_primitives/color/extra-palette/bermuda":"#88d8d0","primitives/extra-palette/bermuda":"#88d8d0","_primitives/extra-palette/bermuda":"#88d8d0","primitives.color.extra-palette.english-cream":"#fffaf0","color/extra-palette/english-cream":"#fffaf0","color.extra-palette.english-cream":"#fffaf0","primitives/color/extra-palette/english-cream":"#fffaf0","_primitives/color/extra-palette/english-cream":"#fffaf0","primitives/extra-palette/english-cream":"#fffaf0","_primitives/extra-palette/english-cream":"#fffaf0","primitives.color.extra-palette.lavender":"#b7a4c4","color/extra-palette/lavender":"#b7a4c4","color.extra-palette.lavender":"#b7a4c4","primitives/color/extra-palette/lavender":"#b7a4c4","_primitives/color/extra-palette/lavender":"#b7a4c4","primitives/extra-palette/lavender":"#b7a4c4","_primitives/extra-palette/lavender":"#b7a4c4","primitives.color.extra-palette.lime-cream":"#f0f9c5","color/extra-palette/lime-cream":"#f0f9c5","color.extra-palette.lime-cream":"#f0f9c5","primitives/color/extra-palette/lime-cream":"#f0f9c5","_primitives/color/extra-palette/lime-cream":"#f0f9c5","primitives/extra-palette/lime-cream":"#f0f9c5","_primitives/extra-palette/lime-cream":"#f0f9c5","primitives.color.extra-palette.moon-raker":"#e6e6fa","color/extra-palette/moon-raker":"#e6e6fa","color.extra-palette.moon-raker":"#e6e6fa","primitives/color/extra-palette/moon-raker":"#e6e6fa","_primitives/color/extra-palette/moon-raker":"#e6e6fa","primitives/extra-palette/moon-raker":"#e6e6fa","_primitives/extra-palette/moon-raker":"#e6e6fa","primitives.color.grey.100":"#ececec","color/grey/100":"#ececec","color.grey.100":"#ececec","primitives/color/grey/100":"#ececec","_primitives/color/grey/100":"#ececec","primitives/grey/100":"#ececec","_primitives/grey/100":"#ececec","primitives.color.grey.200":"#d7d4d4","color/grey/200":"#d7d4d4","color.grey.200":"#d7d4d4","primitives/color/grey/200":"#d7d4d4","_primitives/color/grey/200":"#d7d4d4","primitives/grey/200":"#d7d4d4","_primitives/grey/200":"#d7d4d4","primitives.color.grey.300":"#c3bdbd","color/grey/300":"#c3bdbd","color.grey.300":"#c3bdbd","primitives/color/grey/300":"#c3bdbd","_primitives/color/grey/300":"#c3bdbd","primitives/grey/300":"#c3bdbd","_primitives/grey/300":"#c3bdbd","primitives.color.grey.400":"#aea6a6","color/grey/400":"#aea6a6","color.grey.400":"#aea6a6","primitives/color/grey/400":"#aea6a6","_primitives/color/grey/400":"#aea6a6","primitives/grey/400":"#aea6a6","_primitives/grey/400":"#aea6a6","primitives.color.grey.500":"#9a9090","color/grey/500":"#9a9090","color.grey.500":"#9a9090","primitives/color/grey/500":"#9a9090","_primitives/color/grey/500":"#9a9090","primitives/grey/500":"#9a9090","_primitives/grey/500":"#9a9090","primitives.color.grey.600":"#867b7b","color/grey/600":"#867b7b","color.grey.600":"#867b7b","primitives/color/grey/600":"#867b7b","_primitives/color/grey/600":"#867b7b","primitives/grey/600":"#867b7b","_primitives/grey/600":"#867b7b","primitives.color.grey.700":"#716666","color/grey/700":"#716666","color.grey.700":"#716666","primitives/color/grey/700":"#716666","_primitives/color/grey/700":"#716666","primitives/grey/700":"#716666","_primitives/grey/700":"#716666","primitives.color.grey.800":"#5d5252","color/grey/800":"#5d5252","color.grey.800":"#5d5252","primitives/color/grey/800":"#5d5252","_primitives/color/grey/800":"#5d5252","primitives/grey/800":"#5d5252","_primitives/grey/800":"#5d5252","primitives.color.grey.900":"#483f3f","color/grey/900":"#483f3f","color.grey.900":"#483f3f","primitives/color/grey/900":"#483f3f","_primitives/color/grey/900":"#483f3f","primitives/grey/900":"#483f3f","_primitives/grey/900":"#483f3f","primitives.color.ocean-green.100":"#d0ffe5","color/ocean-green/100":"#d0ffe5","color.ocean-green.100":"#d0ffe5","primitives/color/ocean-green/100":"#d0ffe5","_primitives/color/ocean-green/100":"#d0ffe5","primitives/ocean-green/100":"#d0ffe5","_primitives/ocean-green/100":"#d0ffe5","primitives.color.ocean-green.200":"#b0ffd3","color/ocean-green/200":"#b0ffd3","color.ocean-green.200":"#b0ffd3","primitives/color/ocean-green/200":"#b0ffd3","_primitives/color/ocean-green/200":"#b0ffd3","primitives/ocean-green/200":"#b0ffd3","_primitives/ocean-green/200":"#b0ffd3","primitives.color.ocean-green.300":"#90ffc1","color/ocean-green/300":"#90ffc1","color.ocean-green.300":"#90ffc1","primitives/color/ocean-green/300":"#90ffc1","_primitives/color/ocean-green/300":"#90ffc1","primitives/ocean-green/300":"#90ffc1","_primitives/ocean-green/300":"#90ffc1","primitives.color.ocean-green.400":"#6df7aa","color/ocean-green/400":"#6df7aa","color.ocean-green.400":"#6df7aa","primitives/color/ocean-green/400":"#6df7aa","_primitives/color/ocean-green/400":"#6df7aa","primitives/ocean-green/400":"#6df7aa","_primitives/ocean-green/400":"#6df7aa","primitives.color.ocean-green.500":"#52d58d","color/ocean-green/500":"#52d58d","color.ocean-green.500":"#52d58d","primitives/color/ocean-green/500":"#52d58d","_primitives/color/ocean-green/500":"#52d58d","primitives/ocean-green/500":"#52d58d","_primitives/ocean-green/500":"#52d58d","primitives.color.ocean-green.600":"#3cb371","color/ocean-green/600":"#3cb371","color.ocean-green.600":"#3cb371","primitives/color/ocean-green/600":"#3cb371","_primitives/color/ocean-green/600":"#3cb371","primitives/ocean-green/600":"#3cb371","_primitives/ocean-green/600":"#3cb371","primitives.color.ocean-green.700":"#299157","color/ocean-green/700":"#299157","color.ocean-green.700":"#299157","primitives/color/ocean-green/700":"#299157","_primitives/color/ocean-green/700":"#299157","primitives/ocean-green/700":"#299157","_primitives/ocean-green/700":"#299157","primitives.color.ocean-green.800":"#1a6f40","color/ocean-green/800":"#1a6f40","color.ocean-green.800":"#1a6f40","primitives/color/ocean-green/800":"#1a6f40","_primitives/color/ocean-green/800":"#1a6f40","primitives/ocean-green/800":"#1a6f40","_primitives/ocean-green/800":"#1a6f40","primitives.color.ocean-green.900":"#0e4d2a","color/ocean-green/900":"#0e4d2a","color.ocean-green.900":"#0e4d2a","primitives/color/ocean-green/900":"#0e4d2a","_primitives/color/ocean-green/900":"#0e4d2a","primitives/ocean-green/900":"#0e4d2a","_primitives/ocean-green/900":"#0e4d2a","primitives.color.raw-umber.100":"#fff3db","color/raw-umber/100":"#fff3db","color.raw-umber.100":"#fff3db","primitives/color/raw-umber/100":"#fff3db","_primitives/color/raw-umber/100":"#fff3db","primitives/raw-umber/100":"#fff3db","_primitives/raw-umber/100":"#fff3db","primitives.color.raw-umber.200":"#fde9c0","color/raw-umber/200":"#fde9c0","color.raw-umber.200":"#fde9c0","primitives/color/raw-umber/200":"#fde9c0","_primitives/color/raw-umber/200":"#fde9c0","primitives/raw-umber/200":"#fde9c0","_primitives/raw-umber/200":"#fde9c0","primitives.color.raw-umber.300":"#f5d9a0","color/raw-umber/300":"#f5d9a0","color.raw-umber.300":"#f5d9a0","primitives/color/raw-umber/300":"#f5d9a0","_primitives/color/raw-umber/300":"#f5d9a0","primitives/raw-umber/300":"#f5d9a0","_primitives/raw-umber/300":"#f5d9a0","primitives.color.raw-umber.400":"#d7bc84","color/raw-umber/400":"#d7bc84","color.raw-umber.400":"#d7bc84","primitives/color/raw-umber/400":"#d7bc84","_primitives/color/raw-umber/400":"#d7bc84","primitives/raw-umber/400":"#d7bc84","_primitives/raw-umber/400":"#d7bc84","primitives.color.raw-umber.500":"#baa06b","color/raw-umber/500":"#baa06b","color.raw-umber.500":"#baa06b","primitives/color/raw-umber/500":"#baa06b","_primitives/color/raw-umber/500":"#baa06b","primitives/raw-umber/500":"#baa06b","_primitives/raw-umber/500":"#baa06b","primitives.color.raw-umber.600":"#9d8555","color/raw-umber/600":"#9d8555","color.raw-umber.600":"#9d8555","primitives/color/raw-umber/600":"#9d8555","_primitives/color/raw-umber/600":"#9d8555","primitives/raw-umber/600":"#9d8555","_primitives/raw-umber/600":"#9d8555","primitives.color.raw-umber.700":"#806b40","color/raw-umber/700":"#806b40","color.raw-umber.700":"#806b40","primitives/color/raw-umber/700":"#806b40","_primitives/color/raw-umber/700":"#806b40","primitives/raw-umber/700":"#806b40","_primitives/raw-umber/700":"#806b40","primitives.color.raw-umber.800":"#63512e","color/raw-umber/800":"#63512e","color.raw-umber.800":"#63512e","primitives/color/raw-umber/800":"#63512e","_primitives/color/raw-umber/800":"#63512e","primitives/raw-umber/800":"#63512e","_primitives/raw-umber/800":"#63512e","primitives.color.raw-umber.900":"#46391e","color/raw-umber/900":"#46391e","color.raw-umber.900":"#46391e","primitives/color/raw-umber/900":"#46391e","_primitives/color/raw-umber/900":"#46391e","primitives/raw-umber/900":"#46391e","_primitives/raw-umber/900":"#46391e","primitives.color.red.100":"#ffc6c6","color/red/100":"#ffc6c6","color.red.100":"#ffc6c6","primitives/color/red/100":"#ffc6c6","_primitives/color/red/100":"#ffc6c6","primitives/red/100":"#ffc6c6","_primitives/red/100":"#ffc6c6","primitives.color.red.200":"#ff9f9f","color/red/200":"#ff9f9f","color.red.200":"#ff9f9f","primitives/color/red/200":"#ff9f9f","_primitives/color/red/200":"#ff9f9f","primitives/red/200":"#ff9f9f","_primitives/red/200":"#ff9f9f","primitives.color.red.300":"#ff7878","color/red/300":"#ff7878","color.red.300":"#ff7878","primitives/color/red/300":"#ff7878","_primitives/color/red/300":"#ff7878","primitives/red/300":"#ff7878","_primitives/red/300":"#ff7878","primitives.color.red.400":"#f64e4e","color/red/400":"#f64e4e","color.red.400":"#f64e4e","primitives/color/red/400":"#f64e4e","_primitives/color/red/400":"#f64e4e","primitives/red/400":"#f64e4e","_primitives/red/400":"#f64e4e","primitives.color.red.500":"#d43636","color/red/500":"#d43636","color.red.500":"#d43636","primitives/color/red/500":"#d43636","_primitives/color/red/500":"#d43636","primitives/red/500":"#d43636","_primitives/red/500":"#d43636","primitives.color.red.600":"#b22222","color/red/600":"#b22222","color.red.600":"#b22222","primitives/color/red/600":"#b22222","_primitives/color/red/600":"#b22222","primitives/red/600":"#b22222","_primitives/red/600":"#b22222","primitives.color.red.700":"#901212","color/red/700":"#901212","color.red.700":"#901212","primitives/color/red/700":"#901212","_primitives/color/red/700":"#901212","primitives/red/700":"#901212","_primitives/red/700":"#901212","primitives.color.red.800":"#6e0707","color/red/800":"#6e0707","color.red.800":"#6e0707","primitives/color/red/800":"#6e0707","_primitives/color/red/800":"#6e0707","primitives/red/800":"#6e0707","_primitives/red/800":"#6e0707","primitives.color.red.900":"#4c0000","color/red/900":"#4c0000","color.red.900":"#4c0000","primitives/color/red/900":"#4c0000","_primitives/color/red/900":"#4c0000","primitives/red/900":"#4c0000","_primitives/red/900":"#4c0000","semantic.color.background.action.danger.active":"#901212","color/background/action/danger/active":"#901212","color.background.action.danger.active":"#901212","semantic/color/background/action/danger/active":"#901212","_semantic/color/background/action/danger/active":"#901212","semantic.color.background.action.danger.default":"#b22222","color/background/action/danger/default":"#b22222","color.background.action.danger.default":"#b22222","semantic/color/background/action/danger/default":"#b22222","_semantic/color/background/action/danger/default":"#b22222","semantic.color.background.action.danger.hover":"#d43636","color/background/action/danger/hover":"#d43636","color.background.action.danger.hover":"#d43636","semantic/color/background/action/danger/hover":"#d43636","_semantic/color/background/action/danger/hover":"#d43636","semantic.color.background.action.disabled.default":"#ececec","color/background/action/disabled/default":"#ececec","color.background.action.disabled.default":"#ececec","semantic/color/background/action/disabled/default":"#ececec","_semantic/color/background/action/disabled/default":"#ececec","semantic.color.background.action.primary.active":"#96bfcc","color/background/action/primary/active":"#96bfcc","color.background.action.primary.active":"#96bfcc","semantic/color/background/action/primary/active":"#96bfcc","_semantic/color/background/action/primary/active":"#96bfcc","semantic.color.background.action.primary.default":"#add8e6","color/background/action/primary/default":"#add8e6","color.background.action.primary.default":"#add8e6","semantic/color/background/action/primary/default":"#add8e6","_semantic/color/background/action/primary/default":"#add8e6","semantic.color.background.action.primary.hover":"#c5f0ff","color/background/action/primary/hover":"#c5f0ff","color.background.action.primary.hover":"#c5f0ff","semantic/color/background/action/primary/hover":"#c5f0ff","_semantic/color/background/action/primary/hover":"#c5f0ff","semantic.color.background.action.secondary.active":"#b2c9a7","color/background/action/secondary/active":"#b2c9a7","color.background.action.secondary.active":"#b2c9a7","semantic/color/background/action/secondary/active":"#b2c9a7","_semantic/color/background/action/secondary/active":"#b2c9a7","semantic.color.background.action.secondary.default":"#c9e0be","color/background/action/secondary/default":"#c9e0be","color.background.action.secondary.default":"#c9e0be","semantic/color/background/action/secondary/default":"#c9e0be","_semantic/color/background/action/secondary/default":"#c9e0be","semantic.color.background.action.secondary.hover":"#e0f7d6","color/background/action/secondary/hover":"#e0f7d6","color.background.action.secondary.hover":"#e0f7d6","semantic/color/background/action/secondary/hover":"#e0f7d6","_semantic/color/background/action/secondary/hover":"#e0f7d6","semantic.color.background.brand.primary":"#add8e6","color/background/brand/primary":"#add8e6","color.background.brand.primary":"#add8e6","semantic/color/background/brand/primary":"#add8e6","_semantic/color/background/brand/primary":"#add8e6","semantic.color.background.brand.secondary":"#c9e0be","color/background/brand/secondary":"#c9e0be","color.background.brand.secondary":"#c9e0be","semantic/color/background/brand/secondary":"#c9e0be","_semantic/color/background/brand/secondary":"#c9e0be","semantic.color.background.brand.secondary-dark":"#495841","color/background/brand/secondary-dark":"#495841","color.background.brand.secondary-dark":"#495841","semantic/color/background/brand/secondary-dark":"#495841","_semantic/color/background/brand/secondary-dark":"#495841","semantic.color.background.brand.tertiary":"#b7a4c4","color/background/brand/tertiary":"#b7a4c4","color.background.brand.tertiary":"#b7a4c4","semantic/color/background/brand/tertiary":"#b7a4c4","_semantic/color/background/brand/tertiary":"#b7a4c4","semantic.color.background.decorative.100":"#c5f0ff","color/background/decorative/100":"#c5f0ff","color.background.decorative.100":"#c5f0ff","semantic/color/background/decorative/100":"#c5f0ff","_semantic/color/background/decorative/100":"#c5f0ff","semantic.color.background.decorative.200":"#fffaf0","color/background/decorative/200":"#fffaf0","color.background.decorative.200":"#fffaf0","semantic/color/background/decorative/200":"#fffaf0","_semantic/color/background/decorative/200":"#fffaf0","semantic.color.background.decorative.300":"#88d8d0","color/background/decorative/300":"#88d8d0","color.background.decorative.300":"#88d8d0","semantic/color/background/decorative/300":"#88d8d0","_semantic/color/background/decorative/300":"#88d8d0","semantic.color.background.decorative.400":"#ffc6c6","color/background/decorative/400":"#ffc6c6","color.background.decorative.400":"#ffc6c6","semantic/color/background/decorative/400":"#ffc6c6","_semantic/color/background/decorative/400":"#ffc6c6","semantic.color.background.decorative.500":"#e6e6fa","color/background/decorative/500":"#e6e6fa","color.background.decorative.500":"#e6e6fa","semantic/color/background/decorative/500":"#e6e6fa","_semantic/color/background/decorative/500":"#e6e6fa","semantic.color.background.decorative.600":"#f0f9c5","color/background/decorative/600":"#f0f9c5","color.background.decorative.600":"#f0f9c5","semantic/color/background/decorative/600":"#f0f9c5","_semantic/color/background/decorative/600":"#f0f9c5","semantic.color.background.feedback.default":"#ffffff","color/background/feedback/default":"#ffffff","color.background.feedback.default":"#ffffff","semantic/color/background/feedback/default":"#ffffff","_semantic/color/background/feedback/default":"#ffffff","semantic.color.background.overlay.media":"#0000001a","color/background/overlay/media":"#0000001a","color.background.overlay.media":"#0000001a","semantic/color/background/overlay/media":"#0000001a","_semantic/color/background/overlay/media":"#0000001a","semantic.color.background.overlay.modal":"#00000033","color/background/overlay/modal":"#00000033","color.background.overlay.modal":"#00000033","semantic/color/background/overlay/modal":"#00000033","_semantic/color/background/overlay/modal":"#00000033","semantic.color.background.surface.card":"#fffaf0","color/background/surface/card":"#fffaf0","color.background.surface.card":"#fffaf0","semantic/color/background/surface/card":"#fffaf0","_semantic/color/background/surface/card":"#fffaf0","semantic.color.background.surface.control":"#ffffff","color/background/surface/control":"#ffffff","color.background.surface.control":"#ffffff","semantic/color/background/surface/control":"#ffffff","_semantic/color/background/surface/control":"#ffffff","semantic.color.border.feedback.danger":"#b22222","color/border/feedback/danger":"#b22222","color.border.feedback.danger":"#b22222","semantic/color/border/feedback/danger":"#b22222","_semantic/color/border/feedback/danger":"#b22222","semantic.color.border.feedback.information":"#baa06b","color/border/feedback/information":"#baa06b","color.border.feedback.information":"#baa06b","semantic/color/border/feedback/information":"#baa06b","_semantic/color/border/feedback/information":"#baa06b","semantic.color.border.feedback.success":"#299157","color/border/feedback/success":"#299157","color.border.feedback.success":"#299157","semantic/color/border/feedback/success":"#299157","_semantic/color/border/feedback/success":"#299157","semantic.color.border.neutral.alpha-05":"#0000000d","color/border/neutral/alpha-05":"#0000000d","color.border.neutral.alpha-05":"#0000000d","semantic/color/border/neutral/alpha-05":"#0000000d","_semantic/color/border/neutral/alpha-05":"#0000000d","semantic.color.border.neutral.alpha-10":"#0000001a","color/border/neutral/alpha-10":"#0000001a","color.border.neutral.alpha-10":"#0000001a","semantic/color/border/neutral/alpha-10":"#0000001a","_semantic/color/border/neutral/alpha-10":"#0000001a","semantic.color.border.neutral.alpha-20":"#00000033","color/border/neutral/alpha-20":"#00000033","color.border.neutral.alpha-20":"#00000033","semantic/color/border/neutral/alpha-20":"#00000033","_semantic/color/border/neutral/alpha-20":"#00000033","semantic.color.border.neutral.default":"#9a9090","color/border/neutral/default":"#9a9090","color.border.neutral.default":"#9a9090","semantic/color/border/neutral/default":"#9a9090","_semantic/color/border/neutral/default":"#9a9090","semantic.color.border.neutral.emphasis":"#5d5252","color/border/neutral/emphasis":"#5d5252","color.border.neutral.emphasis":"#5d5252","semantic/color/border/neutral/emphasis":"#5d5252","_semantic/color/border/neutral/emphasis":"#5d5252","semantic.color.border.neutral.subtle":"#d7d4d4","color/border/neutral/subtle":"#d7d4d4","color.border.neutral.subtle":"#d7d4d4","semantic/color/border/neutral/subtle":"#d7d4d4","_semantic/color/border/neutral/subtle":"#d7d4d4","semantic.color.focus-outline.inner":"#ffffff","color/focus-outline/inner":"#ffffff","color.focus-outline.inner":"#ffffff","semantic/color/focus-outline/inner":"#ffffff","_semantic/color/focus-outline/inner":"#ffffff","semantic.color.focus-outline.outer":"#567680","color/focus-outline/outer":"#567680","color.focus-outline.outer":"#567680","semantic/color/focus-outline/outer":"#567680","_semantic/color/focus-outline/outer":"#567680","semantic.color.icon.action.on-danger":"#ffffff","color/icon/action/on-danger":"#ffffff","color.icon.action.on-danger":"#ffffff","semantic/color/icon/action/on-danger":"#ffffff","_semantic/color/icon/action/on-danger":"#ffffff","semantic.color.icon.action.on-disabled":"#5d5252","color/icon/action/on-disabled":"#5d5252","color.icon.action.on-disabled":"#5d5252","semantic/color/icon/action/on-disabled":"#5d5252","_semantic/color/icon/action/on-disabled":"#5d5252","semantic.color.icon.action.on-primary":"#483f3f","color/icon/action/on-primary":"#483f3f","color.icon.action.on-primary":"#483f3f","semantic/color/icon/action/on-primary":"#483f3f","_semantic/color/icon/action/on-primary":"#483f3f","semantic.color.icon.action.on-secondary":"#483f3f","color/icon/action/on-secondary":"#483f3f","color.icon.action.on-secondary":"#483f3f","semantic/color/icon/action/on-secondary":"#483f3f","_semantic/color/icon/action/on-secondary":"#483f3f","semantic.color.icon.feedback.danger":"#b22222","color/icon/feedback/danger":"#b22222","color.icon.feedback.danger":"#b22222","semantic/color/icon/feedback/danger":"#b22222","_semantic/color/icon/feedback/danger":"#b22222","semantic.color.icon.feedback.information":"#9d8555","color/icon/feedback/information":"#9d8555","color.icon.feedback.information":"#9d8555","semantic/color/icon/feedback/information":"#9d8555","_semantic/color/icon/feedback/information":"#9d8555","semantic.color.icon.feedback.success":"#299157","color/icon/feedback/success":"#299157","color.icon.feedback.success":"#299157","semantic/color/icon/feedback/success":"#299157","_semantic/color/icon/feedback/success":"#299157","semantic.color.icon.neutral.default":"#483f3f","color/icon/neutral/default":"#483f3f","color.icon.neutral.default":"#483f3f","semantic/color/icon/neutral/default":"#483f3f","_semantic/color/icon/neutral/default":"#483f3f","semantic.color.icon.overlay.on-overlay":"#ffffff","color/icon/overlay/on-overlay":"#ffffff","color.icon.overlay.on-overlay":"#ffffff","semantic/color/icon/overlay/on-overlay":"#ffffff","_semantic/color/icon/overlay/on-overlay":"#ffffff","semantic.color.shadow.100":"#00000014","color/shadow/100":"#00000014","color.shadow.100":"#00000014","semantic/color/shadow/100":"#00000014","_semantic/color/shadow/100":"#00000014","semantic.color.shadow.200":"#00000029","color/shadow/200":"#00000029","color.shadow.200":"#00000029","semantic/color/shadow/200":"#00000029","_semantic/color/shadow/200":"#00000029","semantic.color.shadow.300":"#00000033","color/shadow/300":"#00000033","color.shadow.300":"#00000033","semantic/color/shadow/300":"#00000033","_semantic/color/shadow/300":"#00000033","semantic.color.text.action.on-danger":"#ffffff","color/text/action/on-danger":"#ffffff","color.text.action.on-danger":"#ffffff","semantic/color/text/action/on-danger":"#ffffff","_semantic/color/text/action/on-danger":"#ffffff","semantic.color.text.action.on-disabled":"#5d5252","color/text/action/on-disabled":"#5d5252","color.text.action.on-disabled":"#5d5252","semantic/color/text/action/on-disabled":"#5d5252","_semantic/color/text/action/on-disabled":"#5d5252","semantic.color.text.action.on-primary":"#483f3f","color/text/action/on-primary":"#483f3f","color.text.action.on-primary":"#483f3f","semantic/color/text/action/on-primary":"#483f3f","_semantic/color/text/action/on-primary":"#483f3f","semantic.color.text.action.on-secondary":"#483f3f","color/text/action/on-secondary":"#483f3f","color.text.action.on-secondary":"#483f3f","semantic/color/text/action/on-secondary":"#483f3f","_semantic/color/text/action/on-secondary":"#483f3f","semantic.color.text.feedback.danger":"#b22222","color/text/feedback/danger":"#b22222","color.text.feedback.danger":"#b22222","semantic/color/text/feedback/danger":"#b22222","_semantic/color/text/feedback/danger":"#b22222","semantic.color.text.feedback.success":"#1a6f40","color/text/feedback/success":"#1a6f40","color.text.feedback.success":"#1a6f40","semantic/color/text/feedback/success":"#1a6f40","_semantic/color/text/feedback/success":"#1a6f40","semantic.color.text.link.default":"#495841","color/text/link/default":"#495841","color.text.link.default":"#495841","semantic/color/text/link/default":"#495841","_semantic/color/text/link/default":"#495841","semantic.color.text.neutral.default":"#483f3f","color/text/neutral/default":"#483f3f","color.text.neutral.default":"#483f3f","semantic/color/text/neutral/default":"#483f3f","_semantic/color/text/neutral/default":"#483f3f","semantic.color.text.neutral.muted":"#5d5252","color/text/neutral/muted":"#5d5252","color.text.neutral.muted":"#5d5252","semantic/color/text/neutral/muted":"#5d5252","_semantic/color/text/neutral/muted":"#5d5252","semantic.color.text.neutral.subtle":"#716666","color/text/neutral/subtle":"#716666","color.text.neutral.subtle":"#716666","semantic/color/text/neutral/subtle":"#716666","_semantic/color/text/neutral/subtle":"#716666","semantic.color.text.overlay.on-overlay":"#ffffff","color/text/overlay/on-overlay":"#ffffff","color.text.overlay.on-overlay":"#ffffff","semantic/color/text/overlay/on-overlay":"#ffffff","_semantic/color/text/overlay/on-overlay":"#ffffff"},"tokenDimensions":{"a11y.a11y.dimension.min-hit-area":24,"a11y/dimension/min-hit-area":24,"a11y.dimension.min-hit-area":24,"a11y/a11y/dimension/min-hit-area":24,"_a11y/a11y/dimension/min-hit-area":24,"primitives.dimension.a11y.min-hit-area-desktop-aa":24,"dimension/a11y/min-hit-area-desktop-aa":24,"dimension.a11y.min-hit-area-desktop-aa":24,"primitives/dimension/a11y/min-hit-area-desktop-aa":24,"_primitives/dimension/a11y/min-hit-area-desktop-aa":24,"primitives.dimension.a11y.min-hit-area-mobile-aaa":48,"dimension/a11y/min-hit-area-mobile-aaa":48,"dimension.a11y.min-hit-area-mobile-aaa":48,"primitives/dimension/a11y/min-hit-area-mobile-aaa":48,"_primitives/dimension/a11y/min-hit-area-mobile-aaa":48,"primitives.dimension.border.radius.1000":1000,"dimension/border/radius/1000":1000,"dimension.border.radius.1000":1000,"primitives/dimension/border/radius/1000":1000,"_primitives/dimension/border/radius/1000":1000,"primitives.dimension.border.radius.11":11,"dimension/border/radius/11":11,"dimension.border.radius.11":11,"primitives/dimension/border/radius/11":11,"_primitives/dimension/border/radius/11":11,"primitives.dimension.border.radius.12":12,"dimension/border/radius/12":12,"dimension.border.radius.12":12,"primitives/dimension/border/radius/12":12,"_primitives/dimension/border/radius/12":12,"primitives.dimension.border.radius.16":16,"dimension/border/radius/16":16,"dimension.border.radius.16":16,"primitives/dimension/border/radius/16":16,"_primitives/dimension/border/radius/16":16,"primitives.dimension.border.radius.4":4,"dimension/border/radius/4":4,"dimension.border.radius.4":4,"primitives/dimension/border/radius/4":4,"_primitives/dimension/border/radius/4":4,"primitives.dimension.border.radius.8":8,"dimension/border/radius/8":8,"dimension.border.radius.8":8,"primitives/dimension/border/radius/8":8,"_primitives/dimension/border/radius/8":8,"primitives.dimension.border.radius.9":9,"dimension/border/radius/9":9,"dimension.border.radius.9":9,"primitives/dimension/border/radius/9":9,"_primitives/dimension/border/radius/9":9,"primitives.dimension.border.width.1":1,"dimension/border/width/1":1,"dimension.border.width.1":1,"primitives/dimension/border/width/1":1,"_primitives/dimension/border/width/1":1,"primitives.dimension.border.width.2":2,"dimension/border/width/2":2,"dimension.border.width.2":2,"primitives/dimension/border/width/2":2,"_primitives/dimension/border/width/2":2,"primitives.dimension.shadow.blur.12":12,"dimension/shadow/blur/12":12,"dimension.shadow.blur.12":12,"primitives/dimension/shadow/blur/12":12,"_primitives/dimension/shadow/blur/12":12,"primitives.dimension.shadow.blur.16":16,"dimension/shadow/blur/16":16,"dimension.shadow.blur.16":16,"primitives/dimension/shadow/blur/16":16,"_primitives/dimension/shadow/blur/16":16,"primitives.dimension.shadow.blur.20":20,"dimension/shadow/blur/20":20,"dimension.shadow.blur.20":20,"primitives/dimension/shadow/blur/20":20,"_primitives/dimension/shadow/blur/20":20,"primitives.dimension.shadow.blur.8":8,"dimension/shadow/blur/8":8,"dimension.shadow.blur.8":8,"primitives/dimension/shadow/blur/8":8,"_primitives/dimension/shadow/blur/8":8,"primitives.dimension.shadow.spread.-12":-12,"dimension/shadow/spread/-12":-12,"dimension.shadow.spread.-12":-12,"primitives/dimension/shadow/spread/-12":-12,"_primitives/dimension/shadow/spread/-12":-12,"primitives.dimension.shadow.spread.-16":-16,"dimension/shadow/spread/-16":-16,"dimension.shadow.spread.-16":-16,"primitives/dimension/shadow/spread/-16":-16,"_primitives/dimension/shadow/spread/-16":-16,"primitives.dimension.shadow.spread.-2":-2,"dimension/shadow/spread/-2":-2,"dimension.shadow.spread.-2":-2,"primitives/dimension/shadow/spread/-2":-2,"_primitives/dimension/shadow/spread/-2":-2,"primitives.dimension.shadow.spread.-4":-4,"dimension/shadow/spread/-4":-4,"dimension.shadow.spread.-4":-4,"primitives/dimension/shadow/spread/-4":-4,"_primitives/dimension/shadow/spread/-4":-4,"primitives.dimension.shadow.spread.-6":-6,"dimension/shadow/spread/-6":-6,"dimension.shadow.spread.-6":-6,"primitives/dimension/shadow/spread/-6":-6,"_primitives/dimension/shadow/spread/-6":-6,"primitives.dimension.shadow.spread.-8":-8,"dimension/shadow/spread/-8":-8,"dimension.shadow.spread.-8":-8,"primitives/dimension/shadow/spread/-8":-8,"_primitives/dimension/shadow/spread/-8":-8,"primitives.dimension.shadow.spread.0":0,"dimension/shadow/spread/0":0,"dimension.shadow.spread.0":0,"primitives/dimension/shadow/spread/0":0,"_primitives/dimension/shadow/spread/0":0,"primitives.dimension.shadow.x.-10":-10,"dimension/shadow/x/-10":-10,"dimension.shadow.x.-10":-10,"primitives/dimension/shadow/x/-10":-10,"_primitives/dimension/shadow/x/-10":-10,"primitives.dimension.shadow.x.-12":-12,"dimension/shadow/x/-12":-12,"dimension.shadow.x.-12":-12,"primitives/dimension/shadow/x/-12":-12,"_primitives/dimension/shadow/x/-12":-12,"primitives.dimension.shadow.x.-16":-16,"dimension/shadow/x/-16":-16,"dimension.shadow.x.-16":-16,"primitives/dimension/shadow/x/-16":-16,"_primitives/dimension/shadow/x/-16":-16,"primitives.dimension.shadow.x.-18":-18,"dimension/shadow/x/-18":-18,"dimension.shadow.x.-18":-18,"primitives/dimension/shadow/x/-18":-18,"_primitives/dimension/shadow/x/-18":-18,"primitives.dimension.shadow.x.-2":-2,"dimension/shadow/x/-2":-2,"dimension.shadow.x.-2":-2,"primitives/dimension/shadow/x/-2":-2,"_primitives/dimension/shadow/x/-2":-2,"primitives.dimension.shadow.x.-4":-4,"dimension/shadow/x/-4":-4,"dimension.shadow.x.-4":-4,"primitives/dimension/shadow/x/-4":-4,"_primitives/dimension/shadow/x/-4":-4,"primitives.dimension.shadow.x.-8":-8,"dimension/shadow/x/-8":-8,"dimension.shadow.x.-8":-8,"primitives/dimension/shadow/x/-8":-8,"_primitives/dimension/shadow/x/-8":-8,"primitives.dimension.shadow.x.0":0,"dimension/shadow/x/0":0,"dimension.shadow.x.0":0,"primitives/dimension/shadow/x/0":0,"_primitives/dimension/shadow/x/0":0,"primitives.dimension.shadow.x.10":10,"dimension/shadow/x/10":10,"dimension.shadow.x.10":10,"primitives/dimension/shadow/x/10":10,"_primitives/dimension/shadow/x/10":10,"primitives.dimension.shadow.x.12":12,"dimension/shadow/x/12":12,"dimension.shadow.x.12":12,"primitives/dimension/shadow/x/12":12,"_primitives/dimension/shadow/x/12":12,"primitives.dimension.shadow.x.16":16,"dimension/shadow/x/16":16,"dimension.shadow.x.16":16,"primitives/dimension/shadow/x/16":16,"_primitives/dimension/shadow/x/16":16,"primitives.dimension.shadow.x.18":18,"dimension/shadow/x/18":18,"dimension.shadow.x.18":18,"primitives/dimension/shadow/x/18":18,"_primitives/dimension/shadow/x/18":18,"primitives.dimension.shadow.x.2":2,"dimension/shadow/x/2":2,"dimension.shadow.x.2":2,"primitives/dimension/shadow/x/2":2,"_primitives/dimension/shadow/x/2":2,"primitives.dimension.shadow.x.4":4,"dimension/shadow/x/4":4,"dimension.shadow.x.4":4,"primitives/dimension/shadow/x/4":4,"_primitives/dimension/shadow/x/4":4,"primitives.dimension.shadow.x.8":8,"dimension/shadow/x/8":8,"dimension.shadow.x.8":8,"primitives/dimension/shadow/x/8":8,"_primitives/dimension/shadow/x/8":8,"primitives.dimension.shadow.y.-10":-10,"dimension/shadow/y/-10":-10,"dimension.shadow.y.-10":-10,"primitives/dimension/shadow/y/-10":-10,"_primitives/dimension/shadow/y/-10":-10,"primitives.dimension.shadow.y.-12":-12,"dimension/shadow/y/-12":-12,"dimension.shadow.y.-12":-12,"primitives/dimension/shadow/y/-12":-12,"_primitives/dimension/shadow/y/-12":-12,"primitives.dimension.shadow.y.-16":-16,"dimension/shadow/y/-16":-16,"dimension.shadow.y.-16":-16,"primitives/dimension/shadow/y/-16":-16,"_primitives/dimension/shadow/y/-16":-16,"primitives.dimension.shadow.y.-18":-18,"dimension/shadow/y/-18":-18,"dimension.shadow.y.-18":-18,"primitives/dimension/shadow/y/-18":-18,"_primitives/dimension/shadow/y/-18":-18,"primitives.dimension.shadow.y.-2":-2,"dimension/shadow/y/-2":-2,"dimension.shadow.y.-2":-2,"primitives/dimension/shadow/y/-2":-2,"_primitives/dimension/shadow/y/-2":-2,"primitives.dimension.shadow.y.-4":-4,"dimension/shadow/y/-4":-4,"dimension.shadow.y.-4":-4,"primitives/dimension/shadow/y/-4":-4,"_primitives/dimension/shadow/y/-4":-4,"primitives.dimension.shadow.y.-6":-6,"dimension/shadow/y/-6":-6,"dimension.shadow.y.-6":-6,"primitives/dimension/shadow/y/-6":-6,"_primitives/dimension/shadow/y/-6":-6,"primitives.dimension.shadow.y.-8":-8,"dimension/shadow/y/-8":-8,"dimension.shadow.y.-8":-8,"primitives/dimension/shadow/y/-8":-8,"_primitives/dimension/shadow/y/-8":-8,"primitives.dimension.shadow.y.0":0,"dimension/shadow/y/0":0,"dimension.shadow.y.0":0,"primitives/dimension/shadow/y/0":0,"_primitives/dimension/shadow/y/0":0,"primitives.dimension.shadow.y.10":10,"dimension/shadow/y/10":10,"dimension.shadow.y.10":10,"primitives/dimension/shadow/y/10":10,"_primitives/dimension/shadow/y/10":10,"primitives.dimension.shadow.y.12":12,"dimension/shadow/y/12":12,"dimension.shadow.y.12":12,"primitives/dimension/shadow/y/12":12,"_primitives/dimension/shadow/y/12":12,"primitives.dimension.shadow.y.16":16,"dimension/shadow/y/16":16,"dimension.shadow.y.16":16,"primitives/dimension/shadow/y/16":16,"_primitives/dimension/shadow/y/16":16,"primitives.dimension.shadow.y.18":18,"dimension/shadow/y/18":18,"dimension.shadow.y.18":18,"primitives/dimension/shadow/y/18":18,"_primitives/dimension/shadow/y/18":18,"primitives.dimension.shadow.y.2":2,"dimension/shadow/y/2":2,"dimension.shadow.y.2":2,"primitives/dimension/shadow/y/2":2,"_primitives/dimension/shadow/y/2":2,"primitives.dimension.shadow.y.4":4,"dimension/shadow/y/4":4,"dimension.shadow.y.4":4,"primitives/dimension/shadow/y/4":4,"_primitives/dimension/shadow/y/4":4,"primitives.dimension.shadow.y.6":6,"dimension/shadow/y/6":6,"dimension.shadow.y.6":6,"primitives/dimension/shadow/y/6":6,"_primitives/dimension/shadow/y/6":6,"primitives.dimension.shadow.y.8":8,"dimension/shadow/y/8":8,"dimension.shadow.y.8":8,"primitives/dimension/shadow/y/8":8,"_primitives/dimension/shadow/y/8":8,"primitives.dimension.spacing.10":10,"dimension/spacing/10":10,"dimension.spacing.10":10,"primitives/dimension/spacing/10":10,"_primitives/dimension/spacing/10":10,"primitives.dimension.spacing.12":12,"dimension/spacing/12":12,"dimension.spacing.12":12,"primitives/dimension/spacing/12":12,"_primitives/dimension/spacing/12":12,"primitives.dimension.spacing.14":14,"dimension/spacing/14":14,"dimension.spacing.14":14,"primitives/dimension/spacing/14":14,"_primitives/dimension/spacing/14":14,"primitives.dimension.spacing.16":16,"dimension/spacing/16":16,"dimension.spacing.16":16,"primitives/dimension/spacing/16":16,"_primitives/dimension/spacing/16":16,"primitives.dimension.spacing.2":2,"dimension/spacing/2":2,"dimension.spacing.2":2,"primitives/dimension/spacing/2":2,"_primitives/dimension/spacing/2":2,"primitives.dimension.spacing.24":24,"dimension/spacing/24":24,"dimension.spacing.24":24,"primitives/dimension/spacing/24":24,"_primitives/dimension/spacing/24":24,"primitives.dimension.spacing.32":32,"dimension/spacing/32":32,"dimension.spacing.32":32,"primitives/dimension/spacing/32":32,"_primitives/dimension/spacing/32":32,"primitives.dimension.spacing.4":4,"dimension/spacing/4":4,"dimension.spacing.4":4,"primitives/dimension/spacing/4":4,"_primitives/dimension/spacing/4":4,"primitives.dimension.spacing.40":40,"dimension/spacing/40":40,"dimension.spacing.40":40,"primitives/dimension/spacing/40":40,"_primitives/dimension/spacing/40":40,"primitives.dimension.spacing.48":48,"dimension/spacing/48":48,"dimension.spacing.48":48,"primitives/dimension/spacing/48":48,"_primitives/dimension/spacing/48":48,"primitives.dimension.spacing.6":6,"dimension/spacing/6":6,"dimension.spacing.6":6,"primitives/dimension/spacing/6":6,"_primitives/dimension/spacing/6":6,"primitives.dimension.spacing.8":8,"dimension/spacing/8":8,"dimension.spacing.8":8,"primitives/dimension/spacing/8":8,"_primitives/dimension/spacing/8":8,"semantic.dimension.border.radius.100":4,"dimension/border/radius/100":4,"dimension.border.radius.100":4,"semantic/dimension/border/radius/100":4,"_semantic/dimension/border/radius/100":4,"semantic.dimension.border.radius.200":8,"dimension/border/radius/200":8,"dimension.border.radius.200":8,"semantic/dimension/border/radius/200":8,"_semantic/dimension/border/radius/200":8,"semantic.dimension.border.radius.300":12,"dimension/border/radius/300":12,"dimension.border.radius.300":12,"semantic/dimension/border/radius/300":12,"_semantic/dimension/border/radius/300":12,"semantic.dimension.border.radius.400":16,"dimension/border/radius/400":16,"dimension.border.radius.400":16,"semantic/dimension/border/radius/400":16,"_semantic/dimension/border/radius/400":16,"semantic.dimension.border.radius.full":1000,"dimension/border/radius/full":1000,"dimension.border.radius.full":1000,"semantic/dimension/border/radius/full":1000,"_semantic/dimension/border/radius/full":1000,"semantic.dimension.border.width.100":1,"dimension/border/width/100":1,"dimension.border.width.100":1,"semantic/dimension/border/width/100":1,"_semantic/dimension/border/width/100":1,"semantic.dimension.border.width.200":2,"dimension/border/width/200":2,"dimension.border.width.200":2,"semantic/dimension/border/width/200":2,"_semantic/dimension/border/width/200":2,"semantic.dimension.focus-outline.radius.inner":9,"dimension/focus-outline/radius/inner":9,"dimension.focus-outline.radius.inner":9,"semantic/dimension/focus-outline/radius/inner":9,"_semantic/dimension/focus-outline/radius/inner":9,"semantic.dimension.focus-outline.radius.outer":11,"dimension/focus-outline/radius/outer":11,"dimension.focus-outline.radius.outer":11,"semantic/dimension/focus-outline/radius/outer":11,"_semantic/dimension/focus-outline/radius/outer":11,"semantic.dimension.focus-outline.width.inner":2,"dimension/focus-outline/width/inner":2,"dimension.focus-outline.width.inner":2,"semantic/dimension/focus-outline/width/inner":2,"_semantic/dimension/focus-outline/width/inner":2,"semantic.dimension.focus-outline.width.outer":2,"dimension/focus-outline/width/outer":2,"dimension.focus-outline.width.outer":2,"semantic/dimension/focus-outline/width/outer":2,"_semantic/dimension/focus-outline/width/outer":2,"semantic.dimension.shadow.blur.bottom.100":12,"dimension/shadow/blur/bottom/100":12,"dimension.shadow.blur.bottom.100":12,"semantic/dimension/shadow/blur/bottom/100":12,"_semantic/dimension/shadow/blur/bottom/100":12,"semantic.dimension.shadow.blur.bottom.200":16,"dimension/shadow/blur/bottom/200":16,"dimension.shadow.blur.bottom.200":16,"semantic/dimension/shadow/blur/bottom/200":16,"_semantic/dimension/shadow/blur/bottom/200":16,"semantic.dimension.shadow.blur.bottom.300":20,"dimension/shadow/blur/bottom/300":20,"dimension.shadow.blur.bottom.300":20,"semantic/dimension/shadow/blur/bottom/300":20,"_semantic/dimension/shadow/blur/bottom/300":20,"semantic.dimension.shadow.blur.default.100":12,"dimension/shadow/blur/default/100":12,"dimension.shadow.blur.default.100":12,"semantic/dimension/shadow/blur/default/100":12,"_semantic/dimension/shadow/blur/default/100":12,"semantic.dimension.shadow.blur.default.200":16,"dimension/shadow/blur/default/200":16,"dimension.shadow.blur.default.200":16,"semantic/dimension/shadow/blur/default/200":16,"_semantic/dimension/shadow/blur/default/200":16,"semantic.dimension.shadow.blur.default.300":20,"dimension/shadow/blur/default/300":20,"dimension.shadow.blur.default.300":20,"semantic/dimension/shadow/blur/default/300":20,"_semantic/dimension/shadow/blur/default/300":20,"semantic.dimension.shadow.blur.left.100":12,"dimension/shadow/blur/left/100":12,"dimension.shadow.blur.left.100":12,"semantic/dimension/shadow/blur/left/100":12,"_semantic/dimension/shadow/blur/left/100":12,"semantic.dimension.shadow.blur.left.200":16,"dimension/shadow/blur/left/200":16,"dimension.shadow.blur.left.200":16,"semantic/dimension/shadow/blur/left/200":16,"_semantic/dimension/shadow/blur/left/200":16,"semantic.dimension.shadow.blur.left.300":20,"dimension/shadow/blur/left/300":20,"dimension.shadow.blur.left.300":20,"semantic/dimension/shadow/blur/left/300":20,"_semantic/dimension/shadow/blur/left/300":20,"semantic.dimension.shadow.blur.right.100":12,"dimension/shadow/blur/right/100":12,"dimension.shadow.blur.right.100":12,"semantic/dimension/shadow/blur/right/100":12,"_semantic/dimension/shadow/blur/right/100":12,"semantic.dimension.shadow.blur.right.200":16,"dimension/shadow/blur/right/200":16,"dimension.shadow.blur.right.200":16,"semantic/dimension/shadow/blur/right/200":16,"_semantic/dimension/shadow/blur/right/200":16,"semantic.dimension.shadow.blur.right.300":20,"dimension/shadow/blur/right/300":20,"dimension.shadow.blur.right.300":20,"semantic/dimension/shadow/blur/right/300":20,"_semantic/dimension/shadow/blur/right/300":20,"semantic.dimension.shadow.blur.top.100":12,"dimension/shadow/blur/top/100":12,"dimension.shadow.blur.top.100":12,"semantic/dimension/shadow/blur/top/100":12,"_semantic/dimension/shadow/blur/top/100":12,"semantic.dimension.shadow.blur.top.200":16,"dimension/shadow/blur/top/200":16,"dimension.shadow.blur.top.200":16,"semantic/dimension/shadow/blur/top/200":16,"_semantic/dimension/shadow/blur/top/200":16,"semantic.dimension.shadow.blur.top.300":20,"dimension/shadow/blur/top/300":20,"dimension.shadow.blur.top.300":20,"semantic/dimension/shadow/blur/top/300":20,"_semantic/dimension/shadow/blur/top/300":20,"semantic.dimension.shadow.spread.bottom.100":-6,"dimension/shadow/spread/bottom/100":-6,"dimension.shadow.spread.bottom.100":-6,"semantic/dimension/shadow/spread/bottom/100":-6,"_semantic/dimension/shadow/spread/bottom/100":-6,"semantic.dimension.shadow.spread.bottom.200":-8,"dimension/shadow/spread/bottom/200":-8,"dimension.shadow.spread.bottom.200":-8,"semantic/dimension/shadow/spread/bottom/200":-8,"_semantic/dimension/shadow/spread/bottom/200":-8,"semantic.dimension.shadow.spread.bottom.300":-8,"dimension/shadow/spread/bottom/300":-8,"dimension.shadow.spread.bottom.300":-8,"semantic/dimension/shadow/spread/bottom/300":-8,"_semantic/dimension/shadow/spread/bottom/300":-8,"semantic.dimension.shadow.spread.default.100":0,"dimension/shadow/spread/default/100":0,"dimension.shadow.spread.default.100":0,"semantic/dimension/shadow/spread/default/100":0,"_semantic/dimension/shadow/spread/default/100":0,"semantic.dimension.shadow.spread.default.200":0,"dimension/shadow/spread/default/200":0,"dimension.shadow.spread.default.200":0,"semantic/dimension/shadow/spread/default/200":0,"_semantic/dimension/shadow/spread/default/200":0,"semantic.dimension.shadow.spread.default.300":0,"dimension/shadow/spread/default/300":0,"dimension.shadow.spread.default.300":0,"semantic/dimension/shadow/spread/default/300":0,"_semantic/dimension/shadow/spread/default/300":0,"semantic.dimension.shadow.spread.left.100":-6,"dimension/shadow/spread/left/100":-6,"dimension.shadow.spread.left.100":-6,"semantic/dimension/shadow/spread/left/100":-6,"_semantic/dimension/shadow/spread/left/100":-6,"semantic.dimension.shadow.spread.left.200":-8,"dimension/shadow/spread/left/200":-8,"dimension.shadow.spread.left.200":-8,"semantic/dimension/shadow/spread/left/200":-8,"_semantic/dimension/shadow/spread/left/200":-8,"semantic.dimension.shadow.spread.left.300":-8,"dimension/shadow/spread/left/300":-8,"dimension.shadow.spread.left.300":-8,"semantic/dimension/shadow/spread/left/300":-8,"_semantic/dimension/shadow/spread/left/300":-8,"semantic.dimension.shadow.spread.right.100":-6,"dimension/shadow/spread/right/100":-6,"dimension.shadow.spread.right.100":-6,"semantic/dimension/shadow/spread/right/100":-6,"_semantic/dimension/shadow/spread/right/100":-6,"semantic.dimension.shadow.spread.right.200":-8,"dimension/shadow/spread/right/200":-8,"dimension.shadow.spread.right.200":-8,"semantic/dimension/shadow/spread/right/200":-8,"_semantic/dimension/shadow/spread/right/200":-8,"semantic.dimension.shadow.spread.right.300":-8,"dimension/shadow/spread/right/300":-8,"dimension.shadow.spread.right.300":-8,"semantic/dimension/shadow/spread/right/300":-8,"_semantic/dimension/shadow/spread/right/300":-8,"semantic.dimension.shadow.spread.top.100":-6,"dimension/shadow/spread/top/100":-6,"dimension.shadow.spread.top.100":-6,"semantic/dimension/shadow/spread/top/100":-6,"_semantic/dimension/shadow/spread/top/100":-6,"semantic.dimension.shadow.spread.top.200":-8,"dimension/shadow/spread/top/200":-8,"dimension.shadow.spread.top.200":-8,"semantic/dimension/shadow/spread/top/200":-8,"_semantic/dimension/shadow/spread/top/200":-8,"semantic.dimension.shadow.spread.top.300":-8,"dimension/shadow/spread/top/300":-8,"dimension.shadow.spread.top.300":-8,"semantic/dimension/shadow/spread/top/300":-8,"_semantic/dimension/shadow/spread/top/300":-8,"semantic.dimension.shadow.x.bottom.100":0,"dimension/shadow/x/bottom/100":0,"dimension.shadow.x.bottom.100":0,"semantic/dimension/shadow/x/bottom/100":0,"_semantic/dimension/shadow/x/bottom/100":0,"semantic.dimension.shadow.x.bottom.200":0,"dimension/shadow/x/bottom/200":0,"dimension.shadow.x.bottom.200":0,"semantic/dimension/shadow/x/bottom/200":0,"_semantic/dimension/shadow/x/bottom/200":0,"semantic.dimension.shadow.x.bottom.300":0,"dimension/shadow/x/bottom/300":0,"dimension.shadow.x.bottom.300":0,"semantic/dimension/shadow/x/bottom/300":0,"_semantic/dimension/shadow/x/bottom/300":0,"semantic.dimension.shadow.x.default.100":0,"dimension/shadow/x/default/100":0,"dimension.shadow.x.default.100":0,"semantic/dimension/shadow/x/default/100":0,"_semantic/dimension/shadow/x/default/100":0,"semantic.dimension.shadow.x.default.200":0,"dimension/shadow/x/default/200":0,"dimension.shadow.x.default.200":0,"semantic/dimension/shadow/x/default/200":0,"_semantic/dimension/shadow/x/default/200":0,"semantic.dimension.shadow.x.default.300":0,"dimension/shadow/x/default/300":0,"dimension.shadow.x.default.300":0,"semantic/dimension/shadow/x/default/300":0,"_semantic/dimension/shadow/x/default/300":0,"semantic.dimension.shadow.x.left.100":-8,"dimension/shadow/x/left/100":-8,"dimension.shadow.x.left.100":-8,"semantic/dimension/shadow/x/left/100":-8,"_semantic/dimension/shadow/x/left/100":-8,"semantic.dimension.shadow.x.left.200":-10,"dimension/shadow/x/left/200":-10,"dimension.shadow.x.left.200":-10,"semantic/dimension/shadow/x/left/200":-10,"_semantic/dimension/shadow/x/left/200":-10,"semantic.dimension.shadow.x.left.300":-18,"dimension/shadow/x/left/300":-18,"dimension.shadow.x.left.300":-18,"semantic/dimension/shadow/x/left/300":-18,"_semantic/dimension/shadow/x/left/300":-18,"semantic.dimension.shadow.x.right.100":8,"dimension/shadow/x/right/100":8,"dimension.shadow.x.right.100":8,"semantic/dimension/shadow/x/right/100":8,"_semantic/dimension/shadow/x/right/100":8,"semantic.dimension.shadow.x.right.200":10,"dimension/shadow/x/right/200":10,"dimension.shadow.x.right.200":10,"semantic/dimension/shadow/x/right/200":10,"_semantic/dimension/shadow/x/right/200":10,"semantic.dimension.shadow.x.right.300":18,"dimension/shadow/x/right/300":18,"dimension.shadow.x.right.300":18,"semantic/dimension/shadow/x/right/300":18,"_semantic/dimension/shadow/x/right/300":18,"semantic.dimension.shadow.x.top.100":0,"dimension/shadow/x/top/100":0,"dimension.shadow.x.top.100":0,"semantic/dimension/shadow/x/top/100":0,"_semantic/dimension/shadow/x/top/100":0,"semantic.dimension.shadow.x.top.200":0,"dimension/shadow/x/top/200":0,"dimension.shadow.x.top.200":0,"semantic/dimension/shadow/x/top/200":0,"_semantic/dimension/shadow/x/top/200":0,"semantic.dimension.shadow.x.top.300":0,"dimension/shadow/x/top/300":0,"dimension.shadow.x.top.300":0,"semantic/dimension/shadow/x/top/300":0,"_semantic/dimension/shadow/x/top/300":0,"semantic.dimension.shadow.y.bottom.100":8,"dimension/shadow/y/bottom/100":8,"dimension.shadow.y.bottom.100":8,"semantic/dimension/shadow/y/bottom/100":8,"_semantic/dimension/shadow/y/bottom/100":8,"semantic.dimension.shadow.y.bottom.200":10,"dimension/shadow/y/bottom/200":10,"dimension.shadow.y.bottom.200":10,"semantic/dimension/shadow/y/bottom/200":10,"_semantic/dimension/shadow/y/bottom/200":10,"semantic.dimension.shadow.y.bottom.300":18,"dimension/shadow/y/bottom/300":18,"dimension.shadow.y.bottom.300":18,"semantic/dimension/shadow/y/bottom/300":18,"_semantic/dimension/shadow/y/bottom/300":18,"semantic.dimension.shadow.y.default.100":4,"dimension/shadow/y/default/100":4,"dimension.shadow.y.default.100":4,"semantic/dimension/shadow/y/default/100":4,"_semantic/dimension/shadow/y/default/100":4,"semantic.dimension.shadow.y.default.200":4,"dimension/shadow/y/default/200":4,"dimension.shadow.y.default.200":4,"semantic/dimension/shadow/y/default/200":4,"_semantic/dimension/shadow/y/default/200":4,"semantic.dimension.shadow.y.default.300":8,"dimension/shadow/y/default/300":8,"dimension.shadow.y.default.300":8,"semantic/dimension/shadow/y/default/300":8,"_semantic/dimension/shadow/y/default/300":8,"semantic.dimension.shadow.y.left.100":0,"dimension/shadow/y/left/100":0,"dimension.shadow.y.left.100":0,"semantic/dimension/shadow/y/left/100":0,"_semantic/dimension/shadow/y/left/100":0,"semantic.dimension.shadow.y.left.200":0,"dimension/shadow/y/left/200":0,"dimension.shadow.y.left.200":0,"semantic/dimension/shadow/y/left/200":0,"_semantic/dimension/shadow/y/left/200":0,"semantic.dimension.shadow.y.left.300":0,"dimension/shadow/y/left/300":0,"dimension.shadow.y.left.300":0,"semantic/dimension/shadow/y/left/300":0,"_semantic/dimension/shadow/y/left/300":0,"semantic.dimension.shadow.y.right.100":0,"dimension/shadow/y/right/100":0,"dimension.shadow.y.right.100":0,"semantic/dimension/shadow/y/right/100":0,"_semantic/dimension/shadow/y/right/100":0,"semantic.dimension.shadow.y.right.200":0,"dimension/shadow/y/right/200":0,"dimension.shadow.y.right.200":0,"semantic/dimension/shadow/y/right/200":0,"_semantic/dimension/shadow/y/right/200":0,"semantic.dimension.shadow.y.right.300":0,"dimension/shadow/y/right/300":0,"dimension.shadow.y.right.300":0,"semantic/dimension/shadow/y/right/300":0,"_semantic/dimension/shadow/y/right/300":0,"semantic.dimension.shadow.y.top.100":-8,"dimension/shadow/y/top/100":-8,"dimension.shadow.y.top.100":-8,"semantic/dimension/shadow/y/top/100":-8,"_semantic/dimension/shadow/y/top/100":-8,"semantic.dimension.shadow.y.top.200":-10,"dimension/shadow/y/top/200":-10,"dimension.shadow.y.top.200":-10,"semantic/dimension/shadow/y/top/200":-10,"_semantic/dimension/shadow/y/top/200":-10,"semantic.dimension.shadow.y.top.300":-18,"dimension/shadow/y/top/300":-18,"dimension.shadow.y.top.300":-18,"semantic/dimension/shadow/y/top/300":-18,"_semantic/dimension/shadow/y/top/300":-18,"semantic.dimension.spacing.100":2,"dimension/spacing/100":2,"dimension.spacing.100":2,"semantic/dimension/spacing/100":2,"_semantic/dimension/spacing/100":2,"semantic.dimension.spacing.200":4,"dimension/spacing/200":4,"dimension.spacing.200":4,"semantic/dimension/spacing/200":4,"_semantic/dimension/spacing/200":4,"semantic.dimension.spacing.300":6,"dimension/spacing/300":6,"dimension.spacing.300":6,"semantic/dimension/spacing/300":6,"_semantic/dimension/spacing/300":6,"semantic.dimension.spacing.400":8,"dimension/spacing/400":8,"dimension.spacing.400":8,"semantic/dimension/spacing/400":8,"_semantic/dimension/spacing/400":8,"semantic.dimension.spacing.500":10,"dimension/spacing/500":10,"dimension.spacing.500":10,"semantic/dimension/spacing/500":10,"_semantic/dimension/spacing/500":10,"semantic.dimension.spacing.600":12,"dimension/spacing/600":12,"dimension.spacing.600":12,"semantic/dimension/spacing/600":12,"_semantic/dimension/spacing/600":12,"semantic.dimension.spacing.700":14,"dimension/spacing/700":14,"dimension.spacing.700":14,"semantic/dimension/spacing/700":14,"_semantic/dimension/spacing/700":14,"semantic.dimension.spacing.800":16,"dimension/spacing/800":16,"dimension.spacing.800":16,"semantic/dimension/spacing/800":16,"_semantic/dimension/spacing/800":16,"semantic.dimension.spacing.900":24,"dimension/spacing/900":24,"dimension.spacing.900":24,"semantic/dimension/spacing/900":24,"_semantic/dimension/spacing/900":24,"semantic.font.line-height.100":1,"font/line-height/100":1,"font.line-height.100":1,"semantic/font/line-height/100":1,"_semantic/font/line-height/100":1,"semantic.font.line-height.200":1.25,"font/line-height/200":1.25,"font.line-height.200":1.25,"semantic/font/line-height/200":1.25,"_semantic/font/line-height/200":1.25,"semantic.font.line-height.300":1.5,"font/line-height/300":1.5,"font.line-height.300":1.5,"semantic/font/line-height/300":1.5,"_semantic/font/line-height/300":1.5,"semantic.font.line-height.400":1.5,"font/line-height/400":1.5,"font.line-height.400":1.5,"semantic/font/line-height/400":1.5,"_semantic/font/line-height/400":1.5,"semantic.font.line-height.500":1.625,"font/line-height/500":1.625,"font.line-height.500":1.625,"semantic/font/line-height/500":1.625,"_semantic/font/line-height/500":1.625,"semantic.font.line-height.600":1.875,"font/line-height/600":1.875,"font.line-height.600":1.875,"semantic/font/line-height/600":1.875,"_semantic/font/line-height/600":1.875,"semantic.font.line-height.700":2.125,"font/line-height/700":2.125,"font.line-height.700":2.125,"semantic/font/line-height/700":2.125,"_semantic/font/line-height/700":2.125,"semantic.font.line-height.800":2.375,"font/line-height/800":2.375,"font.line-height.800":2.375,"semantic/font/line-height/800":2.375,"_semantic/font/line-height/800":2.375,"semantic.font.line-height.900":2.625,"font/line-height/900":2.625,"font.line-height.900":2.625,"semantic/font/line-height/900":2.625,"_semantic/font/line-height/900":2.625,"typography.font.line-height.12":1,"font/line-height/12":1,"font.line-height.12":1,"typography/font/line-height/12":1,"_typography/font/line-height/12":1,"typography.font.line-height.14":1.25,"font/line-height/14":1.25,"font.line-height.14":1.25,"typography/font/line-height/14":1.25,"_typography/font/line-height/14":1.25,"typography.font.line-height.16":1.5,"font/line-height/16":1.5,"font.line-height.16":1.5,"typography/font/line-height/16":1.5,"_typography/font/line-height/16":1.5,"typography.font.line-height.18":1.5,"font/line-height/18":1.5,"font.line-height.18":1.5,"typography/font/line-height/18":1.5,"_typography/font/line-height/18":1.5,"typography.font.line-height.20":1.625,"font/line-height/20":1.625,"font.line-height.20":1.625,"typography/font/line-height/20":1.625,"_typography/font/line-height/20":1.625,"typography.font.line-height.24":1.875,"font/line-height/24":1.875,"font.line-height.24":1.875,"typography/font/line-height/24":1.875,"_typography/font/line-height/24":1.875,"typography.font.line-height.28":2.125,"font/line-height/28":2.125,"font.line-height.28":2.125,"typography/font/line-height/28":2.125,"_typography/font/line-height/28":2.125,"typography.font.line-height.32":2.375,"font/line-height/32":2.375,"font.line-height.32":2.375,"typography/font/line-height/32":2.375,"_typography/font/line-height/32":2.375,"typography.font.line-height.36":2.625,"font/line-height/36":2.625,"font.line-height.36":2.625,"typography/font/line-height/36":2.625,"_typography/font/line-height/36":2.625},"options":{"componentName":"Alert","componentSetNodeId":"2304:1892","offsetX":200}};

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
  if (typeof hex !== "string") return { r: 0, g: 0, b: 0, a: 1 };
  const cleaned = hex.trim().replace("#", "");
  if (!cleaned) return { r: 0, g: 0, b: 0, a: 1 };
  const expanded = (() => {
    if (cleaned.length === 3 || cleaned.length === 4) {
      return cleaned
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (cleaned.length === 6 || cleaned.length === 8) {
      return cleaned;
    }
    if (cleaned.length > 8) return cleaned.slice(0, 8);
    return cleaned.padEnd(6, "0");
  })();

  const colorHex = expanded.slice(0, 6).padEnd(6, "0");
  const alphaHex =
    expanded.length >= 8 ? expanded.slice(6, 8) : null;
  const alphaRaw = alphaHex ? Number.parseInt(alphaHex, 16) : 255;
  const alpha =
    Number.isFinite(alphaRaw) && alphaRaw >= 0 ? Math.max(0, Math.min(255, alphaRaw)) / 255 : 1;
  const value = Number.parseInt(colorHex, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
    a: alpha,
  };
}

function solid(hex, opacity) {
  const rgb = hexToRgb(hex);
  const baseOpacity = Number.isFinite(rgb.a) ? rgb.a : 1;
  const requestedOpacity = Number.isFinite(opacity) ? opacity : null;
  const finalOpacity = requestedOpacity == null ? baseOpacity : requestedOpacity * baseOpacity;
  return {
    type: "SOLID",
    color: {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
    },
    opacity: Math.max(0, Math.min(1, finalOpacity)),
  };
}

function normalizeTokenKey(rawValue) {
  if (typeof rawValue !== "string") return "";
  return rawValue.trim().replace(/^["'`]+|["'`]+$/g, "");
}

function resolveColorFromRegistry(tokenColors, rawToken) {
  if (!tokenColors || typeof tokenColors !== "object") return null;
  const tokenKey = normalizeTokenKey(rawToken);
  if (!tokenKey) return null;
  return tokenColors[tokenKey] || tokenColors[tokenKey.toLowerCase()] || null;
}

function resolveColor(theme, tokenColors, colorOrToken, fallbackHex) {
  if (typeof colorOrToken === "string" && colorOrToken.startsWith("#")) {
    return colorOrToken;
  }
  if (typeof colorOrToken === "string") {
    const tokenValue = getPath(theme, "theme.colors." + colorOrToken, null);
    if (typeof tokenValue === "string" && tokenValue.startsWith("#")) return tokenValue;
    const themeRegistryValue = resolveColorFromRegistry(tokenColors, tokenValue);
    if (typeof themeRegistryValue === "string" && themeRegistryValue.startsWith("#")) {
      return themeRegistryValue;
    }
    const directRegistryValue = resolveColorFromRegistry(tokenColors, colorOrToken);
    if (typeof directRegistryValue === "string" && directRegistryValue.startsWith("#")) {
      return directRegistryValue;
    }
  }
  return fallbackHex;
}

function parseNumericDimension(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pxMatch) {
    const parsedPx = Number(pxMatch[1]);
    return Number.isFinite(parsedPx) ? parsedPx : null;
  }
  const numericMatch = trimmed.match(/^-?\d+(?:\.\d+)?$/);
  if (numericMatch) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveDimensionFromRegistry(tokenDimensions, rawToken) {
  if (!tokenDimensions || typeof tokenDimensions !== "object") return null;
  const tokenKey = normalizeTokenKey(rawToken);
  if (!tokenKey) return null;
  const value = tokenDimensions[tokenKey] || tokenDimensions[tokenKey.toLowerCase()] || null;
  return Number.isFinite(value) ? value : null;
}

function resolveRadiusValue(theme, tokenDimensions, valueOrToken, fallbackValue) {
  const directValue = parseNumericDimension(valueOrToken);
  if (directValue != null) return directValue;

  const aliasValue =
    typeof valueOrToken === "string"
      ? getPath(theme, "theme.radii." + valueOrToken, null)
      : null;
  const aliasNumericValue = parseNumericDimension(aliasValue);
  if (aliasNumericValue != null) return aliasNumericValue;

  const registryAliasValue = resolveDimensionFromRegistry(tokenDimensions, aliasValue);
  if (registryAliasValue != null) return registryAliasValue;

  const registryDirectValue = resolveDimensionFromRegistry(tokenDimensions, valueOrToken);
  if (registryDirectValue != null) return registryDirectValue;

  const fallbackNumericValue = parseNumericDimension(fallbackValue);
  if (fallbackNumericValue != null) return fallbackNumericValue;
  const numericFallback = Number(fallbackValue);
  return Number.isFinite(numericFallback) ? numericFallback : 0;
}

function fontStyleFromWeight(weight) {
  if (!weight) return "Regular";
  const normalized = String(weight).toLowerCase();
  if (normalized === "bold") return "Bold";
  if (normalized === "semibold" || normalized === "semi-bold") return "SemiBold";
  if (normalized === "medium") return "Medium";
  return "Regular";
}

function addFontFamilyVariants(fontPairs, family, variants) {
  const safeFamily = String(family || "").trim();
  if (!safeFamily) return;
  for (const variant of variants) {
    fontPairs.add(safeFamily + ":" + variant);
  }
}

function setRangeFontNameSafe(node, start, end, family, styleCandidates) {
  const safeFamily = String(family || "").trim();
  if (!safeFamily || end <= start) return false;

  for (const rawStyle of styleCandidates) {
    const safeStyle = String(rawStyle || "").trim();
    if (!safeStyle) continue;
    try {
      node.setRangeFontName(start, end, { family: safeFamily, style: safeStyle });
      return true;
    } catch (_) {
      // Keep trying style fallbacks.
    }
  }
  return false;
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
      style === "bold" || style === "italic" || style === "bold_italic" || style === "code" || style === "normal"
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

    if (segment.style === "bold_italic") {
      setRangeFontNameSafe(node, offset, end, family, [
        "Bold Italic",
        "SemiBold Italic",
        "Bold",
        "Italic",
        "Regular",
      ]);
    } else if (segment.style === "bold") {
      setRangeFontNameSafe(node, offset, end, family, [
        "Bold",
        "SemiBold",
        "Medium",
        "Regular",
      ]);
    } else if (segment.style === "italic") {
      setRangeFontNameSafe(node, offset, end, family, [
        "Italic",
        "Medium Italic",
        "Regular",
      ]);
    } else if (segment.style === "code") {
      const appliedMono = setRangeFontNameSafe(node, offset, end, monoFamily, [
        "Regular",
        "Medium",
      ]);
      if (!appliedMono) {
        setRangeFontNameSafe(node, offset, end, family, [
          "Regular",
          "Medium",
        ]);
      }
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
  const richTextVariants = [
    "Regular",
    "Bold",
    "Italic",
    "Bold Italic",
    "SemiBold",
    "SemiBold Italic",
    "Medium",
    "Medium Italic",
  ];
  addFontFamilyVariants(fontPairs, bodyFamily, richTextVariants);
  addFontFamilyVariants(fontPairs, headingFamily, richTextVariants);
  addFontFamilyVariants(fontPairs, monoFamily, ["Regular", "Medium"]);
  for (const [key, value] of Object.entries(typography)) {
    if (key === "font_family" || key === "font_family_heading") continue;
    if (!value || typeof value !== "object") continue;
    const fam = value.font_family || bodyFamily;
    addFontFamilyVariants(fontPairs, fam, [fontStyleFromWeight(value.weight)]);
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
  const colorHex = resolveColor(theme, tokenColors, colorToken, "#4E4343");

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

function findRootPage(node) {
  let current = node;
  while (current) {
    if (current.type === "PAGE") return current;
    current = current.parent;
  }
  return null;
}

function resolveGlobalXY(node) {
  let x = 0;
  let y = 0;
  let current = node;
  let depth = 0;
  const MAX_DEPTH = 64;

  while (current && depth < MAX_DEPTH) {
    x += Number(current.x || 0);
    y += Number(current.y || 0);
    if (current.type === "PAGE") break;
    current = current.parent;
    depth += 1;
  }

  return { x, y };
}

function getAbsoluteBounds(node) {
  if (!node) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const width = Number(node.width || 0);
  const height = Number(node.height || 0);
  const transform = node.absoluteTransform;

  if (
    Array.isArray(transform) &&
    transform.length >= 2 &&
    Array.isArray(transform[0]) &&
    Array.isArray(transform[1])
  ) {
    const x = Number(transform[0][2] || 0);
    const y = Number(transform[1][2] || 0);
    return { x, y, width, height };
  }

  const global = resolveGlobalXY(node);
  return {
    x: global.x,
    y: global.y,
    width,
    height,
  };
}

function resolvePageForSection(componentSection, componentSet) {
  if (
    componentSection &&
    componentSection.parent &&
    componentSection.parent.type === "PAGE"
  ) {
    return componentSection.parent;
  }

  const fromSection = findRootPage(componentSection);
  if (fromSection) return fromSection;

  const fromComponent = findRootPage(componentSet);
  if (fromComponent) return fromComponent;

  return figma.currentPage || null;
}

function findSectionByName(rootNode, sectionName) {
  if (!rootNode || !sectionName) return null;
  const queue = [rootNode];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.type === "SECTION" && node.name === sectionName) {
      return node;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) queue.push(child);
    }
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
  card.cornerRadius = resolveRadiusValue(
    theme,
    tokenDimensions,
    getPath(theme, "components.card.radius", getPath(theme, "theme.radii.card", 16)),
    16
  );
  card.fills = [solid(resolveColor(theme, tokenColors, getPath(theme, "components.card.fills.color", "card_bg"), "#FFFFFF"), 1)];
  card.strokes = [solid(resolveColor(theme, tokenColors, getPath(theme, "components.card.strokes.color", "card_border"), "#E7DDCF"), 1)];
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
  chip.cornerRadius = resolveRadiusValue(
    theme,
    tokenDimensions,
    getPath(theme, "theme.radii.chip", 999),
    999
  );
  chip.strokes = [solid(resolveColor(theme, tokenColors, "chip_border", "#DCCBB2"), 1)];
  chip.strokeWeight = Number(getPath(theme, "theme.strokes.chip_border", 1));
  chip.fills = [solid(resolveColor(theme, tokenColors, "chip_bg", "#F6EFE4"), 1)];
  parent.appendChild(chip);
  createText(chip, label, "body_small", theme, {
    colorOverride: "chip_text",
    wrap: false,
  });
}

function resolveTableMinRowHeight(theme, cellPaddingV) {
  const configured = getPath(theme, "components.table_card.table.min_row_height", null);
  const configuredString = String(configured == null ? "" : configured).trim().toLowerCase();

  if (configuredString && configuredString !== "auto") {
    const configuredNumber = Number(configured);
    if (Number.isFinite(configuredNumber) && configuredNumber > 0) {
      return Math.ceil(configuredNumber);
    }
  }

  const bodySizeRaw = Number(getPath(theme, "theme.typography.body.size", 15));
  const bodyLineHeightRaw = Number(getPath(theme, "theme.typography.body.line_height", 24));
  const safeBodySize = Number.isFinite(bodySizeRaw) && bodySizeRaw > 0 ? bodySizeRaw : 15;
  const safeBodyLineHeight =
    Number.isFinite(bodyLineHeightRaw) && bodyLineHeightRaw > 0
      ? bodyLineHeightRaw
      : Math.ceil(safeBodySize * 1.2);
  const safePaddingV =
    Number.isFinite(cellPaddingV) && cellPaddingV >= 0 ? cellPaddingV : 8;

  const contentHeight = Math.max(safeBodyLineHeight, safeBodySize * 1.2);
  return Math.ceil(contentHeight + safePaddingV * 2);
}

function createTable(parent, title, tableBlock, theme) {
  const tableCard = createVerticalFrame("Table/" + toSafeName(title || "Table"));
  tableCard.layoutAlign = "STRETCH";
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
  const borderColor = resolveColor(theme, tokenColors, getPath(theme, "markdown_mapping.table.border_color", "card_border"), "#E7DDCF");
  const borderWeight = Number(getPath(theme, "components.table_card.table.border_weight", 1));
  const normalizedBorderWeight =
    Number.isFinite(borderWeight) && borderWeight > 0 ? borderWeight : 1;
  const minRowHeight = resolveTableMinRowHeight(theme, cellPaddingV);
  const minColumnWidth = Number(getPath(theme, "components.table_card.table.min_column_width", 120));
  const minReadableColumnWidth = Number(
    getPath(theme, "components.table_card.table.min_readable_column_width", 40)
  );
  const hardMinColumnWidth = Math.max(12, minReadableColumnWidth);
  const rowGap = Number(getPath(theme, "components.table_card.table.row_gap", 0));
  const columnGap = Number(getPath(theme, "components.table_card.table.column_gap", 0));
  const normalizedRowGap = Number.isFinite(rowGap) && rowGap >= 0 ? rowGap : 0;
  const normalizedColumnGap =
    Number.isFinite(columnGap) && columnGap >= 0 ? columnGap : 0;
  const headerBgColor = resolveColor(theme, tokenColors, getPath(theme, "components.table_card.table.header_bg", "table_header_bg"), null);
  const cardWidth = Number(getPath(theme, "components.card.width", 820));
  const cardPadLeft = Number(getPath(theme, "components.card.padding.left", 20));
  const cardPadRight = Number(getPath(theme, "components.card.padding.right", 20));
  const baseTableWidth = Math.max(240, cardWidth - cardPadLeft - cardPadRight);
  const minimumRequiredWidth =
    hardMinColumnWidth * columnCount +
    normalizedColumnGap * Math.max(0, columnCount - 1);
  const tableWidth = Math.max(baseTableWidth, minimumRequiredWidth);
  tableCard.itemSpacing = normalizedRowGap;

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

  const availableWidth = Math.max(
    1,
    tableWidth - normalizedColumnGap * Math.max(0, columnCount - 1)
  );
  const minWeight = Number(getPath(theme, "components.table_card.table.min_column_weight", 1));
  const maxWeight = Number(getPath(theme, "components.table_card.table.max_column_weight", 3.2));
  const columnWeights = contentScores.map((score) => {
    const baseWeight = Math.sqrt(Math.max(4, score)) / 2;
    return Math.min(maxWeight, Math.max(minWeight, baseWeight));
  });
  const totalWeight = Math.max(1, columnWeights.reduce((sum, value) => sum + value, 0));
  const columnWidths = columnWeights.map((weight) =>
    Math.max(hardMinColumnWidth, Math.floor((availableWidth * weight) / totalWeight))
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
  const enforcedMinColumnWidth = Math.max(hardMinColumnWidth, minColumnWidth);
  if (enforcedMinColumnWidth * columnCount <= availableWidth) {
    for (let i = 0; i < columnWidths.length; i += 1) {
      columnWidths[i] = Math.max(enforcedMinColumnWidth, columnWidths[i]);
    }
    let overflow =
      columnWidths.reduce((sum, value) => sum + value, 0) - availableWidth;
    while (overflow > 0) {
      let widestIndex = 0;
      for (let i = 1; i < columnWidths.length; i += 1) {
        if (columnWidths[i] > columnWidths[widestIndex]) widestIndex = i;
      }
      if (columnWidths[widestIndex] <= enforcedMinColumnWidth) break;
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
    rowFrame.itemSpacing = normalizedColumnGap;
    rowFrame.layoutAlign = "STRETCH";
    rowFrame.fills = [];
    tableCard.appendChild(rowFrame);
    const rowCells = [];
    let rowContentHeight = minRowHeight;

    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const value = colIndex < row.cells.length ? String(row.cells[colIndex] ?? "") : "";
      const cell = createVerticalFrame(
        (row.isHeader ? "H" : "C") + String(colIndex + 1)
      );
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "FIXED";
      const cellWidth = Math.max(hardMinColumnWidth, columnWidths[colIndex]);
      cell.resizeWithoutConstraints(cellWidth, 1);
      cell.layoutAlign = "STRETCH";
      cell.clipsContent = false;
      cell.paddingTop = cellPaddingV;
      cell.paddingBottom = cellPaddingV;
      cell.paddingLeft = cellPaddingH;
      cell.paddingRight = cellPaddingH;
      cell.strokes = [solid(borderColor, 1)];
      cell.strokeWeight = normalizedBorderWeight;
      const cellBg = row.isHeader && headerBgColor ? headerBgColor : "#FFFFFF";
      cell.fills = [solid(cellBg, 1)];
      rowFrame.appendChild(cell);
      rowCells.push(cell);
      const cellSegments =
        Array.isArray(row.segments) && Array.isArray(row.segments[colIndex])
          ? row.segments[colIndex]
          : null;
      const textNode = createText(cell, value, row.isHeader ? "h3" : "body", theme, {
        wrapWidth: Math.max(1, cellWidth - cellPaddingH * 2),
        segments: cellSegments,
      });
      const measuredCellHeight = Math.ceil(Number(textNode.height || 0) + cellPaddingV * 2);
      rowContentHeight = Math.max(rowContentHeight, measuredCellHeight);
    }

    const targetRowHeight = Math.max(
      minRowHeight,
      rowContentHeight,
      Math.ceil(Number(rowFrame.height || 0))
    );
    rowFrame.counterAxisSizingMode = "FIXED";
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
  const orderedCounters = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const text = typeof item === "string" ? item : String(item?.text ?? "");
    const depth =
      typeof item === "string" ? 0 : Math.max(0, Number(item?.depth ?? 0));
    const isOrderedItem =
      typeof item === "string" ? ordered : Boolean(item?.ordered ?? ordered);

    while (orderedCounters.length > depth + 1) orderedCounters.pop();
    while (orderedCounters.length < depth + 1) orderedCounters.push(0);

    if (isOrderedItem) {
      orderedCounters[depth] += 1;
      for (let counterIndex = depth + 1; counterIndex < orderedCounters.length; counterIndex += 1) {
        orderedCounters[counterIndex] = 0;
      }
    }

    const indentPrefix = "  ".repeat(depth);
    const prefix = isOrderedItem ? String(orderedCounters[depth]) + ". " : "\u2022 ";
    const fullPrefix = indentPrefix + prefix;
    const itemSegments =
      typeof item === "string" || !Array.isArray(item?.segments) ? null : item.segments;
    const mergedSegments = itemSegments
      ? [{ text: fullPrefix, style: "normal" }, ...itemSegments]
      : null;
    createText(parent, fullPrefix + text, "body", theme, { segments: mergedSegments });
  }
}

const model = PAYLOAD.model || {};
const theme = PAYLOAD.theme || {};
const tokenColors = PAYLOAD.tokenColors || {};
const tokenDimensions = PAYLOAD.tokenDimensions || {};
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

const page = resolvePageForSection(componentSection, componentSet);
if (!page) {
  return {
    ok: false,
    error: "Unable to resolve PAGE context for documentation section placement",
    componentSectionId: componentSection.id,
    componentSetId: componentSet.id,
  };
}

const sectionPattern = String(
  getPath(theme, "layout.target.section_name_pattern", "Doc/{component_name}")
);
const docSectionName = sectionPattern.replace("{component_name}", componentName);
const targetParent =
  componentSection && componentSection.parent
    ? componentSection.parent
    : page;
let docSection = findSectionByName(targetParent, docSectionName);
if (!docSection && targetParent !== page) {
  docSection = findSectionByName(page, docSectionName);
}
if (!docSection) {
  docSection = figma.createSection();
  docSection.name = docSectionName;
  targetParent.appendChild(docSection);
}

const offsetX = Number(
  options.offsetX != null
    ? options.offsetX
    : getPath(theme, "layout.target.position.offset_x", 200)
);
const sectionWidth = Number(getPath(theme, "layout.section.width", 940));
const minSectionHeight = Number(getPath(theme, "layout.section.min_height", 1100));

docSection.name = docSectionName;
const componentSectionBounds = getAbsoluteBounds(componentSection);
docSection.x = componentSectionBounds.x + componentSectionBounds.width + offsetX;
docSection.y = componentSectionBounds.y;
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
canvas.cornerRadius = resolveRadiusValue(
  theme,
  tokenDimensions,
  getPath(theme, "theme.radii.canvas", 24),
  24
);
canvas.fills = [solid(resolveColor(theme, tokenColors, "page_bg", "#FFF9F0"), 1)];
canvas.strokes = [solid(resolveColor(theme, tokenColors, "section_border", "#E7DDCF"), 1)];
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
  accent.cornerRadius = resolveRadiusValue(
    theme,
    tokenDimensions,
    getPath(
      theme,
      "components.header_block.accent.radius",
      getPath(theme, "theme.radii.header_accent", 12)
    ),
    12
  );
  const accentColor = resolveColor(theme, tokenColors, getPath(theme, "components.header_block.accent.fills.color", "header_accent"), "#C9E0BE");
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
  offsetXApplied: docSection.x - (componentSectionBounds.x + componentSectionBounds.width),
  renderedCount,
  unsupportedBlocks,
};

