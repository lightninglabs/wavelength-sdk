/** Brand-aligned Mermaid theme variables (used with theme: 'base'). */
export const mermaidThemeVariables = {
  fontFamily: 'Inter, sans-serif',
  fontSize: '16px',
  primaryColor: '#2c2c33',
  primaryTextColor: '#f5f5f7',
  primaryBorderColor: '#15e0c2',
  secondaryColor: '#24242a',
  secondaryTextColor: '#f5f5f7',
  secondaryBorderColor: '#a78bfa',
  tertiaryColor: '#1c1c21',
  tertiaryTextColor: '#b6b6c0',
  tertiaryBorderColor: '#56c7f2',
  lineColor: '#8c8c96',
  textColor: '#f5f5f7',
  mainBkg: '#2c2c33',
  nodeBorder: '#303037',
  clusterBkg: '#1c1c21',
  clusterBorder: '#303037',
  titleColor: '#b6b6c0',
  edgeLabelBackground: '#24242a',
  edgeLabelTextColor: '#f5f5f7',
  nodeTextColor: '#f5f5f7',
  rectBorderRadius: '10px',
  clusterBorderRadius: '12px',
};

/** Prepended to every diagram so spacing and label mode stay consistent. */
export const mermaidInitDirective = `%%{init: ${JSON.stringify({
  theme: 'base',
  themeVariables: mermaidThemeVariables,
  flowchart: {
    htmlLabels: false,
    curve: 'basis',
    padding: 20,
    nodeSpacing: 55,
    rankSpacing: 60,
    diagramPadding: 12,
    useMaxWidth: false,
  },
})}}%%`;

/** Shared node styles: pill-friendly fills with accent strokes. */
export const mermaidClassDefs = `
  classDef lime fill:#2c2c33,stroke:#c9f000,stroke-width:2px,color:#f5f5f7
  classDef teal fill:#2c2c33,stroke:#15e0c2,stroke-width:2px,color:#f5f5f7
  classDef violet fill:#2c2c33,stroke:#a78bfa,stroke-width:2px,color:#f5f5f7
  classDef sky fill:#2c2c33,stroke:#56c7f2,stroke-width:2px,color:#f5f5f7
  classDef orange fill:#2c2c33,stroke:#ffa733,stroke-width:2px,color:#f5f5f7
  classDef muted fill:#1c1c21,stroke:#44444d,stroke-width:1.5px,color:#e8e8ed
`;
