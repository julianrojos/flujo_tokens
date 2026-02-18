const PAYLOAD = {"model":{"version":2,"componentName":"bottom_bar","markdownPath":"docs/components/bottom_bar.md","title":"Bottom Bar","blocks":[{"type":"heading","level":1,"text":"Bottom Bar","segments":[{"text":"Bottom Bar","style":"normal"}]},{"type":"paragraph","text":"The Bottom Bar component defines a fixed bottom navigation container with five action slots.","segments":[{"text":"The ","style":"normal"},{"text":"Bottom Bar","style":"bold"},{"text":" component defines a fixed bottom navigation container with five action slots.","style":"normal"}]},{"type":"heading","level":2,"text":"Overview","segments":[{"text":"Overview","style":"normal"}]},{"type":"paragraph","text":"In Figma, this component is defined as a COMPONENT (Bottom_Bar) without root variants or root component properties.","segments":[{"text":"In Figma, this component is defined as a ","style":"normal"},{"text":"COMPONENT","style":"code"},{"text":" (","style":"normal"},{"text":"Bottom_Bar","style":"code"},{"text":") without root variants or root component properties.","style":"normal"}]},{"type":"paragraph","text":"It contains five Bottom_Bar_Button instances arranged horizontally.","segments":[{"text":"It contains five ","style":"normal"},{"text":"Bottom_Bar_Button","style":"code"},{"text":" instances arranged horizontally.","style":"normal"}]},{"type":"paragraph","text":"Source: [Bottom_Bar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2064-65)","segments":[{"text":"Source: [Bottom_Bar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=2064-65)","style":"normal"}]},{"type":"heading","level":2,"text":"Anatomy","segments":[{"text":"Anatomy","style":"normal"}]},{"type":"paragraph","text":"Each bottom bar contains:","segments":[{"text":"Each bottom bar contains:","style":"normal"}]},{"type":"list","ordered":true,"items":[{"index":1,"text":"Container (COMPONENT, 440 x 80)","segments":[{"text":"Container","style":"bold"},{"text":" (","style":"normal"},{"text":"COMPONENT","style":"code"},{"text":", ","style":"normal"},{"text":"440 x 80","style":"code"},{"text":")","style":"normal"}]},{"index":2,"text":"Five button slots (Bottom_Bar_Button instances)","segments":[{"text":"Five button slots","style":"bold"},{"text":" (","style":"normal"},{"text":"Bottom_Bar_Button","style":"code"},{"text":" instances)","style":"normal"}]},{"index":3,"text":"Per-button icon slot (INSTANCE, default icon component)","segments":[{"text":"Per-button icon slot","style":"bold"},{"text":" (","style":"normal"},{"text":"INSTANCE","style":"code"},{"text":", default icon component)","style":"normal"}]},{"index":4,"text":"Per-button text label (TEXT, default Text)","segments":[{"text":"Per-button text label","style":"bold"},{"text":" (","style":"normal"},{"text":"TEXT","style":"code"},{"text":", default ","style":"normal"},{"text":"Text","style":"code"},{"text":")","style":"normal"}]}]},{"type":"heading","level":2,"text":"Component API","segments":[{"text":"Component API","style":"normal"}]},{"type":"paragraph","text":"The root Bottom_Bar component does not expose root-level component properties. Available properties are exposed by each nested Bottom_Bar_Button item.","segments":[{"text":"The root ","style":"normal"},{"text":"Bottom_Bar","style":"code"},{"text":" component does not expose root-level component properties. Available properties are exposed by each nested ","style":"normal"},{"text":"Bottom_Bar_Button","style":"code"},{"text":" item.","style":"normal"}]},{"type":"heading","level":3,"text":"Properties","segments":[{"text":"Properties","style":"normal"}]},{"type":"table","header":["Name","Type","Default","Required","Description"],"headerSegments":[[{"text":"Name","style":"normal"}],[{"text":"Type","style":"normal"}],[{"text":"Default","style":"normal"}],[{"text":"Required","style":"normal"}],[{"text":"Description","style":"normal"}]],"rows":[["Item.Change_Bottom_Bar_Button_Icon","INSTANCE_SWAP","default icon instance","TBD","Replaces the icon rendered in each button item."],["Item.Change_Text","TEXT","Text","TBD","Overrides the label text for each button item."],["Item.State","VARIANT","Default","true","Item visual state. Options: Default, Selected."]],"rowSegments":[[[{"text":"Item.Change_Bottom_Bar_Button_Icon","style":"code"}],[{"text":"INSTANCE_SWAP","style":"code"}],[{"text":"default icon instance","style":"code"}],[{"text":"TBD","style":"code"}],[{"text":"Replaces the icon rendered in each button item.","style":"normal"}]],[[{"text":"Item.Change_Text","style":"code"}],[{"text":"TEXT","style":"code"}],[{"text":"Text","style":"code"}],[{"text":"TBD","style":"code"}],[{"text":"Overrides the label text for each button item.","style":"normal"}]],[[{"text":"Item.State","style":"code"}],[{"text":"VARIANT","style":"code"}],[{"text":"Default","style":"code"}],[{"text":"true","style":"code"}],[{"text":"Item visual state. Options: ","style":"normal"},{"text":"Default","style":"code"},{"text":", ","style":"normal"},{"text":"Selected","style":"code"},{"text":".","style":"normal"}]]]},{"type":"heading","level":2,"text":"Visual Specifications","segments":[{"text":"Visual Specifications","style":"normal"}]},{"type":"heading","level":3,"text":"Container","segments":[{"text":"Container","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Node: COMPONENT","segments":[{"text":"Node","style":"bold"},{"text":": ","style":"normal"},{"text":"COMPONENT","style":"code"}]},{"text":"Size: 440 x 80","segments":[{"text":"Size","style":"bold"},{"text":": ","style":"normal"},{"text":"440 x 80","style":"code"}]},{"text":"Layout: Auto Layout, HORIZONTAL","segments":[{"text":"Layout","style":"bold"},{"text":": Auto Layout, ","style":"normal"},{"text":"HORIZONTAL","style":"code"}]},{"text":"Item spacing: 8","segments":[{"text":"Item spacing","style":"bold"},{"text":": ","style":"normal"},{"text":"8","style":"code"}]},{"text":"Padding: left 8, right 8, top 0, bottom 0","segments":[{"text":"Padding","style":"bold"},{"text":": ","style":"normal"},{"text":"left 8","style":"code"},{"text":", ","style":"normal"},{"text":"right 8","style":"code"},{"text":", ","style":"normal"},{"text":"top 0","style":"code"},{"text":", ","style":"normal"},{"text":"bottom 0","style":"code"}]},{"text":"Clips content: true","segments":[{"text":"Clips content","style":"bold"},{"text":": ","style":"normal"},{"text":"true","style":"code"}]},{"text":"Corner radius: 0","segments":[{"text":"Corner radius","style":"bold"},{"text":": ","style":"normal"},{"text":"0","style":"code"}]},{"text":"Fill: #ECECEC","segments":[{"text":"Fill","style":"bold"},{"text":": ","style":"normal"},{"text":"#ECECEC","style":"code"}]},{"text":"Effect: DROP_SHADOW (x=0, y=-18, blur=20, spread=-8, rgba(0,0,0,0.2))","segments":[{"text":"Effect","style":"bold"},{"text":": ","style":"normal"},{"text":"DROP_SHADOW","style":"code"},{"text":" (","style":"normal"},{"text":"x=0","style":"code"},{"text":", ","style":"normal"},{"text":"y=-18","style":"code"},{"text":", ","style":"normal"},{"text":"blur=20","style":"code"},{"text":", ","style":"normal"},{"text":"spread=-8","style":"code"},{"text":", ","style":"normal"},{"text":"rgba(0,0,0,0.2)","style":"code"},{"text":")","style":"normal"}]}]},{"type":"heading","level":3,"text":"Button slot (each of 5)","segments":[{"text":"Button slot (each of 5)","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Node: INSTANCE (Bottom_Bar_Button)","segments":[{"text":"Node","style":"bold"},{"text":": ","style":"normal"},{"text":"INSTANCE","style":"code"},{"text":" (","style":"normal"},{"text":"Bottom_Bar_Button","style":"code"},{"text":")","style":"normal"}]},{"text":"Size: 78.4 x 80","segments":[{"text":"Size","style":"bold"},{"text":": ","style":"normal"},{"text":"78.4 x 80","style":"code"}]},{"text":"Layout: Auto Layout, VERTICAL","segments":[{"text":"Layout","style":"bold"},{"text":": Auto Layout, ","style":"normal"},{"text":"VERTICAL","style":"code"}]},{"text":"Padding: 8 on all sides","segments":[{"text":"Padding","style":"bold"},{"text":": ","style":"normal"},{"text":"8","style":"code"},{"text":" on all sides","style":"normal"}]},{"text":"Corner radius: 8","segments":[{"text":"Corner radius","style":"bold"},{"text":": ","style":"normal"},{"text":"8","style":"code"}]},{"text":"Children:","segments":[{"text":"Children","style":"bold"},{"text":":","style":"normal"}]},{"text":"Icon container: 48 x 48","segments":[{"text":"Icon container: ","style":"normal"},{"text":"48 x 48","style":"code"}]},{"text":"Label text: Text at 12 / 16","segments":[{"text":"Label text: ","style":"normal"},{"text":"Text","style":"code"},{"text":" at ","style":"normal"},{"text":"12 / 16","style":"code"}]}]},{"type":"heading","level":3,"text":"Typography","segments":[{"text":"Typography","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Label font family: Nunito Sans","segments":[{"text":"Label font family","style":"bold"},{"text":": ","style":"normal"},{"text":"Nunito Sans","style":"code"}]},{"text":"Label weight: Regular","segments":[{"text":"Label weight","style":"bold"},{"text":": ","style":"normal"},{"text":"Regular","style":"code"}]},{"text":"Label size: 12","segments":[{"text":"Label size","style":"bold"},{"text":": ","style":"normal"},{"text":"12","style":"code"}]},{"text":"Label line height: 16","segments":[{"text":"Label line height","style":"bold"},{"text":": ","style":"normal"},{"text":"16","style":"code"}]},{"text":"Label color: Color/Text/Neutral/Default (#483F3F)","segments":[{"text":"Label color","style":"bold"},{"text":": ","style":"normal"},{"text":"Color/Text/Neutral/Default","style":"code"},{"text":" (","style":"normal"},{"text":"#483F3F","style":"code"},{"text":")","style":"normal"}]}]},{"type":"heading","level":3,"text":"Iconography","segments":[{"text":"Iconography","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Icon container size: 48 x 48","segments":[{"text":"Icon container size","style":"bold"},{"text":": ","style":"normal"},{"text":"48 x 48","style":"code"}]},{"text":"Icon color token: Color/Icon/Neutral/Default","segments":[{"text":"Icon color token","style":"bold"},{"text":": ","style":"normal"},{"text":"Color/Icon/Neutral/Default","style":"code"}]},{"text":"Icon fallback: #483F3F","segments":[{"text":"Icon fallback","style":"bold"},{"text":": ","style":"normal"},{"text":"#483F3F","style":"code"}]}]},{"type":"heading","level":3,"text":"Token Mapping","segments":[{"text":"Token Mapping","style":"normal"}]},{"type":"table","header":["Part","Condition","Token","Fallback"],"headerSegments":[[{"text":"Part","style":"normal"}],[{"text":"Condition","style":"normal"}],[{"text":"Token","style":"normal"}],[{"text":"Fallback","style":"normal"}]],"rows":[["item.padding","all items","Dimension/Spacing/400","8"],["item.radius","all items","Dimension/Border/Radius/200","8"],["item.icon-color","all items","Color/Icon/Neutral/Default","#483F3F"],["item.text-color","all items","Color/Text/Neutral/Default","#483F3F"],["item.label-font-family","all items","Font/Family/Body","Nunito Sans"],["item.label-font-size","all items","Font/Size/100","12"],["item.label-font-weight","all items","Font/Weight/Regular","regular"],["item.label-line-height","all items","Font/Line-Height/100","16"],["container.background","root container","TBD","#ECECEC"]],"rowSegments":[[[{"text":"item.padding","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Dimension/Spacing/400","style":"code"}],[{"text":"8","style":"code"}]],[[{"text":"item.radius","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Dimension/Border/Radius/200","style":"code"}],[{"text":"8","style":"code"}]],[[{"text":"item.icon-color","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Color/Icon/Neutral/Default","style":"code"}],[{"text":"#483F3F","style":"code"}]],[[{"text":"item.text-color","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Color/Text/Neutral/Default","style":"code"}],[{"text":"#483F3F","style":"code"}]],[[{"text":"item.label-font-family","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Font/Family/Body","style":"code"}],[{"text":"Nunito Sans","style":"code"}]],[[{"text":"item.label-font-size","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Font/Size/100","style":"code"}],[{"text":"12","style":"code"}]],[[{"text":"item.label-font-weight","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Font/Weight/Regular","style":"code"}],[{"text":"regular","style":"code"}]],[[{"text":"item.label-line-height","style":"code"}],[{"text":"all items","style":"normal"}],[{"text":"Font/Line-Height/100","style":"code"}],[{"text":"16","style":"code"}]],[[{"text":"container.background","style":"code"}],[{"text":"root container","style":"normal"}],[{"text":"TBD","style":"code"}],[{"text":"#ECECEC","style":"code"}]]]},{"type":"heading","level":2,"text":"Variants","segments":[{"text":"Variants","style":"normal"}]},{"type":"table","header":["Variant group","Variant name","Differentiating token(s)","Fallback value(s)","Visual indicator"],"headerSegments":[[{"text":"Variant group","style":"normal"}],[{"text":"Variant name","style":"normal"}],[{"text":"Differentiating token(s)","style":"normal"}],[{"text":"Fallback value(s)","style":"normal"}],[{"text":"Visual indicator","style":"normal"}]],"rows":[["Item.State","Default","TBD","TBD","Neutral, unselected item appearance"],["Item.State","Selected","TBD","TBD","Selected/active destination appearance"]],"rowSegments":[[[{"text":"Item.State","style":"code"}],[{"text":"Default","style":"code"}],[{"text":"TBD","style":"code"}],[{"text":"TBD","style":"code"}],[{"text":"Neutral, unselected item appearance","style":"normal"}]],[[{"text":"Item.State","style":"code"}],[{"text":"Selected","style":"code"}],[{"text":"TBD","style":"code"}],[{"text":"TBD","style":"code"}],[{"text":"Selected/active destination appearance","style":"normal"}]]]},{"type":"heading","level":2,"text":"States","segments":[{"text":"States","style":"normal"}]},{"type":"paragraph","text":"The root container has no independent interaction state. State behavior is controlled by each nested button item.","segments":[{"text":"The root container has no independent interaction state. State behavior is controlled by each nested button item.","style":"normal"}]},{"type":"table","header":["State","What changes visually","Tokens","Notes"],"headerSegments":[[{"text":"State","style":"normal"}],[{"text":"What changes visually","style":"normal"}],[{"text":"Tokens","style":"normal"}],[{"text":"Notes","style":"normal"}]],"rows":[["Default","Baseline item appearance","TBD","Defined by nested button variant"],["Selected","Active destination appearance","TBD","Defined by nested button variant"]],"rowSegments":[[[{"text":"Default","style":"code"}],[{"text":"Baseline item appearance","style":"normal"}],[{"text":"TBD","style":"code"}],[{"text":"Defined by nested button variant","style":"normal"}]],[[{"text":"Selected","style":"code"}],[{"text":"Active destination appearance","style":"normal"}],[{"text":"TBD","style":"code"}],[{"text":"Defined by nested button variant","style":"normal"}]]]},{"type":"heading","level":2,"text":"Usage Guidelines","segments":[{"text":"Usage Guidelines","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"When to use: Use as primary bottom navigation for mobile layouts with persistent destinations.","segments":[{"text":"When to use","style":"bold"},{"text":": Use as primary bottom navigation for mobile layouts with persistent destinations.","style":"normal"}]},{"text":"When not to use: Do not use as a contextual action toolbar or for transient feedback actions.","segments":[{"text":"When not to use","style":"bold"},{"text":": Do not use as a contextual action toolbar or for transient feedback actions.","style":"normal"}]},{"text":"Do: Keep a stable action count and order.","segments":[{"text":"Do","style":"bold"},{"text":": Keep a stable action count and order.","style":"normal"}]},{"text":"Do: Keep exactly one item in Selected state for the current destination.","segments":[{"text":"Do","style":"bold"},{"text":": Keep exactly one item in ","style":"normal"},{"text":"Selected","style":"code"},{"text":" state for the current destination.","style":"normal"}]},{"text":"Don't: Use long labels that wrap or clip in item cells.","segments":[{"text":"Don't","style":"bold"},{"text":": Use long labels that wrap or clip in item cells.","style":"normal"}]},{"text":"Don't: Mix unrelated action types in the same bar.","segments":[{"text":"Don't","style":"bold"},{"text":": Mix unrelated action types in the same bar.","style":"normal"}]}]},{"type":"heading","level":2,"text":"Content Guidelines","segments":[{"text":"Content Guidelines","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Use concise labels (prefer one short word or short phrase).","segments":[{"text":"Use concise labels (prefer one short word or short phrase).","style":"normal"}]},{"text":"Use sentence case or title case consistently across all items.","segments":[{"text":"Use sentence case or title case consistently across all items.","style":"normal"}]},{"text":"Keep labels semantically distinct to avoid ambiguous navigation choices.","segments":[{"text":"Keep labels semantically distinct to avoid ambiguous navigation choices.","style":"normal"}]}]},{"type":"heading","level":2,"text":"Accessibility","segments":[{"text":"Accessibility","style":"normal"}]},{"type":"heading","level":3,"text":"1. ARIA role and semantics","segments":[{"text":"1. ARIA role and semantics","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Expected container role: role=\"navigation\" (implementation-level, TBD pending audit).","segments":[{"text":"Expected container role: ","style":"normal"},{"text":"role=\"navigation\"","style":"code"},{"text":" (implementation-level, ","style":"normal"},{"text":"TBD","style":"code"},{"text":" pending audit).","style":"normal"}]},{"text":"Item semantics should be interactive controls (for example buttons/links) in implementation.","segments":[{"text":"Item semantics should be interactive controls (for example buttons/links) in implementation.","style":"normal"}]},{"text":"Required ARIA attributes for current implementation are TBD.","segments":[{"text":"Required ARIA attributes for current implementation are ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}]}]},{"type":"heading","level":3,"text":"2. Keyboard navigation","segments":[{"text":"2. Keyboard navigation","style":"normal"}]},{"type":"table","header":["Key","Action"],"headerSegments":[[{"text":"Key","style":"normal"}],[{"text":"Action","style":"normal"}]],"rows":[["Tab","Moves focus between interactive items"],["Enter","Activates focused item"],["Arrow keys","TBD (optional pattern, pending implementation decision)"]],"rowSegments":[[[{"text":"Tab","style":"code"}],[{"text":"Moves focus between interactive items","style":"normal"}]],[[{"text":"Enter","style":"code"}],[{"text":"Activates focused item","style":"normal"}]],[[{"text":"Arrow keys","style":"code"}],[{"text":"TBD","style":"code"},{"text":" (optional pattern, pending implementation decision)","style":"normal"}]]]},{"type":"heading","level":3,"text":"3. Focus management","segments":[{"text":"3. Focus management","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Focus order should follow visual item order from left to right.","segments":[{"text":"Focus order should follow visual item order from left to right.","style":"normal"}]},{"text":"No focus behavior is explicitly defined in Figma; implementation details are TBD.","segments":[{"text":"No focus behavior is explicitly defined in Figma; implementation details are ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}]},{"text":"Focus outline tokens should use Semantic.Color.Focus-Outline.Inner and Semantic.Color.Focus-Outline.Outer.","segments":[{"text":"Focus outline tokens should use ","style":"normal"},{"text":"Semantic.Color.Focus-Outline.Inner","style":"code"},{"text":" and ","style":"normal"},{"text":"Semantic.Color.Focus-Outline.Outer","style":"code"},{"text":".","style":"normal"}]}]},{"type":"heading","level":3,"text":"4. Labeling","segments":[{"text":"4. Labeling","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Each item label should be unique and meaningful.","segments":[{"text":"Each item label should be unique and meaningful.","style":"normal"}]},{"text":"Icon-only usage is not defined; if introduced, labeling strategy is TBD.","segments":[{"text":"Icon-only usage is not defined; if introduced, labeling strategy is ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}]},{"text":"aria-describedby usage is TBD.","segments":[{"text":"aria-describedby","style":"code"},{"text":" usage is ","style":"normal"},{"text":"TBD","style":"code"},{"text":".","style":"normal"}]}]},{"type":"heading","level":3,"text":"5. Contrast and visibility","segments":[{"text":"5. Contrast and visibility","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Selected vs non-selected states must remain distinguishable without relying on color alone.","segments":[{"text":"Selected vs non-selected states must remain distinguishable without relying on color alone.","style":"normal"}]},{"text":"Contrast verification is TBD (pending audit).","segments":[{"text":"Contrast verification is ","style":"normal"},{"text":"TBD (pending audit)","style":"code"},{"text":".","style":"normal"}]}]},{"type":"heading","level":3,"text":"Hit area requirements","segments":[{"text":"Hit area requirements","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Desktop minimum hit area token: A11y.A11y.modeDesktop.Dimension.Min-Hit-Area (TBD resolved value).","segments":[{"text":"Desktop minimum hit area token: ","style":"normal"},{"text":"A11y.A11y.modeDesktop.Dimension.Min-Hit-Area","style":"code"},{"text":" (","style":"normal"},{"text":"TBD","style":"code"},{"text":" resolved value).","style":"normal"}]},{"text":"Mobile minimum hit area token: A11y.A11y.modeMobile.Dimension.Min-Hit-Area (TBD resolved value).","segments":[{"text":"Mobile minimum hit area token: ","style":"normal"},{"text":"A11y.A11y.modeMobile.Dimension.Min-Hit-Area","style":"code"},{"text":" (","style":"normal"},{"text":"TBD","style":"code"},{"text":" resolved value).","style":"normal"}]}]},{"type":"heading","level":2,"text":"Related Components","segments":[{"text":"Related Components","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"[Status Bar](status_bar.md): Use together with bottom navigation in full mobile chrome compositions.","segments":[{"text":"[Status Bar](status_bar.md): Use together with bottom navigation in full mobile chrome compositions.","style":"normal"}]},{"text":"[Alert](alert.md): Use for contextual feedback, not for destination switching.","segments":[{"text":"[Alert](alert.md): Use for contextual feedback, not for destination switching.","style":"normal"}]}]},{"type":"heading","level":2,"text":"Design–Token Discrepancies","segments":[{"text":"Design–Token Discrepancies","style":"normal"}]},{"type":"table","header":["Discrepancy","Impact","Pending action","Status"],"headerSegments":[[{"text":"Discrepancy","style":"normal"}],[{"text":"Impact","style":"normal"}],[{"text":"Pending action","style":"normal"}],[{"text":"Status","style":"normal"}]],"rows":[["Container background is hardcoded as #ECECEC instead of using a semantic token.","Reduces token governance consistency and theme portability.","Map container background to a semantic token or document this as an accepted exception.","open"]],"rowSegments":[[[{"text":"Container background is hardcoded as ","style":"normal"},{"text":"#ECECEC","style":"code"},{"text":" instead of using a semantic token.","style":"normal"}],[{"text":"Reduces token governance consistency and theme portability.","style":"normal"}],[{"text":"Map container background to a semantic token or document this as an accepted exception.","style":"normal"}],[{"text":"open","style":"code"}]]]},{"type":"heading","level":2,"text":"Gaps / TBD","segments":[{"text":"Gaps / TBD","style":"normal"}]},{"type":"list","ordered":false,"items":[{"text":"Item-level token differences for Default vs Selected are TBD in current docs.","segments":[{"text":"Item-level token differences for ","style":"normal"},{"text":"Default","style":"code"},{"text":" vs ","style":"normal"},{"text":"Selected","style":"code"},{"text":" are ","style":"normal"},{"text":"TBD","style":"code"},{"text":" in current docs.","style":"normal"}]},{"text":"Root-level selected-index control is not exposed as a single property in this component.","segments":[{"text":"Root-level selected-index control is not exposed as a single property in this component.","style":"normal"}]},{"text":"No badge/counter slot is defined for notifications.","segments":[{"text":"No badge/counter slot is defined for notifications.","style":"normal"}]},{"text":"No documented dark-mode variant for the root container.","segments":[{"text":"No documented dark-mode variant for the root container.","style":"normal"}]},{"text":"No explicit overflow behavior is defined for long labels.","segments":[{"text":"No explicit overflow behavior is defined for long labels.","style":"normal"}]}]}],"stats":{"headings":25,"paragraphs":7,"lists":14,"tables":6,"codeBlocks":0}},"theme":{"name":"figma-doc-theme-karmap","status":"ready","description":"Render contract for converting markdown component docs into Figma documentation sections. Styled to match the Karmap / Iter design system visual identity: Lora headings, Nunito Sans body, cucumber-green accents on warm cream surfaces.\n","layout":{"target":{"section_name_pattern":"Doc/{component_name}","position":{"reference":"component_section","offset_x":200,"align_y":"top"}},"section":{"width":940,"min_height":1100},"canvas":{"inset":40,"width":860,"padding":{"top":32,"right":32,"bottom":32,"left":32},"item_spacing":20}},"theme":{"colors":{"page_bg":"#FFFAF0","section_border":"#C9E0BE","canvas_shadow":"#00000014","card_bg":"#FFFFFF","card_border":"#E7DDCF","table_header_bg":"#F5F0E6","title_text":"#495841","heading_text":"#495841","body_text":"#483F3F","muted_text":"#716666","chip_bg":"#E8F0E4","chip_border":"#C9E0BE","chip_text":"#495841","header_accent":"#C9E0BE"},"radii":{"canvas":20,"card":12,"chip":999,"header_accent":12},"strokes":{"section_border":1.5,"card_border":1,"chip_border":1},"spacing":{"card_padding":20,"card_gap":12,"chip_padding_v":5,"chip_padding_h":12,"chip_gap":8,"paragraph_gap":8,"list_gap":6,"header_accent_padding_v":16,"header_accent_padding_h":24},"typography":{"font_family":"Nunito Sans","font_family_heading":"Lora","font_family_mono":"Roboto Mono","h1":{"font_family":"Lora","size":36,"line_height":42,"weight":"Bold","color":"title_text"},"h2":{"font_family":"Lora","size":20,"line_height":26,"weight":"Bold","color":"heading_text"},"h3":{"size":16,"line_height":24,"weight":"SemiBold","color":"heading_text"},"body":{"size":15,"line_height":24,"weight":"Regular","color":"body_text"},"body_small":{"size":13,"line_height":18,"weight":"SemiBold","color":"chip_text"}}},"markdown_mapping":{"document":{"wrapper":"canvas"},"title":{"component":"header_block","text_style":"h1"},"subtitle":{"component":"intro_text","text_style":"body","color_override":"muted_text"},"heading_2":{"component":"card","title_style":"h2"},"heading_3":{"component":"inline_heading","text_style":"h3"},"paragraph":{"component":"text","text_style":"body"},"unordered_list":{"component":"stack","item_gap":"list_gap"},"ordered_list":{"component":"stack","item_gap":"list_gap"},"list_item":{"component":"text","text_style":"body"},"table":{"component":"table_card","header_style":"h3","cell_style":"body","border_color":"card_border","header_bg":"table_header_bg"},"code_inline":{"component":"text","text_style":"body","color_override":"heading_text"}},"components":{"header_block":{"layout":"vertical","stretch":true,"item_spacing":8,"accent":{"enabled":true,"fills":{"color":"header_accent"},"radius":12,"padding":{"top":16,"right":24,"bottom":16,"left":24}}},"chips_row":{"layout":"horizontal","stretch":true,"item_spacing":8},"card":{"layout":"vertical","stretch":true,"width":796,"padding":{"top":20,"right":20,"bottom":20,"left":20},"item_spacing":12,"fills":{"color":"card_bg"},"strokes":{"color":"card_border","weight":1},"radius":12},"table_card":{"extends":"card","table":{"cell_padding_v":8,"cell_padding_h":10,"row_gap":0,"column_gap":0,"border_weight":1,"header_bg":"table_header_bg"}}},"rules":["Keep one visual card per H2 section.","Render markdown in source order; do not reorder content blocks.","Preserve semantic spacing and hierarchy from heading levels.","Avoid hardcoded widths for text nodes; use stretch behavior when possible.","If a markdown element is unsupported, render it as body text and flag it in report.","Use Lora for h1 and h2 headings; Nunito Sans for everything else.","Table header rows use a tinted background to distinguish from body rows.","The header accent block wraps the title area with a brand-colored background."],"output_contract":{"report_fields":["markdown_path","target_section_id","theme_name","offset_x_applied","unsupported_blocks"]}},"options":{"componentName":"bottom_bar","componentSetNodeId":null}};

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

    try {
      if (segment.style === "bold_italic") {
        node.setRangeFontName(offset, end, { family, style: "Bold Italic" });
      } else if (segment.style === "bold") {
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

