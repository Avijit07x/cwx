interface ProbeContext {
  getExtension(name: 'WEBGL_lose_context'): { loseContext(): void } | null;
}

interface ProbeCanvas {
  getContext(type: 'webgl2'): ProbeContext | null;
}

function createCanvas(): ProbeCanvas {
  return document.createElement('canvas');
}

export function isWebGLAvailable(create: () => ProbeCanvas = createCanvas): boolean {
  try {
    const canvas = create();
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function watchContextLoss(canvas: EventTarget, onLost: () => void): () => void {
  const handleLost = (event: Event) => {
    event.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', handleLost);
  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost);
  };
}
