// Mermaid's own guard counts UTF-16 units; our public limit counts codepoints.
// At most two units/codepoint, with a separate explicit 50,000-point guard.
export const mermaidConfig={startOnLoad:false,securityLevel:'strict',htmlLabels:false,suppressErrorRendering:true,flowchart:{htmlLabels:false,useMaxWidth:false,wrappingWidth:10000},themeVariables:{fontFamily:'sans-serif'},maxTextSize:100000};
