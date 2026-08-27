export const PROJECT_VERSION = 2;

export function createProject(overrides = {}) {
  return {
    version: PROJECT_VERSION,
    id: crypto.randomUUID(),
    canvas: { width: 1000, height: 680 },
    background: {
      sourceName: null,
      fit: 'contain',
      opacity: 1,
    },
    textBlocks: [],
    freeGlyphs: [],
    ...overrides,
  };
}

export function createTextBlock(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'text-block',
    x: 80,
    y: 80,
    width: 520,
    rotation: 0,
    text: '',
    fontSize: 58,
    lineHeight: 1.5,
    letterSpacing: 0,
    align: 'left',
    color: '#161616',
    thickness: 0.3,
    penStyle: 'gel',
    warpStrength: 0.018,
    diversity: 0.65,
    glyphs: [],
    ...overrides,
  };
}

export function createGlyphInstance(char = '', overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'glyph',
    char,
    glyphIndex: 0,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    fontSize: 58,
    color: '#161616',
    thickness: 0.3,
    variantSeed: 0,
    warpStrength: 0.018,
    instanceBias: 0,
    ...overrides,
  };
}

export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json) {
  const project = JSON.parse(json);
  if (!project || typeof project !== 'object') throw new Error('Invalid HandWriter project');
  if (project.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported HandWriter project version: ${project.version ?? 'unknown'}`);
  }
  return project;
}
