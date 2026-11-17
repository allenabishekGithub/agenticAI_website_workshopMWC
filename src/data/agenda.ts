export interface AgendaStep {
  /** Minutes lasts this part */
  minutes: number;
  text: string;
}

export interface AgendaItem {
  /** Total minutes of tranche */
  minutes: number;
  kind: 'intro' | 'bloque' | 'break' | 'cierre';
  /** Block number (solo in blocks) */
  block?: number;
  title: string;
  description: string;
  /** Breakdown of the section: explanation, live code, challenge. */
  steps?: AgendaStep[];
  /** Slug of the associated challenge */
  reto?: string;
}

/** Start time of workshop (15:00) in minutes from midnight */
export const START = 15 * 60;

export const agenda: AgendaItem[] = [
  {
    minutes: 10,
    kind: 'intro',
    title: 'Welcome and development',
    description: 'What we\'re going to build, clone the repository and check that the token of the APIs works.',
  },
  {
    minutes: 40,
    kind: 'bloque',
    block: 1,
    title: 'MCP UI',
    description:
      'We create a MCP server with the results of LaLiga, add an interactive interface that is displayed inside the chat and then do the same with the store.',
    steps: [
      { minutes: 5, text: 'Explanation: MCP in 5 minutes' },
      { minutes: 7, text: 'Live: a MCP server with the results of LaLiga' },
      { minutes: 4, text: 'Explanation: MCP Apps, the tool brings its interface' },
      { minutes: 6, text: 'Live: LaLiga rating with interface' },
      { minutes: 18, text: 'Challenge 1: the catalog of the store inside chat' },
    ],
    reto: '01-mcp-ui',
  },
  {
    minutes: 35,
    kind: 'bloque',
    block: 2,
    title: 'WebMCP',
    description:
      'We make the store display its features as tools for browser agents.',
    steps: [
      { minutes: 10, text: 'Explanation: From reading the screen to calling tools' },
      { minutes: 8, text: 'Live: Register the first tool' },
      { minutes: 17, text: 'Challenge 2: Search, add to cart and view cart' },
    ],
    reto: '02-webmcp',
  },
  {
    minutes: 10,
    kind: 'descanso',
    title: 'Break',
    description: 'Coffee, doubts and time to catch up.',
  },
  {
    minutes: 30,
    kind: 'bloque',
    block: 3,
    title: 'Jev',
    description:
      'Quick and structured decisions (choose, rate, yes/no) that the code consumes without interpreting text.',
    steps: [
      { minutes: 8, text: 'Explanation: "Past, " and "Noul"' },
      { minutes: 7, text: 'Live: the first decision' },
      { minutes: 15, text: 'Challenge 3: Smart Search and Moderation of Reviews' },
    ],
    reto: '03-jev',
  },
  {
    minutes: 35,
    kind: 'bloque',
    block: 4,
    title: 'Local AI on the web',
    description:
      'We run models in the browser with built-in IA APIs and WebGPU: private, free of charge per request and offline.',
    steps: [
      { minutes: 10, text: 'Explanation: APIs integrated, WebGPU and limitations' },
      { minutes: 8, text: 'Live: summarize in the browser' },
      { minutes: 17, text: 'Challenge 4: summary of reviews in local' },
    ],
    reto: '04-ia-local',
  },
  {
    minutes: 10,
    kind: 'cierre',
    title: 'The four pieces together',
    description: 'We review the complete application and criteria for deciding when to use each piece.',
  },
  {
    minutes: 10,
    kind: 'cierre',
    title: 'Questions',
    description: 'Final doubts, follow-up resources and valuation survey.',
  },
];

const format = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/** Schedule with start and end time of each stage already calculated */
export const schedule = agenda.map((item, index) => {
  const offset = agenda.slice(0, index).reduce((sum, { minutes }) => sum + minutes, 0);
  return { ...item, start: format(START + offset), end: format(START + offset + item.minutes) };
});
