import type { Garment, ProductListing, RenderResult } from './schema';

function abortError() { return new DOMException('Example presentation cancelled', 'AbortError'); }
function assertActive(signal: AbortSignal) { if (signal.aborted) throw abortError(); }

/** Presentation pacing is independent of HTTP/image caches and actual work time. */
export async function presentAfter<T>(load: () => Promise<T>, milliseconds: number, signal: AbortSignal): Promise<T> {
  assertActive(signal);
  const timerController = new AbortController();
  const abort = () => timerController.abort();
  signal.addEventListener('abort', abort, { once: true });
  const minimum = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    timerController.signal.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()); }, { once: true });
  });
  try {
    const [result] = await Promise.all([load(), minimum]);
    assertActive(signal); return result;
  } finally {
    signal.removeEventListener('abort', abort); timerController.abort();
  }
}

type ExampleJourney = {
  signal: AbortSignal;
  timing: { analysis: number; searchBatch: number; render: number };
  analyze: () => Promise<Garment[]>;
  search: (garment: Garment) => Promise<ProductListing[]>;
  render: (garments: Garment[], selected: Record<string, string>) => Promise<RenderResult>;
  identified: (garments: Garment[]) => void;
  searchStarted: (garment: Garment) => void;
  matched: (garment: Garment, products: ProductListing[]) => void;
  rendering: () => void;
  completed: (result: RenderResult) => void;
};

/** Pass the returned matches directly to rendering, never a previous React closure. */
export async function runExampleJourney(journey: ExampleJourney) {
  const { signal, timing } = journey;
  const garments = await presentAfter(journey.analyze, timing.analysis, signal);
  journey.identified(garments);
  const selected: Record<string, string> = {};
  for (let i = 0; i < garments.length; i += 2) {
    await Promise.all(garments.slice(i, i + 2).map(async garment => {
      assertActive(signal); journey.searchStarted(garment);
      const products = await presentAfter(() => journey.search(garment), timing.searchBatch, signal);
      if (!products[0]) throw new Error(`The example has no sample match for ${garment.name}. Replay the example to restore it.`);
      selected[garment.id] = products[0].id; journey.matched(garment, products);
    }));
  }
  assertActive(signal); journey.rendering();
  const result = await presentAfter(() => journey.render(garments, selected), timing.render, signal);
  journey.completed(result);
}
